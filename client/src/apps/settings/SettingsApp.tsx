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
} from "lucide-react";
import { useAuth } from "../../store/auth";
import type { WindowInstance } from "../../store/windows";
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
import DataStorageSection from "./sections/DataStorageSection";
import AboutSection from "./sections/AboutSection";

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
  { id: "account", label: "Account", icon: <User size={15} /> },
  { id: "sound-athena", label: "Sound & Athena", icon: <Volume2 size={15} /> },
  { id: "athena", label: "Athena Assistant", icon: <Sparkles size={15} /> },
  { id: "integrations", label: "Integrations", icon: <Plug size={15} /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={15} /> },
  { id: "proactive-alerts", label: "Proactive Alerts", icon: <BellRing size={15} /> },
  { id: "users", label: "Users", icon: <UsersIcon size={15} />, adminOnly: true },
  { id: "data", label: "Data & Storage", icon: <Database size={15} /> },
  { id: "about", label: "About", icon: <Info size={15} /> },
];

export default function SettingsApp(_: { win: WindowInstance }) {
  const { user } = useAuth();
  const [active, setActive] = useState("appearance");
  const isAdmin = user?.role === "ADMIN";

  const visibleSections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);

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

      <div className="flex-1 overflow-y-auto p-6">
        {active === "appearance" && <AppearanceSection />}
        {active === "wallpaper" && <WallpaperSection />}
        {active === "animated-bg" && <AnimatedBgSection />}
        {active === "account" && <AccountSection />}
        {active === "sound-athena" && <SoundAthenaSection />}
        {active === "athena" && <AthenaSection />}
        {active === "integrations" && <IntegrationsSection />}
        {active === "notifications" && <NotificationsSection />}
        {active === "proactive-alerts" && <ProactiveAlertsSection />}
        {active === "users" && isAdmin && <UsersSection />}
        {active === "data" && <DataStorageSection />}
        {active === "about" && <AboutSection />}
      </div>
    </div>
  );
}
