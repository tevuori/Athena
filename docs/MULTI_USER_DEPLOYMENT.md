# Athena — Multi-User Deployment Roadmap

What's needed to take Athena from a hardened single-user deployment to a
public, multi-user production environment.

## Current State

Athena is ready for **single-user or small-team self-hosted deployments**
(see `docs/PRODUCTION_READINESS.md` for the security hardening that's already
done). The remaining issues below are specific to **public multi-user**
deployments where untrusted users can sign up and share the same server.

---

## Issues to Resolve

### 1. SQLite single-writer concurrency
**Status: Done**

Migrated from SQLite to PostgreSQL. Changes:
- `schema.prisma` provider changed from `sqlite` to `postgresql`
- Old SQLite migrations archived in `prisma/migrations-sqlite-archive/`
- New initial Postgres migration in `prisma/migrations/0_init/`
- `docker-compose.yml` adds a `postgres:16-alpine` service with healthcheck
- `deploy/backup.sh` now uses `pg_dump -Fc` (custom format) instead of SQLite `VACUUM INTO`
- `deploy/deploy.sh` generates a random `POSTGRES_PASSWORD` and waits for Postgres to be ready
- `.env.example` updated with Postgres connection string + `POSTGRES_*` vars

### 2. In-memory rate limiting
**Status: Done**

The rate limiter now supports Redis for shared state across multiple server instances:
- When `REDIS_URL` is set: uses Redis `INCR` + `EXPIRE` for atomic, shared rate limiting
- When `REDIS_URL` is unset: falls back to the existing in-memory `Map` (for local dev)
- If Redis goes down, automatically falls back to in-memory (graceful degradation)
- `docker-compose.yml` adds a `redis:7-alpine` service with AOF persistence + healthcheck
- The server depends on Redis being healthy before starting
- Rate limits now survive restarts and are shared across horizontal-scaled instances

### 3. Open self-registration
**Status: Done (this pass)**

Previously, registration was bootstrap-only (first admin only). After that,
admins had to create every user manually via Settings → Users.

**What was added:**
- A global `registration.enabled` setting (toggled by admins in Settings → Users)
- A public `/api/auth/registration-status` endpoint to check if registration is open
- The `/auth/register` endpoint now allows self-registration when the setting is enabled
- A "Create account" form on the login screen with username, password, and display name
- New users are created with role `USER` (not `ADMIN`)

**Security considerations:**
- Registration is **disabled by default** — admins must explicitly enable it
- Rate limited (5 registrations per 60 seconds per IP)
- Username validation (2-32 chars), password minimum 4 chars
- Consider adding email verification or invite codes for public deployments (future work)

### 4. Two-factor authentication (2FA)
**Status: Done**

Implemented TOTP-based two-factor authentication:
- `User` model has `totpSecret` (AES-256-GCM encrypted) + `totpEnabled` columns
- `GET /auth/2fa/setup` — generates a new TOTP secret + `otpauth://` URI for QR codes
- `POST /auth/2fa/verify` — enables 2FA after verifying a code from the authenticator app
- `POST /auth/2fa/disable` — disables 2FA (requires password + optional current code)
- `GET /auth/2fa/status` — checks if 2FA is enabled
- `/auth/login` returns `{ totpRequired: true, challengeToken }` when 2FA is enabled
- `POST /auth/login/totp` — completes login with a TOTP code (10-min challenge token)
- LoginScreen shows a TOTP input form when challenged
- Settings → Account has a 2FA section with QR code (via `qrcode.react`) + setup/verify/disable flow
- Secrets encrypted at rest via `services/crypto.ts` (same AES-256-GCM as other credentials)

### 5. Password reset flow
**Status: Done**

