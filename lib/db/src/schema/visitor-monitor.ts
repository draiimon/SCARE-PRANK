import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const visitsTable = pgTable("visitor_visits", {
  id: serial("id").primaryKey(),
  visitorId: text("visitor_id").notNull(),
  ipAddress: text("ip_address").notNull(),
  path: text("path").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  device: text("device").notNull().default("Unknown"),
  browser: text("browser").notNull().default("Unknown"),
  os: text("os").notNull().default("Unknown"),
  referrer: text("referrer"),
  screenSize: text("screen_size"),
  timezone: text("timezone"),
  language: text("language"),
  country: text("country"),
  region: text("region"),
  city: text("city"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  isp: text("isp"),
});

export const blocksTable = pgTable(
  "visitor_blocks",
  {
    id: serial("id").primaryKey(),
    ip: text("ip").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ipUnique: uniqueIndex("visitor_blocks_ip_unique").on(table.ip),
  }),
);

export const insertVisitSchema = createInsertSchema(visitsTable).omit({ id: true, timestamp: true });
export const insertBlockSchema = createInsertSchema(blocksTable).omit({ id: true, createdAt: true });

export type InsertVisit = z.infer<typeof insertVisitSchema>;
export type Visit = typeof visitsTable.$inferSelect;
export type Block = typeof blocksTable.$inferSelect;