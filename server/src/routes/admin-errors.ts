import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { adminMiddleware } from "../middleware/admin";
import {
  listErrors,
  resolveError,
  resolveAllErrors,
  deleteError,
  deleteResolvedErrors,
  getErrorStats,
} from "../services/error-log";

const adminErrors = new Hono();
adminErrors.use("*", authMiddleware, adminMiddleware);

/** GET /api/admin/errors — list errors with optional filters. */
adminErrors.get("/", async (c) => {
  const source = c.req.query("source") as "client" | "server" | undefined;
  const resolved = c.req.query("resolved");
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : 100;
  const offset = c.req.query("offset") ? Number(c.req.query("offset")) : 0;

  const result = await listErrors({
    source: source === "client" || source === "server" ? source : undefined,
    resolved: resolved === "true" ? true : resolved === "false" ? false : undefined,
    limit,
    offset,
  });
  return c.json(result);
});

/** GET /api/admin/errors/stats — summary counts for the admin dashboard. */
adminErrors.get("/stats", async (c) => {
  const stats = await getErrorStats();
  return c.json(stats);
});

/** PUT /api/admin/errors/:id/resolve — mark a single error as resolved. */
adminErrors.put("/:id/resolve", async (c) => {
  const id = c.req.param("id");
  await resolveError(id);
  return c.json({ ok: true });
});

/** PUT /api/admin/errors/resolve-all — mark all unresolved errors as resolved. */
adminErrors.put("/resolve-all", async (c) => {
  const count = await resolveAllErrors();
  return c.json({ ok: true, count });
});

/** DELETE /api/admin/errors/:id — delete a single error. */
adminErrors.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await deleteError(id);
  return c.json({ ok: true });
});

/** DELETE /api/admin/errors/resolved — delete all resolved errors (cleanup). */
adminErrors.delete("/resolved", async (c) => {
  const count = await deleteResolvedErrors();
  return c.json({ ok: true, count });
});

export default adminErrors;
