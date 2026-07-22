import type { ToolDef } from "./plugin";
import { taskTools } from "./tasks";
import { gradeTools } from "./grades";
import { noteTools } from "./notes";
import { fileTools } from "./files";
import { pomodoroTools } from "./pomodoro";

export { AthenaToolsPlugin, type ToolDef, type ToolContext } from "./plugin";

/** All Athena tools, in registration order. */
export const ALL_TOOLS: ToolDef[] = [
  ...taskTools,
  ...gradeTools,
  ...noteTools,
  ...fileTools,
  ...pomodoroTools,
];

/** Tool metadata safe to expose to the client (no handlers). */
export function toolManifest() {
  return ALL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    destructive: Boolean(t.destructive),
    clientAction: Boolean(t.clientAction),
  }));
}

/** Names of tools that produce a client_action payload. */
export const CLIENT_ACTION_TOOLS = new Set(
  ALL_TOOLS.filter((t) => t.clientAction).map((t) => t.name)
);