Implemented self-service password reset via email:
- `User` model has an optional `email` field (set in Settings → Account)
- `PasswordResetToken` table stores SHA-256-hashed tokens (1-hour expiry, single-use)
- `POST /auth/forgot-password` — looks up user by username/email, generates a reset token, sends email
- `POST /auth/reset-password` — validates token, sets new password, revokes all refresh tokens
- Email sent via `nodemailer` (SMTP) — configurable with `SMTP_URL` + `SMTP_FROM` env vars
- When SMTP is not configured, emails are logged to the console (dev mode)
- Reset link uses `APP_BASE_URL` for the origin (falls back to server host:port)
- LoginScreen has a "Forgot password?" link + forgot-password form
- `ResetPasswordScreen` component handles the token from the URL query param
- Account enumeration protection: `/forgot-password` always returns 200
- Rate limited: 3 requests per 15 minutes per IP
- On successful reset, all refresh tokens are revoked (force re-login on all devices)

### 6. MIME type validation on uploads
**Status: Done**

The file upload endpoint now validates file content using magic numbers (file signatures):
- Uses the `file-type` npm package to sniff the first 4KB of each uploaded file
- Detects the real MIME type from magic bytes, overriding the client-provided `Content-Type`
- Rejects files whose detected MIME type is in a blocklist of executable types
  (`.exe`, `.so`, `.dylib`, `.jar`, `.apk`, `.deb`, `.rpm`, etc.) even if the
  extension was renamed to something safe
- The detected MIME type is stored in the database instead of the client-provided one

### 7. Test coverage
**Status: Done (expanded)**

Test count increased from 36 to 67 (61 server + 6 client). New test files:
- `server/src/services/totp.test.ts` — TOTP secret generation, encryption round-trip, QR URI building, code verification (plain + encrypted)
- `server/src/services/jwt.test.ts` — JWT signing/verification, TOTP challenge token flow, malformed token rejection
- `server/src/services/email.test.ts` — email service dev mode, base URL construction, trailing slash stripping
- `server/src/middleware/rateLimit.test.ts` — in-memory rate limiter: under-limit, over-limit (429), Retry-After header, per-IP tracking
- `server/src/multi-user.test.ts` — multi-user data isolation patterns, user-scoped model documentation

Remaining critical paths that still need integration tests (future work):
- Auth: login, register, refresh, password change, account deletion (end-to-end with a real DB)
- File upload: size limits, extension blocklist, MIME validation, path traversal
- User management: admin-only access, self-demotion prevention
- Multi-user isolation: user A can't access user B's data (end-to-end with a real DB)

### 8. Lint warnings
**Status: Partially done**

ESLint is configured with 0 errors and 537 warnings (all pre-existing). The warnings include:
- ~100 `@typescript-eslint/no-explicit-any` — should be typed
- ~80 `@typescript-eslint/no-unused-vars` — dead code or missing `_` prefix
- ~50 `react-hooks/set-state-in-effect` — review each for legitimacy
- ~30 `prefer-const` — trivial fixes

**Effort:** ~4 hours to clean up the trivial ones, ~8 hours for the `any` types.

### 9. Accessibility audit
**Status: Open**

No evidence of an a11y review. The desktop-environment UI (draggable windows,
custom context menus, keyboard shortcuts) is non-standard and likely has
accessibility gaps.

**Audit checklist:**
- Keyboard navigation through all apps (Tab, Enter, Escape)
- Screen reader compatibility (ARIA labels, roles, live regions)
- Color contrast (WCAG AA)
- Focus management in modals and windows
- Touch target sizes on mobile (44x44px minimum)

**Effort:** ~8-16 hours for audit + fixes.

### 10. Data export for all users
**Status: Done**

The `GET /api/auth/export` endpoint already downloads a user's full data as
JSON. No additional work needed — each user can export their own data from
Settings → Account.

---

## Deployment Checklist for Multi-User

Before opening Athena to multiple users:

- [x] Migrate SQLite → PostgreSQL
- [x] Enable open registration (Settings → Users → "Allow new users to sign up")
- [x] Add Redis-backed rate limiting (if scaling beyond one container)
- [x] Implement 2FA (Settings → Account)
- [x] Implement password reset (requires email service)
- [x] Add MIME type validation on uploads
- [x] Expand test coverage for auth + multi-user isolation
- [ ] Run accessibility audit
- [ ] Clean up lint warnings
- [ ] Set up monitoring/alerting (Sentry or similar)
- [ ] Document the admin runbook (user management, backups, incident response)
