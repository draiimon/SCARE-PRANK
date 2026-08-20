import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Activity, ArrowLeft, KeyRound, LogOut, Search } from "lucide-react";
import {
  getGetVisitorQueryKey,
  useGetDashboard,
  useGetVisitor,
  useHealthCheck,
  useListVisitors,
} from "@workspace/api-client-react";

type RequestOptions = { headers: { "x-admin-token": string } };

function isUnauthorized(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error &&
    (error as { status?: unknown }).status === 401;
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function AccessScreen({ onAccess }: { onAccess: (token: string) => void }) {
  const [value, setValue] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) onAccess(value.trim());
  };
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5ed] p-6 text-[#183438]">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-[#d4ddd3] bg-[#fbfaf5] p-8 shadow-lg">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-xs text-[#527074]">
          <ArrowLeft size={14} /> Back to site
        </Link>
        <div className="flex size-11 items-center justify-center rounded-xl bg-[#183438] text-[#a8e6c6]">
          <KeyRound size={20} />
        </div>
        <h1 className="mt-5 text-3xl font-semibold">Visitor tracking</h1>
        <p className="mt-2 text-sm text-[#607875]">Enter the owner token to view visits and recorded IP addresses.</p>
        <input
          id="admin-token"
          data-testid="input-admin-token"
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Owner token"
          className="mt-6 h-11 w-full rounded-lg border border-[#cbd9cf] bg-[#f6f5ed] px-3 text-sm"
        />
        <button type="submit" data-testid="button-enter-dashboard" className="mt-4 h-11 w-full rounded-lg bg-[#3d8c70] text-sm font-bold text-white">
          Open tracker
        </button>
      </form>
    </main>
  );
}

export function AdminDashboard() {
  const [token, setToken] = useState<string | null>(() => window.sessionStorage.getItem("x-admin-token"));
  if (!token) {
    return <AccessScreen onAccess={(next) => { window.sessionStorage.setItem("x-admin-token", next); setToken(next); }} />;
  }
  return <TrackingView token={token} onLogout={() => { window.sessionStorage.removeItem("x-admin-token"); setToken(null); }} />;
}

