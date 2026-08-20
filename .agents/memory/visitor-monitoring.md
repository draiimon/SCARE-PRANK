---
name: Visitor monitoring boundaries
description: Product and privacy decisions for the visitor security monitor.
---

The monitor is intentionally an evidence-oriented access log: it records repeat access patterns and network/device metadata, but does not attempt to resolve an IP address to a person's real-world identity. Visitor correlation uses a first-party anonymous browser ID, while approximate location remains explicitly network-level.

**Why:** IP addresses can be shared, rotated, masked, or otherwise misleading; presenting them as proof of identity would be unsafe and misleading.

**How to apply:** Keep future monitoring features focused on site protection, retention, transparency, rate limiting, and preserved access records rather than identity enrichment.

Behind the hosted reverse proxy, reliable IP capture requires trusting the proxy and checking forwarded client-IP headers before the socket address; normalize IPv4-mapped IPv6 values for consistent records.

**Why:** The socket address can be the proxy rather than the visitor, which makes the tracker appear not to capture IPs even when visits are being saved.

**How to apply:** Preserve proxy-aware extraction whenever visit ingestion or deployment routing changes.