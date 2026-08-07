import type { Context, Next } from "hono";
import { getVutGrant } from "../services/features";

/** Must run AFTER an auth middleware. 403s if the user has not been granted
 *  VUT access by an admin. Used to gate the /api/vut and /api/moodle routes
 *  (Moodle rides on the VUT SSO session, so one grant covers both). */
export async function requireVutAccess(c: Context, next: Next) {
  const { userId } = c.get("auth");
  const granted = await getVutGrant(userId);
  if (!granted) {
    return c.json({ error: "VUT integration is not enabled for your account", code: "VUT_NOT_GRANTED" }, 403);
  }
  await next();
}
