// ===== Athena user profile tools =====
// The user's name lives on User.displayName (the same field Settings → Account
// edits), so a name learned in chat shows up everywhere in the UI. It is also
// injected into the system prompt (see context.ts) so Athena can address the
// user by name without calling get_user_name.

import type { ToolDef } from "./plugin";
import prisma from "../../../db/client";

const MAX_NAME = 64;

export const profileTools: ToolDef[] = [
  {
    name: "set_user_name",
    description:
      "Save the user's name (or preferred nickname) to their profile. Call this as soon as the user tells you what to call them (\"I'm Jakub\", \"my name is …\", \"call me Kuba\"), or when they ask you to change/correct the name you use. The name is stored on their profile, shown across the UI, and available to you in every future conversation.",
    destructive: true,
    clientAction: true,
    parameters: [
      { name: "name", type: "string", description: "The name to call the user (first name or nickname)", required: true },
    ],
    handler: async (args, { userId }) => {
      const name = String(args.name ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
      if (!name) return { error: "name is required" };
      await prisma.user.update({ where: { id: userId }, data: { displayName: name } });
      return { action: "profile_updated", displayName: name, saved: true };
    },
  },
  {
    name: "get_user_name",
    description:
      "Get the name currently saved on the user's profile. Only needed to double-check what you call them — the name is already in your context when it is set.",
    parameters: [],
    handler: async (_args, { userId }) => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true, username: true },
      });
      const displayName = user?.displayName?.trim() ?? "";
      return { displayName, username: user?.username ?? "", known: displayName.length > 0 };
    },
  },
];
