import { Bell } from "lucide-react";
import { useSettings } from "../../../store/settings";
import { SectionHeader, ToggleRow } from "../ui";

export default function NotificationsSection() {
  const {
    notificationsEnabled,
    setNotificationsEnabled,
    doNotDisturb,
    setDoNotDisturb,
  } = useSettings();

  return (
    <section id="notifications" className="mb-8">
      <SectionHeader icon={<Bell size={18} />} title="Notifications" description="Control notification behavior." />
      <div className="space-y-3">
        <ToggleRow
          label="Enable notifications"
          description="Show notifications from apps"
          on={notificationsEnabled}
          onClick={() => setNotificationsEnabled(!notificationsEnabled)}
        />
        <ToggleRow
          label="Do not disturb"
          description="Silence all notifications (also mutes during Pomodoro focus)"
          on={doNotDisturb}
          onClick={() => setDoNotDisturb(!doNotDisturb)}
        />
      </div>
    </section>
  );
}
