# Rukba API

Gaza local transportation management backend (Phase 0–3: skeleton, models, passenger auth, passenger booking).

The Spec Kit roadmaps define bounded delivery phases. Driver D1 access and profile is implemented; see its [validation record](specs/006-driver-access/validation.md). Driver D2 Route/run operations are implemented for local verification; see [D2 validation](specs/007-driver-trip-operation/validation.md). Driver D3 ticket QR validation is implemented for local verification; see [D3 validation](specs/008-driver-ticket-validation/validation.md). Driver D4 activity is implemented for local verification; see [D4 verification](specs/009-driver-activity/verification.md). Driver D5 earnings is implemented for local verification; see [D5 verification](specs/010-driver-earnings/verification.md).

## Stack

- Node.js 20+
- Express 5
- MongoDB + Mongoose (replica set required for ticket booking transactions)
- JWT auth (access + rotating refresh)
- Zod validation
- Pino logging
- Cloudinary (profile images + authenticated ticket QR PNGs)
- CommonJS

## Setup

1. Copy env file and adjust if needed:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Start MongoDB as a **replica set** (booking uses multi-document transactions). A standalone `mongod` will fail every `POST /tickets`.

```js
// mongosh
rs.initiate()
```

Example URI:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/rukba?replicaSet=rs0
```

If your instance requires auth, set `MONGODB_URI` like
`mongodb://USER:PASSWORD@127.0.0.1:27017/rukba?authSource=admin&replicaSet=rs0`.

4. Set Cloudinary credentials in `.env` (required for booking QR uploads).

5. Run the API:

```bash
npm run dev
```

