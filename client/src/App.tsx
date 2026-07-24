import { useEffect, useState } from "react";
import { useAuth } from "./store/auth";
import { useFormFactor, initFormFactorListeners } from "./store/formfactor";
import BootScreen from "./shell/BootScreen";
import LoginScreen from "./shell/LoginScreen";
import DesktopEnvironment from "./shell/DesktopEnvironment";
import MobileShell from "./shell/mobile/MobileShell";
import UpdateDialog from "./shell/UpdateDialog";

type Phase = "boot" | "app";

export default function App() {
  const { status, refresh } = useAuth();
  const mode = useFormFactor((s) => s.mode);
  const [phase, setPhase] = useState<Phase>("boot");

  // On mount, check existing token + set up form-factor listeners
  useEffect(() => {
    refresh();
    const cleanup = initFormFactorListeners();
    // Initialize Capacitor native plugins if running inside a native shell.
    void import("./shell/mobile/capacitor").then((m) => m.initCapacitor());
    return cleanup;
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

  // Phone form factor → mobile shell; everything else → desktop shell.
  // (Tablets in portrait are currently routed to desktop; this can be
  // refined later to use the mobile shell on portrait tablets too.)
  return (
    <>
      {mode === "phone" ? <MobileShell /> : <DesktopEnvironment />}
      {/* Rendered once at the top level. Reads from the useUpdater store and
          is a no-op on web/PWA builds (the store is never populated there). */}
      <UpdateDialog />
    </>
  );
}
