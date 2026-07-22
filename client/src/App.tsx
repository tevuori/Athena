import { useEffect, useState } from "react";
import { useAuth } from "./store/auth";
import BootScreen from "./shell/BootScreen";
import LoginScreen from "./shell/LoginScreen";
import DesktopEnvironment from "./shell/DesktopEnvironment";

type Phase = "boot" | "app";

export default function App() {
  const { status, refresh } = useAuth();
  const [phase, setPhase] = useState<Phase>("boot");

  // On mount, check existing token
  useEffect(() => {
    refresh();
  }, [refresh]);

  if (phase === "boot") {
    return <BootScreen onDone={() => setPhase("app")} />;
  }

  if (status === "loading") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-950 text-slate-400">
        Loading...
      </div>
    );
  }

  if (status !== "authenticated") {
    return <LoginScreen />;
  }

  return <DesktopEnvironment />;
}
