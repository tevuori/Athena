import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";

let initialized = false;

export function isCapacitor(): boolean {
  return Capacitor.isNativePlatform();
}

export async function initCapacitor() {
  if (initialized || !isCapacitor()) return;
  initialized = true;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setOverlaysWebView({ overlay: true });
  } catch {
    // StatusBar plugin may not be available on all platforms.
  }

  try {
    await SplashScreen.hide();
  } catch {
    // noop
  }

  void checkForUpdateOnStartup();
}

async function checkForUpdateOnStartup() {
  try {
    const { checkForUpdate } = await import("../../services/updater");
    const { useUpdater } = await import("../../store/updater");
    const info = await checkForUpdate();
    if (info) useUpdater.getState().promptUpdate(info);
  } catch {
    // Network/rate-limit/parse errors are expected and harmless here.
  }
}
