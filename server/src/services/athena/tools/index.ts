import type { ToolDef } from "./plugin";
import { taskTools } from "./tasks";
import { gradeTools } from "./grades";
import { noteTools } from "./notes";
import { fileTools } from "./files";
import { pomodoroTools } from "./pomodoro";
import { windowTools } from "./windows";
import { workspaceTools } from "./workspaces";
import { studyTools } from "./study";
import { moodleTools } from "./moodle";
import { calendarTools } from "./calendar";
import { habitsTools } from "./habits";
import { searchTools } from "./search";
import { fetchTools } from "./fetch";
import { sandboxTools } from "./sandbox";
import { notetakeTools } from "./notetake";
import { crossAppTools } from "./crossapp";
import { researchTools } from "./research";
import { memoryTools } from "./memory";
import { linkTools } from "./links";
import { browserTools } from "./browser";

export { AthenaToolsPlugin, type ToolDef, type ToolContext, type ClientWindowInfo } from "./plugin";

/** All Athena tools, in registration order. */
export const ALL_TOOLS: ToolDef[] = [
  ...taskTools,
  ...gradeTools,
  ...noteTools,
  ...fileTools,
  ...pomodoroTools,
  ...windowTools,
  ...workspaceTools,
  ...studyTools,
  ...moodleTools,
  ...calendarTools,
  ...habitsTools,
  ...searchTools,
  ...fetchTools,
  ...researchTools,
  ...sandboxTools,
  ...notetakeTools,
  ...crossAppTools,
  ...memoryTools,
  ...linkTools,
  ...browserTools,
];

/** Tool metadata safe to expose to the client (no handlers). */
export function toolManifest() {
  return ALL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    destructive: Boolean(t.destructive),
    requiresConfirmation: Boolean(t.requiresConfirmation),
    clientAction: Boolean(t.clientAction),
  }));
}

/** Names of tools that produce a client_action payload. */
export const CLIENT_ACTION_TOOLS = new Set(
  ALL_TOOLS.filter((t) => t.clientAction).map((t) => t.name)
);
