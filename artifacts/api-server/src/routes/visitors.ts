import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { isIP } from "node:net";
import { db, blocksTable, visitsTable } from "@workspace/db";
import {
  CreateBlockBody,
  GetVisitorParams,
  ListVisitorsQueryParams,
  RecordVisitBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function adminGuard(req: Request, res: Response, next: NextFunction) {
  const configured = (process.env.ADMIN_PASSWORD ?? process.env.SESSION_SECRET)?.trim();
  const supplied = req.get("x-admin-token")?.trim();
  if (!configured || !supplied || supplied !== configured) {
    res.status(401).json({ error: "Admin access required" });
    return;
  }
  next();
}

function normalizeIp(value: string | undefined) {
  const ip = value?.trim().replace(/^for=/i, "").replace(/^"|"$/g, "");
  if (!ip) return undefined;
  if (ip.startsWith("[") && ip.includes("]")) return ip.slice(1, ip.indexOf("]"));
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

function getIp(req: Request) {
  const forwarded = req.get("x-forwarded-for")?.split(",")[0];
  const forwardedHeader = req.get("forwarded")?.split(",")[0]?.split(";").find((part) => part.trim().toLowerCase().startsWith("for="))?.split("=")[1];
  const candidates = [
    // Render and Replit pass the public visitor address through their trusted
    // proxy headers. Express can otherwise expose the platform's private hop.
    forwarded,
    forwardedHeader,
    req.get("cf-connecting-ip"),
    req.get("true-client-ip"),
    req.get("x-real-ip"),
    req.ip,
    req.socket.remoteAddress,
  ];
  return candidates.map(normalizeIp).find(Boolean) ?? "unknown";
}

function parseAgent(userAgent: string | null | undefined) {
  const ua = userAgent ?? "";
  const browser = /SamsungBrowser\//.test(ua)
    ? "Samsung Internet"
    : /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Unknown";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown";
  const device = /Mobile|Android|iPhone|iPad/.test(ua) ? "Mobile" : "Desktop";
  return { browser, os, device };
}

type IpLocation = {
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: string | null;
  longitude: string | null;
  isp: string | null;
};

const locationCache = new Map<string, { expiresAt: number; value: IpLocation | null }>();
const locationRequests = new Map<string, Promise<IpLocation | null>>();
const GEO_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function isLocalOrReservedIp(ip: string) {
  if (!ip || ip === "unknown" || isIP(ip) === 0) return true;
  if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip) || ip.startsWith("169.254.") || ip.startsWith("100.64.")) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:")) return true;
  return false;
}

function toLocation(data: {
  country?: string | null;
  country_name?: string | null;
  region?: string | null;
  regionName?: string | null;
  city?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  isp?: string | null;
  org?: string | null;
  connection?: { isp?: string; org?: string };
}) {
  return {
    country: data.country ?? data.country_name ?? null,
    region: data.region ?? data.regionName ?? null,
    city: data.city ?? null,
    latitude: data.latitude == null ? null : String(data.latitude),
    longitude: data.longitude == null ? null : String(data.longitude),
    isp: data.isp ?? data.connection?.isp ?? data.org ?? data.connection?.org ?? null,
  };
}

async function resolveIpLocation(ip: string) {
  if (isLocalOrReservedIp(ip)) return null;

  const cached = locationCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = locationRequests.get(ip);
  if (pending) return pending;

  const request = (async (): Promise<IpLocation | null> => {
    try {
      const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
        signal: AbortSignal.timeout(1800),
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        const data = await response.json() as { success?: boolean } & Parameters<typeof toLocation>[0];
        if (data.success !== false && (data.country || data.city || data.latitude != null)) return toLocation(data);
      }
    } catch {
      // Fall through to the secondary provider.
    }

    try {
      const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
        signal: AbortSignal.timeout(1800),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return null;
      const data = await response.json() as { error?: boolean } & Parameters<typeof toLocation>[0];
      return data.error ? null : toLocation(data);
    } catch {
      return null;
    }
  })();

  locationRequests.set(ip, request);
  try {
    const value = await request;
    locationCache.set(ip, { expiresAt: Date.now() + GEO_CACHE_TTL_MS, value });
    return value;
  } finally {
    locationRequests.delete(ip);
  }
}

async function enrichMissingLocations() {
  const rows = await db
    .select({ ipAddress: visitsTable.ipAddress })
    .from(visitsTable)
    .where(isNull(visitsTable.country))
    .groupBy(visitsTable.ipAddress)
    .limit(12);
  await Promise.all(rows.map(async ({ ipAddress }) => {
    const location = await resolveIpLocation(ipAddress);
    if (!location) return;
    await db.update(visitsTable).set(location).where(and(eq(visitsTable.ipAddress, ipAddress), isNull(visitsTable.country)));
  }));
}

router.post("/visits", async (req, res) => {
  const parsed = RecordVisitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid visit payload" });
    return;
  }
  const blocked = await db
    .select({ ip: blocksTable.ip })
    .from(blocksTable)
    .where(eq(blocksTable.ip, getIp(req)))
    .limit(1);
  if (blocked.length) {
    res.status(403).json({ error: "Access blocked" });
    return;
  }
  const data = parsed.data;
  const agent = parseAgent(data.userAgent);
  const location = await resolveIpLocation(getIp(req));
  const [visit] = await db
    .insert(visitsTable)
    .values({
      visitorId: data.visitorId,
      ipAddress: getIp(req),
      path: data.path,
      device: agent.device,
      browser: agent.browser,
      os: agent.os,
      referrer: data.referrer ?? null,
      screenSize: data.screenSize ?? null,
      timezone: data.timezone ?? null,
      language: data.language ?? null,
      ...location,
    })
    .returning();
  res.status(201).json(visit);
});