function TrackingView({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const request = useMemo<RequestOptions>(() => ({ headers: { "x-admin-token": token } }), [token]);
  const dashboard = useGetDashboard({ request });
  const visitors = useListVisitors(search ? { search } : undefined, { request });
  const detail = useGetVisitor(selectedId ?? "", { query: { enabled: !!selectedId, queryKey: getGetVisitorQueryKey(selectedId ?? "") }, request });
  const health = useHealthCheck({ request });
  const unauthorized = isUnauthorized(dashboard.error) || isUnauthorized(visitors.error) || isUnauthorized(detail.error);

  useEffect(() => {
    if (unauthorized) {
      window.sessionStorage.removeItem("x-admin-token");
      onLogout();
    }
  }, [onLogout, unauthorized]);

  return (
    <main className="min-h-screen bg-[#f3f2e9] p-5 text-[#183438] sm:p-8">
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-[#d9ddd3] pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#4f8171]">Visitor tracking</p>
          <h1 className="mt-2 text-3xl font-semibold">Visits and IP addresses</h1>
          <p className="mt-1 text-sm text-[#71847e]">Tracker status: {health.isSuccess ? "online" : "checking"}</p>
        </div>
        <button type="button" onClick={onLogout} className="flex items-center gap-2 text-sm text-[#607875]"><LogOut size={15} /> Sign out</button>
      </header>

      <section className="mx-auto mt-6 grid max-w-6xl gap-4 sm:grid-cols-3">
        <Stat label="Total visits" value={dashboard.data?.totalVisits} />
        <Stat label="Unique visitors" value={dashboard.data?.uniqueVisitors} />
        <Stat label="Repeat visitors" value={dashboard.data?.repeatVisitors} />
      </section>

      <section className="mx-auto mt-6 grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-2xl border border-[#d9ddd3] bg-[#fbfaf5] p-5">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-widest text-[#71847e]">Recent visits</p><h2 className="mt-1 text-xl font-semibold">Latest tracking activity</h2></div>
            <Activity size={19} className="text-[#3d8c70]" />
          </div>
          <div className="mt-4 divide-y divide-[#e5e5dc]">
            {dashboard.data?.recentActivity?.length ? dashboard.data.recentActivity.map((visit) => (
              <button type="button" key={visit.id} onClick={() => setSelectedId(visit.visitorId)} className="flex w-full items-center justify-between gap-4 py-3 text-left hover:bg-[#f1f6ee]">
                <span className="min-w-0"><span className="block truncate text-sm">{visit.path}</span><span className="block text-xs text-[#71847e]">{visit.ipAddress} · {visit.browser}</span></span>
                <span className="shrink-0 text-xs text-[#71847e]">{formatDate(visit.timestamp)}</span>
              </button>
            )) : <p className="py-10 text-center text-sm text-[#71847e]">No visits recorded yet.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-[#d9ddd3] bg-[#fbfaf5] p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#71847e]">Visitors</p>
          <h2 className="mt-1 text-xl font-semibold">Search by ID or IP</h2>
          <div className="relative mt-4">
            <Search size={15} className="absolute left-3 top-3 text-[#71847e]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Visitor ID or IP address" className="h-10 w-full rounded-lg border border-[#d5dcd3] bg-[#f5f4ec] pl-9 pr-3 text-sm" />
          </div>
          <div className="mt-3 divide-y divide-[#e5e5dc]">
            {visitors.data?.length ? visitors.data.map((visitor) => (
              <button type="button" key={visitor.visitorId} onClick={() => setSelectedId(visitor.visitorId)} className="flex w-full justify-between gap-3 py-3 text-left">
                <span className="truncate text-sm">{visitor.visitorId}</span><span className="shrink-0 text-xs text-[#3d8c70]">{visitor.ipAddress}</span>
              </button>
            )) : <p className="py-8 text-center text-sm text-[#71847e]">No matching visitors.</p>}
          </div>
        </div>
      </section>

      {selectedId && <div className="fixed inset-0 z-20 flex justify-end bg-[#183438]/30" onClick={() => setSelectedId(null)}>
        <section className="h-full w-full max-w-lg overflow-y-auto bg-[#fbfaf5] p-6" onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => setSelectedId(null)} className="float-right text-sm text-[#607875]">Close</button>
          {detail.data?.visitor ? <><p className="pt-8 text-xs font-bold uppercase tracking-widest text-[#71847e]">Visitor information</p><h2 className="mt-2 font-mono text-2xl">{detail.data.visitor.ipAddress}</h2><p className="mt-2 text-sm text-[#71847e]">{detail.data.visitor.visits} visits · first seen {formatDate(detail.data.visitor.firstSeen)}</p><div className="mt-6 grid grid-cols-2 gap-3">{[["Location", [detail.data.visitor.city, detail.data.visitor.region, detail.data.visitor.country].filter(Boolean).join(", ") || "Not available"], ["ISP", detail.data.visitor.isp || "Not available"], ["Coordinates", detail.data.visitor.latitude && detail.data.visitor.longitude ? `${detail.data.visitor.latitude}, ${detail.data.visitor.longitude}` : "Not available"], ["Device", detail.data.visitor.device], ["Browser", detail.data.visitor.browser], ["Operating system", detail.data.visitor.os || "Not available"]].map(([label, value]) => <div key={label} className="rounded-lg bg-[#f0f1e9] p-3"><div className="text-[10px] font-bold uppercase tracking-widest text-[#71847e]">{label}</div><div className="mt-1 break-words text-sm">{value}</div></div>)}</div><div className="mt-6 space-y-2">{detail.data.activity.map((visit) => <div key={visit.id} className="rounded-lg bg-[#f0f1e9] p-3 text-sm"><div className="font-medium">{visit.path}</div><div className="mt-1 text-xs text-[#71847e]">IP {visit.ipAddress} · {formatDate(visit.timestamp)} · {visit.screenSize || "screen size unavailable"} · {visit.timezone || "timezone unavailable"}</div></div>)}</div></> : <p className="pt-12 text-sm text-[#71847e]">Loading visitor details…</p>}
        </section>
      </div>}
    </main>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return <div className="rounded-2xl border border-[#d9ddd3] bg-[#fbfaf5] p-5"><p className="text-xs font-bold uppercase tracking-widest text-[#71847e]">{label}</p><p className="mt-3 text-4xl font-semibold">{value ?? "—"}</p></div>;
}