Health check: [http://127.0.0.1:3000/health](http://127.0.0.1:3000/health) or `/api/v1/health`.

Smoke check (loads models, asserts indexes, hits health and auth gates — no mongod required):

```bash
npm run smoke
```

## Tests

```bash
npm run test:unit   # Jest — validators, tokens, phone/username, throttle helpers
npm run test:e2e    # Playwright API — isolated Passenger and Driver API suites
npm test            # unit then e2e
```

E2E starts a one-node MongoDB replica set in memory by default and uses the `rukba-e2e` database. To use an external disposable database, set `E2E_MONGODB_URI` and include that exact URI in the JSON array `E2E_MONGODB_URI_ALLOWLIST`. Setup and teardown verify the active connection before clearing collections. Never point E2E at an operational database.

E2E substitutes disposable image URLs for Cloudinary uploads; a real-provider smoke check is separate from the deterministic suite.

## Passenger auth

Phone numbers may be entered in local Palestinian form (`0599…`) or international form (`+970599…`). The API stores and compares **E.164**. Usernames are matched case-insensitively; the chosen display spelling is preserved. Repeated failed sign-ins are throttled per account and per source IP (`429` with `data.retryAfterSeconds` and a `Retry-After` header). Limits never change account `status`.

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/v1/auth/register` | Creates passenger; returns user + `phoneVerification`, no tokens until the phone is verified |
| POST | `/api/v1/auth/register/verify-phone` | `{ "phone", "code" }`; marks the phone verified, then log in |
| POST | `/api/v1/auth/login` | `{ "username", "password" }` only; passengers only; temporary `429` lockouts |
| POST | `/api/v1/auth/password/forgot/reset` | `{ "phone", "code", "newPassword" }`; `code` is the fixed OTP |
| POST | `/api/v1/auth/refresh` | Body `{ "refreshToken" }`; each token succeeds at most once |
| POST | `/api/v1/auth/logout` | Body `{ "refreshToken" }` |
| POST | `/api/v1/auth/logout-all` | Bearer access token |
| GET | `/api/v1/profile` | Bearer access token |
| PATCH | `/api/v1/profile` | Update `fullName`, `username`, and/or multipart `image` together (all-or-nothing) |

Auth-related environment variables (see `.env.example`):

```text
TRUST_PROXY=false
DEFAULT_PHONE_REGION=PS
AUTH_FAIL_ACCOUNT_MAX=5
AUTH_FAIL_ACCOUNT_LOCK_MS=900000
AUTH_FAIL_IP_MAX=20
AUTH_FAIL_IP_LOCK_MS=900000
AUTH_FAIL_WINDOW_MS=900000
```

Set `TRUST_PROXY=true` only when the API sits behind a reverse proxy so `req.ip` is the client address.

### Phone verification

No SMS is sent. Phone verification and forgot-password reset both accept one fixed 6-digit OTP, `FIXED_OTP_CODE` (default `111111`). Anyone who knows it can verify any phone or reset any password by phone, so treat it as a development-only shortcut.

Passenger and Driver self-registration creates the account with `phoneVerified: false`. The response carries `phoneVerification: { "required": true }`. Login with the correct password is refused with `403 PHONE_NOT_VERIFIED` (with `data.phone`) until `POST …/register/verify-phone` succeeds with the fixed OTP. Wrong codes count toward the per-account and per-IP sign-in throttle. Accounts created any other way (seeds, existing data, admins) count as verified. `PHONE_VERIFICATION_ENABLED=false` skips the step.

### Migration

Existing user documents must be unique on normalized phone and case-insensitive username before the new unique index is used in production:

1. `node scripts/audit-identity-collisions.js` — prints collision groups; exit code `1` if any exist. Do not merge accounts automatically.
2. Resolve collisions manually.
3. `node scripts/backfill-identity.js` — writes `usernameNormalized` and E.164 `phone`, then drops the legacy case-sensitive `username_1` unique index. Aborts without writes if collisions remain.

Sign-in looks users up by `usernameNormalized` and an E.164 phone, so run this before serving traffic against an existing database. Accounts that still lack those fields cannot be found by either lookup.

Quick check (PowerShell):

```powershell
# Register
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:3000/api/v1/auth/register -ContentType application/json -Body '{"phone":"+970599111111","username":"sara_new","password":"Password123!","fullName":"Sara"}'

# Verify the new phone with the fixed OTP
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:3000/api/v1/auth/register/verify-phone -ContentType application/json -Body '{"phone":"+970599111111","code":"111111"}'

# Login (seed passenger) — username + password
$login = Invoke-RestMethod -Method POST -Uri http://127.0.0.1:3000/api/v1/auth/login -ContentType application/json -Body '{"username":"sara_passenger","password":"Password123!"}'
$token = $login.data.accessToken

# Me / profile
Invoke-RestMethod -Uri http://127.0.0.1:3000/api/v1/profile -Headers @{ Authorization = "Bearer $token" }

# Update profile image (multipart field name: image)
# curl -X PATCH http://127.0.0.1:3000/api/v1/profile -H "Authorization: Bearer <token>" -F "image=@./avatar.jpg" -F "fullName=Sara"
```

Driver/admin seed accounts get **403** on passenger login.

## Driver access and admin review

Driver phase D1 provides public Driver signup, fixed-role Driver/admin login, role-scoped refresh/logout, Driver profile read/name edit, and admin application review. New signups create an active Driver account with a pending immutable application and receive no tokens. Only a trusted admin can approve or reject an application. There is no public admin signup route. Provision admin accounts through the existing trusted operator process.

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/v1/driver/auth/register` | Driver signup; returns pending profile + `phoneVerification`, no tokens |
| POST | `/api/v1/driver/auth/register/verify-phone` | `{ "phone", "code" }`; required before the first Driver login |
| POST | `/api/v1/driver/auth/login` | Driver-only login with `{ "username", "password" }` |
| POST | `/api/v1/driver/auth/password/forgot/reset` | `{ "phone", "code", "newPassword" }`; `code` is the fixed OTP |
| POST | `/api/v1/driver/auth/refresh` | Rotate a Driver refresh token |
| POST | `/api/v1/driver/auth/logout` | Revoke one Driver session family |
| POST | `/api/v1/driver/auth/logout-all` | Revoke all Driver refresh sessions; Driver bearer token required |
| PATCH | `/api/v1/driver/auth/password` | `{ "currentPassword", "newPassword" }`; Driver bearer token required; signs out every session and returns a fresh token pair |
| POST | `/api/v1/driver/auth/password/reset` | `{ "phone" \| "username", "code", "newPassword" }`; public; uses an admin-issued reset code and signs out every session |
| GET | `/api/v1/notifications` | Own notifications, newest first (Driver or passenger token) |
| PATCH | `/api/v1/notifications/:notificationId/read` | Mark one own notification read |
| GET/PATCH | `/api/v1/driver/profile` | Read own profile / update `fullName`, `username`, or `image` (multipart); phone, ID, license, and vehicle stay locked |
| POST | `/api/v1/admin/auth/login` | Admin-only login |
| POST | `/api/v1/admin/auth/refresh` | Rotate an admin refresh token |
| POST | `/api/v1/admin/auth/logout` | Revoke one admin session family |
| POST | `/api/v1/admin/auth/logout-all` | Revoke all admin refresh sessions; admin bearer token required |
| GET | `/api/v1/admin/driver-applications` | List pending applications |
| GET | `/api/v1/admin/driver-applications/:applicationId` | Read an application and its decision |
| POST | `/api/v1/admin/driver-applications/:applicationId/decision` | Approve or reject once |
| POST | `/api/v1/admin/drivers/:driverId/password-reset` | No body; issues a one-time Driver reset code (`201`) |
| GET | `/api/v1/admin/routes` | All routes, including inactive; optional pagination, origin, destination, `isActive`, and search filters |
| GET | `/api/v1/admin/routes/:routeId` | Read one route including admin-only lifecycle fields |
| POST | `/api/v1/admin/routes` | Create a route; origin, destination, fare, and estimated duration are required (`201`) |
| PATCH | `/api/v1/admin/routes/:routeId` | Update route details or active status; does not delete route history |

### Driver password recovery

A Driver who forgets their password can reset it with the fixed OTP (`/driver/auth/password/forgot/reset`, see Phone verification), or contact support: an admin calls `POST /admin/drivers/:driverId/password-reset`, and the admin passes the returned code to the Driver out of band.

- The response is `{ "driver", "code", "expiresAt" }`. The 8-digit code expires after 15 minutes and is stored only as a hash. Issuing a new code replaces the previous one.
- `POST /driver/auth/password/reset` accepts the code once. After 5 wrong codes the code stops working and the admin must issue a new one. Every failure (unknown account, wrong, expired, used, or exhausted code) returns the same `400 INVALID_RESET_CODE`. Attempts are also rate-limited per IP and per account (`429 TOO_MANY_ATTEMPTS`).
- A successful change or reset sets the new password, clears any pending reset code, and revokes every refresh token. Access tokens that were already issued are not revoked and stay valid until they expire (`JWT_ACCESS_EXPIRES`, about 15 minutes). `PATCH /driver/auth/password` then returns `{ "accessToken", "refreshToken", "expiresIn" }` so the current device stays signed in. Wrong current password returns `400 INVALID_CURRENT_PASSWORD`, and reusing the current password returns `400 PASSWORD_UNCHANGED`.
- New passwords must be 8–128 characters.

### Driver notifications

Drivers read their notifications from the shared `/api/v1/notifications` endpoints. Each notification is written in the same transaction as the action that causes it, and a retried action does not create a duplicate.

Every notification has `refs: { ticketId, tripId, routeId }`; ids that don't apply are `null`.

| `type` | Sent when | Filled `refs` |
|--------|-----------|---------------|
| `driver_application_approved` | An admin approves the application | none |
| `driver_application_rejected` | An admin rejects the application; the body includes the reason | none |
| `trip_completed` | The Driver completes a run; the body includes used tickets and the amount credited | `tripId`, `routeId` |
| `payout_completed` | A wallet payout is recorded; the body includes the amount | none |
| `password_changed` | The password is changed or reset | none |

Driver/admin sessions and signup/review require MongoDB transactions. Existing deployments must audit identity readiness and run the additive Driver access migration before enabling these routes:

```bash
node scripts/migrate-driver-access.js                 # read-only audit/dry run
node scripts/migrate-driver-access.js --apply          # apply additive guards/indexes
node scripts/migrate-driver-access.js --apply --backfill-pending-snapshots
```

Pending snapshot backfill is a separate audited choice; its timestamp records when backfill occurred, not when a legacy application was submitted. The migration never creates missing Driver profiles and preserves existing final statuses and decision evidence. Rollback disables the new route mounts and retains migrated data and indexes; it does not delete records. No operational migration or deployment was performed for D1.

## Driver Route and Trip runs (D2 verification)

An active, verified Driver with a complete profile can list active Routes, create one in-progress run at a time (selecting a Route starts it), read owned runs, and complete it. Different Drivers may create separate runs on one Route. Clients do not send an `operationId`; the server records its own. Retrying a start with the same `routeId` and `vehicleLabel` while that run is active returns it with `replayed: true` (a different start returns `409`), and retrying a completion returns the stored outcome. A ticket scan sends only the QR token. All endpoints require a Driver bearer token.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/v1/driver/routes` | Active Routes; `page` 1+, `limit` 1–50, optional exact origin/destination filters |
| POST | `/api/v1/driver/trips` | `{ "routeId", "vehicleLabel"? }`; creates the run already started |
| GET | `/api/v1/driver/trips/current` | Current run or `trip:null` |
| GET | `/api/v1/driver/trips/:tripId` | Owned current or historical run |
| POST | `/api/v1/driver/trips/:tripId/complete` | No body; ends the active run |
| POST | `/api/v1/driver/tickets/scan` | `{ "qrToken" }`; consumes one exact-run Ticket while boarding or in progress |
| GET | `/api/v1/driver/activity` | Owner-only retained history plus full-scope operational totals; `page` 1–100000, `limit` 1–50, optional exact `status` and exclusive UTC `start`/`end` |
| GET | `/api/v1/driver/earnings` | Owner-only UTC month report; required `month=YYYY-MM`, optional `status=accrued|paid`, `page` 1–100000, `limit` 1–50 |

Before enabling these operations on existing data, run the D2 readiness audit on the intended database and resolve every reported inconsistency. Apply is explicit and additive:

```bash
node scripts/migrate-driver-trip-operation.js
node scripts/migrate-driver-trip-operation.js --apply
```

Apply backfills only deterministic `revision` and `driverActive` values and adds the active-Driver index. It refuses ambiguous legacy runs, missing references, counter drift, and contradictory timestamps. Keep MongoDB replica-set transactions available for booking and run mutations. Rollback should disable the D2 routes and pause affected writes while preserving Trips and Tickets for review; it must not delete or reassign passenger records. No operational migration or deployment was performed here.

## Driver activity (D4 verification)

An eligible Driver can read their own retained Trip history and matching operational totals from `GET /api/v1/driver/activity`. The response is read-only: it uses recorded Route/vehicle snapshots, includes soft-deleted owned runs, and never writes Trips, Tickets, events, or profile totals. Ticket sums are operational counters, not fare, payment, or earnings. Enable the two additive Trip indexes `{driver:1,createdAt:-1,_id:-1}` and `{driver:1,status:1,createdAt:-1,_id:-1}` before production traffic. Replica-set snapshot reads are required. Local verification is recorded in `specs/009-driver-activity/verification.md`. No operational index deployment was performed here.

## Driver earnings (D5 verification)

An eligible Driver can read owner-scoped accrued earnings from `GET /api/v1/driver/earnings`. Completion of an owned run creates at most one immutable Earning from exact-Trip used Ticket booked fares; zero used Tickets complete without an Earning. The report requires a UTC `YYYY-MM` month, returns a bounded page plus full-scope currency/status totals, and degrades only dependent fields when legacy evidence is corrupt. It does not collect payment, execute payout, or change earning status. Enable the additive Earning indexes `{driver:1,periodKey:1,accruedAt:-1,_id:-1}` and `{driver:1,periodKey:1,status:1,accruedAt:-1,_id:-1}` before production traffic; keep `{driver:1,periodKey:1}` until measured redundancy is documented. Replica-set snapshot reads and the D2 completion transaction are required. Audit first with `node scripts/migrations/backfill-driver-earnings.js`; apply is explicit. Local verification is recorded in `specs/010-driver-earnings/verification.md`. No operational migration or deployment was performed here. No payment collection, refund, or payout execution is claimed.

## Passenger booking

All ticket routes below require `Authorization: Bearer <accessToken>` and the passenger role. `GET /api/v1/home` and `GET /api/v1/routes` also require a passenger access token. Passengers discover and book **active Routes**; Driver Trip runs are an operations surface, not a passenger booking catalog.

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/v1/home` | First-screen payload: public `user` and the passenger's `savedRoutes` (newest first, up to 20) |
| GET | `/api/v1/routes` | Active route catalog (origin/destination picker); passenger-authenticated |
| POST | `/api/v1/saved-routes` | Save an active Route with `{ "routeId", "address"? }` (`address`: optional passenger label, max 120 chars); idempotent if already saved |
| GET | `/api/v1/saved-routes` | Owner-scoped saved routes; optional `page` / `limit` |
| DELETE | `/api/v1/saved-routes/:routeId` | Remove a saved Route for the current passenger |
| GET | `/api/v1/trips/history` | Distinct past trips with a `used` ticket (attribution after validation) |
| POST | `/api/v1/tickets` | Book an active Route with `{ "routeId" }`; returns ticket, `receiptCode`, one-time `qrToken`, short-lived `qrDownloadUrl` |
| GET | `/api/v1/tickets` | My tickets; optional `status` |
| GET | `/api/v1/tickets/:ticketId` | Ticket detail (no raw token / hash / jti) |
| GET | `/api/v1/tickets/:ticketId/qr` | Ownership-checked ~5-minute signed QR download URL |
| POST | `/api/v1/tickets/:ticketId/cancel` | Cancel own unused, unexpired active Ticket |
| GET | `/api/v1/tickets/:ticketId/receipt` | Stored booking receipt; appends `receipt_viewed` |

Quick check (PowerShell, after login and seed):

```powershell
$h = @{ Authorization = "Bearer $token" }

# List routes, then book
$routes = Invoke-RestMethod -Uri http://127.0.0.1:3000/api/v1/routes -Headers $h
$routeId = $routes.data.routes[0].id

# Book
$book = Invoke-RestMethod -Method POST -Uri http://127.0.0.1:3000/api/v1/tickets -Headers $h -ContentType application/json -Body (@{ routeId = $routeId } | ConvertTo-Json)
$ticketId = $book.data.ticket.id
$book.data.qrDownloadUrl

# QR link (short-lived; bare qr.imageUrl is not publicly fetchable)
Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/v1/tickets/$ticketId/qr" -Headers $h

# Receipt
Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/v1/tickets/$ticketId/receipt" -Headers $h

# Cancel
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:3000/api/v1/tickets/$ticketId/cancel" -Headers $h

# Booking a closed trip returns 409
# Invoke-RestMethod -Method POST -Uri http://127.0.0.1:3000/api/v1/tickets -Headers $h -ContentType application/json -Body '{"routeId":"<inactiveRouteId>"}'
```

## Seed data

```bash
npm run seed
# or wipe seeded phones/trips then recreate:
npm run seed -- --reset
```

Seeded accounts (password `Password123!`):

| Role | Phone |
|------|-------|
| admin | `+970599000001` |
| driver | `+970599000002` |
| passenger | `+970599000003` |

## Project layout

```
src/
  app.js        Express middleware and API mounts
  server.js     database connection and HTTP startup
  config/       environment, database, logging, identity readiness
  constants/    domain enums
  controllers/  HTTP request/response handlers
    admin/
    driver/
    passenger/
    shared/     authentication, passenger profile, notifications
  middlewares/  authentication, roles, eligibility, validation, uploads, errors
  models/       Mongoose schemas and indexes
  routes/v1/    admin, driver, passenger, and shared route groups
  services/     business operations, database queries, and public responses
  utils/        domain calculations, tokens, QR, storage, pagination
  validators/   request schemas
scripts/        operational audits, migrations, cleanup, and smoke checks
seeds/          development seed data
tests/
  unit/         Jest tests
  e2e/          Playwright API and performance tests
  helpers/      isolated database setup and fixtures
specs/          feature specifications, plans, and verification records
```

Keep controllers focused on HTTP and database queries plus public response
shapes in services. Add new handlers to the role group used by their routes.
Operational scripts retain their existing paths so documented migration commands
continue to work.

## Error responses

Every error keeps the usual envelope, and `data.code` is always present. Clients should branch on `data.code` and show `message` (Arabic) to the user. Don't parse `message`, because its wording can change.

```json
{ "status": "error", "message": "لدى السائق رحلة نشطة بالفعل", "data": { "code": "ACTIVE_TRIP_EXISTS" } }
```

- **Validation failures** (`400`) return `"code": "VALIDATION_FAILED"` and `"errors": [{ "path": "newPassword", "message": "..." }]`.
- **Too many attempts** (`429`) return `"code": "TOO_MANY_ATTEMPTS"`, `"retryAfterSeconds"`, and a matching `Retry-After` header.
- Some errors add extra fields next to `code`; for example, `TICKET_ALREADY_USED` includes `display`.
- If the service doesn't give a specific code, it comes from the status: `400 BAD_REQUEST`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`, `500 INTERNAL_ERROR`, `503 TEMPORARILY_UNAVAILABLE`. A duplicate-key write returns `DUPLICATE`, and a rejected file upload returns `INVALID_UPLOAD`.
- `500` errors never include internal details.

Specific codes by area:

| Area | Codes |
|------|-------|
| Login and sessions | `INVALID_CREDENTIALS`, `INVALID_REFRESH_TOKEN`, `IDENTITY_CONFLICT`, `PHONE_NOT_VERIFIED` |
| Phone verification | `INVALID_VERIFICATION_CODE`, `PHONE_VERIFICATION_NOT_PENDING` |
| Password | `INVALID_CURRENT_PASSWORD`, `PASSWORD_UNCHANGED`, `INVALID_RESET_CODE`, `DRIVER_NOT_FOUND` |
| Applications | `APPLICATION_NOT_FOUND`, `APPLICATION_ALREADY_DECIDED`, `DRIVER_NOT_ELIGIBLE`, `DRIVER_INELIGIBLE` |
| Routes and runs | `ROUTE_NOT_FOUND`, `ROUTE_ALREADY_EXISTS`, `INVALID_ROUTE_ENDPOINTS`, `TRIP_NOT_FOUND`, `ACTIVE_TRIP_EXISTS`, `TRIP_STATE_CONFLICT`, `OPERATION_KEY_REUSED` |
| Ticket scan | `INVALID_QR`, `WRONG_ROUTE`, `TICKET_UNAVAILABLE`, `TICKET_ALREADY_USED`, `TICKET_CANCELLED`, `TICKET_EXPIRED`, `VALIDATION_CONFLICT` |
| Earnings and wallet | `EARNING_CONFLICT`, `EARNING_SOURCE_INCONSISTENT`, `INSUFFICIENT_BALANCE` |
| Notifications and saved routes | `NOTIFICATION_NOT_FOUND`, `SAVED_ROUTE_NOT_FOUND` |

## Notes

- Money fields use integer **agorot** (`fareMinor`, etc.). No payment gateway in v1.
- Access JWT ~15m (`JWT_ACCESS_EXPIRES`); refresh ~7d (`JWT_REFRESH_EXPIRES`), stored hashed and rotated.
- User `image` defaults to `CLOUDINARY_DEFAULT_IMAGE_URL`.
- `ActionHistory` records booking, cancellation, scan, receipt, and Driver run events.
- `Route` catalog: `GET /api/v1/routes` (passenger-authenticated). `Trip` references a `Route`.
- Ticket statuses: `active`, `used`, `cancelled`, `expired`. `expired` is derived when `status` is still `active` but `qr.expiresAt` has passed.
- QR: raw JWT returned once at booking; only SHA-256 hash stored. PNG uploaded as Cloudinary `authenticated` type under `rukba/tickets/qr/<ticketId>`. Fetch via `GET /tickets/:id/qr` (short-lived signed URL). QR validity runs from issuance for `QR_TTL_MINUTES` (default 1440).
- Multiple tickets per passenger on the same trip are allowed.

### Cloudinary setup

1. Create a free account at [cloudinary.com](https://cloudinary.com).
2. Copy **Cloud name**, **API Key**, and **API Secret** into `.env`.
3. Optionally upload a default avatar and set `CLOUDINARY_DEFAULT_IMAGE_URL` to its secure URL.
4. Ticket QR assets use delivery type `authenticated` (not public upload URLs).