router.get("/dashboard", adminGuard, async (_req, res) => {
  await enrichMissingLocations();
  const [totals] = await db
    .select({
      totalVisits: sql<number>`count(*)`,
      uniqueVisitors: sql<number>`count(distinct ${visitsTable.visitorId})`,
    })
    .from(visitsTable);
  const [repeat] = await db
    .select({ count: sql<number>`count(*)` })
    .from(
      db
        .select({ visitorId: visitsTable.visitorId })
        .from(visitsTable)
        .groupBy(visitsTable.visitorId)
        .having(sql`count(*) > 1`)
        .as("repeat_visitors"),
    );
  const [blocked] = await db.select({ count: sql<number>`count(*)` }).from(blocksTable);
  const recentActivity = await db.select().from(visitsTable).orderBy(desc(visitsTable.timestamp)).limit(12);
  const dailyVisits = await db
    .select({
      date: sql<string>`to_char(date_trunc('day', ${visitsTable.timestamp}), 'YYYY-MM-DD')`,
      visits: sql<number>`count(*)`,
    })
    .from(visitsTable)
    .groupBy(sql`date_trunc('day', ${visitsTable.timestamp})`)
    .orderBy(sql`date_trunc('day', ${visitsTable.timestamp})`);
  res.json({
    totalVisits: Number(totals?.totalVisits ?? 0),
    uniqueVisitors: Number(totals?.uniqueVisitors ?? 0),
    repeatVisitors: Number(repeat?.count ?? 0),
    blockedIps: Number(blocked?.count ?? 0),
    recentActivity,
    dailyVisits: dailyVisits.map((item) => ({ ...item, visits: Number(item.visits) })),
  });
});

router.get("/visitors", adminGuard, async (req, res) => {
  await enrichMissingLocations();
  const parsed = ListVisitorsQueryParams.safeParse(req.query);
  const search = parsed.success ? parsed.data.search : undefined;
  const rows = await db
    .select({
      visitorId: visitsTable.visitorId,
      ipAddress: visitsTable.ipAddress,
      firstSeen: sql<Date>`min(${visitsTable.timestamp})`,
      lastSeen: sql<Date>`max(${visitsTable.timestamp})`,
      visits: sql<number>`count(*)`,
      device: sql<string>`(array_agg(${visitsTable.device} order by ${visitsTable.timestamp} desc))[1]`,
      browser: sql<string>`(array_agg(${visitsTable.browser} order by ${visitsTable.timestamp} desc))[1]`,
      os: sql<string>`(array_agg(${visitsTable.os} order by ${visitsTable.timestamp} desc))[1]`,
      location: sql<string>`coalesce(nullif(concat_ws(', ', max(${visitsTable.city}), max(${visitsTable.region}), max(${visitsTable.country})), ''), 'Network-level estimate')`,
      country: sql<string | null>`max(${visitsTable.country})`,
      region: sql<string | null>`max(${visitsTable.region})`,
      city: sql<string | null>`max(${visitsTable.city})`,
      latitude: sql<string | null>`max(${visitsTable.latitude})`,
      longitude: sql<string | null>`max(${visitsTable.longitude})`,
      isp: sql<string | null>`max(${visitsTable.isp})`,
      isBlocked: sql<boolean>`exists (select 1 from visitor_blocks b where b.ip = max(${visitsTable.ipAddress}))`,
    })
    .from(visitsTable)
    .where(search ? or(ilike(visitsTable.ipAddress, `%${search}%`), ilike(visitsTable.visitorId, `%${search}%`)) : undefined)
    .groupBy(visitsTable.visitorId, visitsTable.ipAddress)
    .orderBy(desc(sql`max(${visitsTable.timestamp})`));
  res.json(rows.map((row) => ({ ...row, visits: Number(row.visits) })));
});

router.get("/visitors/:visitorId", adminGuard, async (req, res) => {
  await enrichMissingLocations();
  const parsed = GetVisitorParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid visitor id" });
    return;
  }
  const activity = await db
    .select()
    .from(visitsTable)
    .where(eq(visitsTable.visitorId, parsed.data.visitorId))
    .orderBy(desc(visitsTable.timestamp));
  if (!activity.length) {
    res.status(404).json({ error: "Visitor not found" });
    return;
  }
  const first = activity[activity.length - 1];
  res.json({
    visitor: {
      visitorId: first.visitorId,
      ipAddress: first.ipAddress,
      firstSeen: first.timestamp,
      lastSeen: activity[0].timestamp,
      visits: activity.length,
      device: activity[0].device,
      browser: activity[0].browser,
      os: activity[0].os,
       location: [activity[0].city, activity[0].region, activity[0].country].filter(Boolean).join(", ") || "Network-level estimate",
       country: activity[0].country,
       region: activity[0].region,
       city: activity[0].city,
       latitude: activity[0].latitude,
       longitude: activity[0].longitude,
       isp: activity[0].isp,
       isBlocked: (await db.select().from(blocksTable).where(eq(blocksTable.ip, activity[0].ipAddress)).limit(1)).length > 0,
    },
    activity,
  });
});

router.post("/blocks", adminGuard, async (req, res) => {
  const parsed = CreateBlockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid IP address" });
    return;
  }
  const [block] = await db.insert(blocksTable).values({ ip: parsed.data.ip }).onConflictDoNothing().returning();
  res.status(201).json(block ?? { ip: parsed.data.ip, createdAt: new Date() });
});

router.delete("/blocks", adminGuard, async (req, res) => {
  const ip = String(req.query.ip ?? "");
  if (!ip) {
    res.status(400).json({ error: "IP is required" });
    return;
  }
  await db.delete(blocksTable).where(eq(blocksTable.ip, ip));
  res.status(204).send();
});

export default router;