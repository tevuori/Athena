import { useState } from "react";
import {
  Settings as SettingsIcon,
  Palette,
  Image,
  Film,
  User,
  Volume2,
  Sparkles,
  Plug,
  Bell,
  BellRing,
  Users as UsersIcon,
  Database,
  Info,
  Smartphone,
  ChevronLeft,
  BarChart3,
} from "lucide-react";
import { useAuth } from "../../store/auth";
import type { WindowInstance } from "../../store/windows";
import { useFormFactor } from "../../store/formfactor";
import CollapsibleSidebar from "../../wm/CollapsibleSidebar";
import AppearanceSection from "./sections/AppearanceSection";
import WallpaperSection from "./sections/WallpaperSection";
import AnimatedBgSection from "./sections/AnimatedBgSection";
import AccountSection from "./sections/AccountSection";
import SoundAthenaSection from "./sections/SoundAthenaSection";
import AthenaSection from "./sections/AthenaSection";
import IntegrationsSection from "./sections/IntegrationsSection";
import NotificationsSection from "./sections/NotificationsSection";
import ProactiveAlertsSection from "./sections/ProactiveAlertsSection";
import UsersSection from "./sections/UsersSection";
import AnalyticsSection from "./sections/AnalyticsSection";
import DataStorageSection from "./sections/DataStorageSection";
import AboutSection from "./sections/AboutSection";
import MobileSection from "./sections/MobileSection";

interface SectionDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const SECTIONS: SectionDef[] = [
  { id: "appearance", label: "Appearance", icon: <Palette size={15} /> },
  { id: "wallpaper", label: "Wallpaper", icon: <Image size={15} /> },
  { id: "animated-bg", label: "Animated BG", icon: <Film size={15} /> },
  { id: "mobile", label: "Mobile", icon: <Smartphone size={15} /> },
  { id: "account", label: "Account", icon: <User size={15} /> },
  { id: "sound-athena", label: "Sound & Athena", icon: <Volume2 size={15} /> },
  { id: "athena", label: "Athena Assistant", icon: <Sparkles size={15} /> },
  { id: "integrations", label: "Integrations", icon: <Plug size={15} /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={15} /> },
  { id: "proactive-alerts", label: "Proactive Alerts", icon: <BellRing size={15} /> },
  { id: "users", label: "Users", icon: <UsersIcon size={15} />, adminOnly: true },
  { id: "analytics", label: "Analytics", icon: <BarChart3 size={15} />, adminOnly: true },
  { id: "data", label: "Data & Storage", icon: <Database size={15} /> },
  { id: "about", label: "About", icon: <Info size={15} /> },
];

export default function SettingsApp({ win }: { win: WindowInstance }) {
  const { user } = useAuth();
  const [active, setActive] = useState<string | null>((win.payload?.section as string) || "appearance");
  const isAdmin = user?.role === "ADMIN";
  const isPhone = useFormFactor((s) => s.mode === "phone");

  const visibleSections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);
  const activeLabel = visibleSections.find((s) => s.id === active)?.label ?? "Settings";

  const renderSection = () => {
    if (active === null) return null;
    if (active === "appearance") return <AppearanceSection />;
    if (active === "wallpaper") return <WallpaperSection />;
    if (active === "animated-bg") return <AnimatedBgSection />;
    if (active === "mobile") return <MobileSection />;
    if (active === "account") return <AccountSection />;
    if (active === "sound-athena") return <SoundAthenaSection />;
    if (active === "athena") return <AthenaSection />;
    if (active === "integrations") return <IntegrationsSection />;
    if (active === "notifications") return <NotificationsSection />;
    if (active === "proactive-alerts") return <ProactiveAlertsSection />;
    if (active === "users" && isAdmin) return <UsersSection />;
    if (active === "analytics" && isAdmin) return <AnalyticsSection />;
    if (active === "data") return <DataStorageSection />;
    if (active === "about") return <AboutSection />;
    return null;
  };

  // Phone: list → detail flow (no sidebar overlay).
  if (isPhone) {
    if (active === null) {
      // Section list screen
      return (
        <div className="flex h-full flex-col bg-surface">
          <div className="border-b border-edge px-4 py-3">
            <h2 className="text-base font-semibold text-ink">Settings</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {visibleSections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition active:bg-surface-2"
              >
                <span className="text-ink-muted">{s.icon}</span>
                <span className="flex-1 text-sm text-ink">{s.label}</span>
                <ChevronLeft size={16} className="rotate-180 text-ink-muted/50" />
              </button>
            ))}
          </div>
        </div>
      );
    }
    // Section detail screen
    return (
      <div className="flex h-full flex-col bg-surface">
        <div className="safe-top sticky top-0 z-10 flex items-center gap-2 border-b border-edge bg-surface px-2 py-2.5">
          <button
            onClick={() => setActive(null)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-2 active:bg-surface-2"
            title="Back"
          >
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-sm font-semibold text-ink">{activeLabel}</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{renderSection()}</div>
      </div>
    );
  }

  // Desktop / tablet: sidebar + content
  return (
    <div className="relative flex h-full overflow-hidden">
      <CollapsibleSidebar
        side="left"
        width="w-44"
        showAt="@3xl"
        panelClassName="bg-surface-2 p-3"
        toggleIcon={<SettingsIcon size={14} />}
        toggleLabel="Settings"
      >
        <h2 className="mb-3 px-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Settings
        </h2>
        <nav className="space-y-1 text-sm">
          {visibleSections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                active === s.id
                  ? "bg-surface-3 text-ink"
                  : "text-ink-muted hover:bg-surface-3 hover:text-ink"
              }`}
            >
              {s.icon}
              <span>{s.label}</span>
            </button>
          ))}
        </nav>
      </CollapsibleSidebar>

      <div className="flex-1 overflow-y-auto p-6">{renderSection()}</div>
    </div>
  );
}
