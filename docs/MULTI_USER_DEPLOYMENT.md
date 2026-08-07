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
**Status: Open**

SQLite uses a single writer lock. Under concurrent writes (multiple users
creating tasks, notes, uploading files simultaneously), requests queue and
latency degrades. Prisma makes the migration to PostgreSQL straightforward:

- Change `provider = "sqlite"` to `"postgresql"` in `schema.prisma`
- Update `DATABASE_URL` to a Postgres connection string
- Run `prisma migrate dev` to regenerate migrations for Postgres
- Update the backup script (`deploy/backup.sh`) to use `pg_dump`
- Update `docker-compose.yml` to add a Postgres service (or use a managed DB)

**Effort:** ~4-8 hours (schema is already Prisma-managed, no raw SQL).

### 2. In-memory rate limiting
**Status: Open**

`server/src/middleware/rateLimit.ts` uses an in-memory `Map`. This is fine for
a single container, but:
- Rate limits are lost on restart
- Not shared across multiple server instances (horizontal scaling)
- A restart resets the brute-force window

**Fix:** Use Redis-backed rate limiting. Options:
- `@upstash/ratelimit` (serverless Redis, free tier)
- Self-hosted Redis in `docker-compose.yml`
- Or SQLite-backed rate limiting (slower but no new dependency)

**Effort:** ~2 hours.

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
**Status: Open**

Currently username/password only. For a public-facing app, 2FA significantly
reduces account takeover risk.

**Implementation plan:**
- Add `totpSecret` and `totpEnabled` columns to the User model
- Use `otplib` (or `speakeasy`) for TOTP code generation/verification
- Add a QR code setup flow in Settings → Account
- Add a TOTP verification step after login when enabled
- Backup codes for recovery

**Effort:** ~4-6 hours.

### 5. Password reset flow
**Status: Open**

Users who forget their password have no self-service recovery path. Admins
can reset passwords via Settings → Users, but that requires contacting an admin.

**Implementation plan:**
- Add email field to User model (optional)
- Add `passwordResetToken` + `passwordResetExpires` columns
- `POST /api/auth/forgot-password` — sends a reset link email
- `POST /api/auth/reset-password` — validates token and sets new password
- Requires an email sending service (SMTP, Resend, SendGrid)
- Add email config to `.env`

**Effort:** ~4-6 hours (depends on email service choice).

### 6. MIME type validation on uploads
**Status: Open**

The file upload endpoint now has a size limit (100MB) and an extension
blocklist, but the MIME type is still trusted from the client. A malicious
file could be uploaded with a fake `Content-Type`.

**Fix:** Validate file content using magic numbers (file signatures):
- Use `file-type` npm package to sniff the first bytes of uploaded files
- Reject files where the detected type doesn't match the declared type
- Or strip the client-provided MIME type and use the detected one

**Effort:** ~2 hours.

### 7. Test coverage
**Status: Partially done**

Test count went from 15 to 36, but that's still low for a ~50k line codebase.
For multi-user production, the critical paths that need tests:

- Auth: login, register, refresh, password change, account deletion
- File upload: size limits, extension blocklist, path traversal
- User management: admin-only access, self-demotion prevention
- Multi-user isolation: user A can't access user B's data

**Effort:** Ongoing. Start with auth + file upload integration tests (~8 hours).

### 8. Lint warnings
**Status: Partially done**

ESLint is configured with 0 errors and 535 warnings. The warnings include:
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

- [ ] Migrate SQLite → PostgreSQL
- [ ] Enable open registration (Settings → Users → "Allow new users to sign up")
- [ ] Add Redis-backed rate limiting (if scaling beyond one container)
- [ ] Implement 2FA (Settings → Account)
- [ ] Implement password reset (requires email service)
- [ ] Add MIME type validation on uploads
- [ ] Expand test coverage for auth + multi-user isolation
- [ ] Run accessibility audit
- [ ] Clean up lint warnings
- [ ] Set up monitoring/alerting (Sentry or similar)
- [ ] Document the admin runbook (user management, backups, incident response)
