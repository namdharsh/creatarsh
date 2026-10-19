# Creatarsh Static Website Publisher

## Scope

The manager publisher accepts static HTML/CSS/JavaScript website ZIPs only. It does not run `npm install`, package scripts, shell commands, Node/PHP/Python code, build scripts or arbitrary server-side applications. The API validates the ZIP using a bounded parser and stores the source archive and each immutable release object in private S3-compatible object storage. Public business subdomains stream files from the private store; bucket objects are never made public.

The archive scanner is a defence-in-depth heuristic, not an antivirus product or a proof that arbitrary JavaScript is harmless. Production websites are untrusted client-side code and should only be published for reviewed businesses. The published CSP blocks network connections, external scripts, forms, frames, plugins and external image/font loads. Keep business subdomains on host-only cookies and do not share authentication cookies with `*.creatarsh.in`.

## Environment

Configure these in local `server/.env` or the Render service environment. Never commit values:

- `OBJECT_STORAGE_ENDPOINT` — optional S3-compatible endpoint (leave unset for AWS S3; set for R2/compatible provider if supported).
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_BUCKET` — private bucket; public access must be blocked at provider level.
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `PLATFORM_ROOT_DOMAIN=creatarsh.in`
- Existing `MANAGER_JWT_SECRET` or `CUSTOMER_JWT_SECRET` is used to sign short-lived preview tokens; both should be independent strong secrets.

The object-store IAM credentials should have only `GetObject`, `PutObject`, and `DeleteObject` access to the publisher prefix/bucket required by this service. Do not use an account-wide storage key. If the object store endpoint is configured, test server-side encryption settings supported by that provider.

## Manager workflow

1. Open `/manager/`, sign in, and select **Website Publisher**.
2. Select a business and upload a `.zip` no larger than 20 MB. ZIP must include root `index.html`; total expanded content is limited to 60 MB and 500 entries.
3. The server rejects encrypted/multi-disk/ZIP64 archives, path traversal, absolute paths, symlinks, duplicate/case-colliding paths, unsupported file types, malformed entries, high compression ratios, CRC mismatches, and selected unsafe content patterns.
4. The validated source ZIP and individual static files are uploaded to private storage. The release is staged and is not public yet.
5. Open the signed preview link (valid for 10 minutes), review it, then click Publish.
6. Use Release history to inspect logs, restore a previous release, or unpublish the current release.

## API

- `GET /api/v1/admin/publisher/businesses`
- `GET /api/v1/admin/publisher/businesses/:businessId/deployments`
- `POST /api/v1/admin/publisher/businesses/:businessId/deployments` — multipart field `file`
- `GET /api/v1/admin/publisher/deployments/:deploymentId/preview-link`
- `GET /api/v1/admin/publisher/preview/:deploymentId?token=...` — short-lived signed preview
- `POST /api/v1/admin/publisher/deployments/:deploymentId/publish`
- `POST /api/v1/admin/publisher/deployments/:deploymentId/rollback`
- `POST /api/v1/admin/publisher/businesses/:businessId/unpublish`
- `GET /api/v1/admin/publisher/deployments/:deploymentId/logs`

Manager-only routes require the existing manager Bearer token. Preview assets use a signed deployment-scoped token expiring after 10 minutes.

## DNS / deployment

Configure Cloudflare wildcard DNS `*.creatarsh.in` to the same HTTPS origin as the Express service, with TLS active and the original Host header preserved. Keep reserved hosts (`www`, `api`, `admin`, etc.) mapped to their normal applications. Verify Render's public origin receives the wildcard host. The current app serves published business sites only when an active deployment exists for the matching business slug.

Render environment variables should be set in the service dashboard. `render.yaml` declares variable names without secret values. Install dependencies using `npm install --prefix server` locally or the configured build command, then run `npm test --prefix server` and `npm run check --prefix server` before deployment.

## Future isolated worker design (not enabled for this static-only release)

For a future Next.js/Vite/framework build, the API should enqueue a job containing only the deployment ID and private source object key. A separate worker service should run one disposable rootless sandbox per job with no production database/JWT/Cloudinary credentials, no host filesystem mounts, bounded CPU/memory/disk/time, no outbound network by default, read-only input, a single writable output directory and a strict output allowlist. Any dependency fetch should use an allowlisted proxy with lockfile and integrity checks. The worker returns an artifact hash and bounded build log; the API verifies the result and stages the artifact for admin approval. No uploaded build scripts execute in the main API process. Server-side projects require a separate threat model and a separately isolated runtime, not this publisher.

## Operational considerations

- Object storage is required; publishing endpoints return `503` until configured.
- Archive parsing is bounded, but run the API with ordinary resource limits and consider moving archive parsing to a separate validation worker as traffic grows.
- The version counter prevents normal concurrent version collisions; keep the unique `(businessId, version)` index.
- Keep old releases for rollback according to a retention policy. Add scheduled orphan-object cleanup only after the retention policy is defined.
- Test rollback and wildcard TLS in staging before publishing real client sites.
