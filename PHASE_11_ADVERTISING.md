# Creatarsh Phase 11 — Advertising & Sponsored Listings

## Implemented

- Admin-only campaign creation/editing, placement, category, budget metadata and start/end schedule.
- Creative approval/rejection with review notes, reviewer identity and audit events.
- Campaign cannot be activated until its creative is approved. Public delivery independently filters for `ACTIVE`, approved creatives and the current schedule.
- Directory-sponsored cards render in a separate, explicitly labelled **Sponsored businesses** section; they are not mixed into organic results or presented as organic rankings.
- Aggregate impression/click reporting by UTC day and campaign, with totals and CTR. Collector does not store IP addresses, user IDs, location coordinates, or user-agent fields. Existing general request logging may still record request metadata according to the platform logger; ad-event route itself does not persist visitor identifiers.
- HTTP(S)-only creative and destination URL validation; output is HTML-escaped in the directory UI.
- Admin APIs require active administrator role and write audit events for creation, review and status changes.

## API

- `GET /api/v1/admin/ads`
- `POST /api/v1/admin/ads`
- `PATCH /api/v1/admin/ads/:id`
- `POST /api/v1/admin/ads/:id/review` — `{ "decision": "APPROVED" | "REJECTED", "note": "..." }`
- `POST /api/v1/admin/ads/:id/status` — `{ "status": "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED" }`
- `GET /api/v1/admin/ads/:id/report`
- `GET /api/public/ads?placement=DIRECTORY_FEATURED[&category=...]`
- `POST /api/public/ads/:id/event` — `{ "event": "IMPRESSION" | "CLICK" }`

The public collector only accepts an event for an active, approved, in-schedule campaign. The unique daily aggregate index supports concurrent upserts. The current metric is an aggregate count, not a unique-person reach measure; automated traffic and repeated views can affect counts, so don't present it as unique users.

## Third-party ad network eligibility decision

No external ad network is enabled in this phase. As checked on 19 October 2026, Google's official AdSense eligibility guidance requires publisher-owned high-quality/original content, policy compliance and an eligible applicant; eligibility and site approval cannot be asserted from code alone. Google's native ad guidance says sponsored/native ads must be clearly marked as advertising and must not be indistinguishable from organic content. Google publisher policies also require privacy disclosures for data collection/use associated with Google products.

Before applying or enabling a network, review the current official policies and obtain approval:
- AdSense eligibility: https://support.google.com/adsense/answer/9724?hl=en
- Google publisher policies: https://support.google.com/adsense/answer/10502938?hl=en
- Native ad placement and labelling guidance: https://admanager.google.com/home/resources/feature-brief-native-ads/

Creatarsh's current local-business directory is not assumed to be approved. Apply only after the site has sufficient original publisher content, complete privacy disclosures, consent/legal review as applicable, and a successful provider site review. For mobile apps, separately review the current Google Mobile Ads SDK / AdMob requirements. Do not paste ad-network tags into production until approval and configuration are confirmed.

## Acceptance checks

Run from `server/`:

```bash
npm ci
npm run check
```

The tests verify authorization gates, creative approval, schedule/placement checks, clear sponsored labels, reporting aggregation and absence of persisted user identifiers in the ad-event collector. These are automated source-level/unit checks; they do not replace a deployed database-backed integration test.

## Manual sandbox/QA checklist

1. Sign into `/manager/admin.html` with an active admin or superadmin account.
2. Create a campaign; verify it is `DRAFT` and its creative is `PENDING`.
3. Try to activate it before approval; API must return `409`.
4. Approve the creative; activate campaign with a current schedule.
5. Call public ads API and confirm only approved, active, in-window campaigns are returned.
6. Open the directory; verify sponsored cards are in their own section with a visible Sponsored label and separate from organic results.
7. Generate impressions/clicks and open campaign report; check daily totals and CTR.
8. Pause or expire campaign and confirm it no longer appears or accepts events.
9. Confirm unauthorized users cannot create/review/activate campaigns.

No third-party ad network, production deployment or database migration was performed. Existing active campaigns that predate creative review may need explicit review before they can serve.
