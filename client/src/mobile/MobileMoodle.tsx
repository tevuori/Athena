// ===== Mobile Moodle wrapper =====
// Renders the desktop MoodleApp inside a mobile container. The app is
// responsive (uses container queries + standard tailwind), so we just provide
// the mobile chrome (header + scroll area) and forward to MoodleApp.

import { GraduationCap } from "lucide-react";
import MoodleApp from "../apps/moodle/MoodleApp";
import { MobileContainer, MobileHeader } from "./MobileUi";
import type { WindowInstance } from "../store/windows";

// A minimal stand-in WindowInstance so MoodleApp runs without the full WM.
const fakeWin = { id: "mobile-moodle", payload: null } as unknown as WindowInstance;

export default function MobileMoodle({ onClose }: { onClose?: () => void }) {
  return (
    <MobileContainer className="!max-w-none !px-0 !pb-0">
      <div className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <MobileHeader title="Moodle" subtitle="Courses & materials" onClose={onClose} />
      </div>
      <div className="h-[calc(100vh-7rem)] overflow-y-auto">
        <MoodleApp win={fakeWin} />
      </div>
    </MobileContainer>
  );
}
