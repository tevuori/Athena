/**
 * Capacitor native integration. This module is dynamically imported only when
 * the app detects it's running inside a Capacitor native shell (vs. a regular
 * browser/PWA). It initializes:
 *   - Status bar styling (overlay webview, dark theme)
 *   - Hardware back button → mobile stack back navigation
 *   - Haptic feedback on context menu open / FAB tap
 *   - Splash screen hide after app is ready
 *
 * In a browser/PWA context, none of this code runs — the imports are tree-
 * shaken away because the dynamic import guard never fires.
 */

import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

let initialized = false;

export function isCapacitor(): boolean {
  return Capacitor.isNativePlatform();
}

export async function initCapacitor() {
  if (initialized || !isCapacitor()) return;
  initialized = true;

  // Status bar — overlay the webview so safe-area-inset works.
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setOverlaysWebView({ overlay: true });
  } catch {
    // StatusBar plugin may not be available on all platforms.
  }

  // Hide splash screen once React has mounted.
  try {
    await SplashScreen.hide();
  } catch {
    // noop
  }

  // Hardware back button → pop the mobile app stack, or exit if on home.
  CapApp.addListener("backButton", ({ canGoBack }) => {
    void importCapacitorWindows().then(({ mobileOnHome, mobileBack }) => {
      if (!mobileOnHome) {
        mobileBack();
      } else if (!canGoBack) {
        // On home with no app stack — exit the app.
        CapApp.exitApp();
      }
    });
  });

  // Background check for a newer APK release on GitHub. If one is found (and
  // not skipped), surface the update dialog. Failures are silent — this runs
  // on every cold start and must never block the UI.
  void checkForUpdateOnStartup();
}

/** Auto-check for an APK update on native startup; surface via UpdateDialog. */
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

// Lazy import to avoid pulling the windows store into the Capacitor chunk.
async function importCapacitorWindows() {
  const { useWindows } = await import("../../store/windows");
  const state = useWindows.getState();
  return {
    mobileOnHome: state.mobileOnHome,
    mobileBack: state.mobileBack,
  };
}

/** Light haptic tap (e.g. on button press, context menu open). */
export async function hapticLight() {
  if (!isCapacitor()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // noop
  }
}

/** Medium haptic (e.g. on FAB tap, sheet open). */
export async function hapticMedium() {
  if (!isCapacitor()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    // noop
  }
}

/** Notification-style haptic (success, warning, error). */
export async function hapticNotification(type: "success" | "warning" | "error") {
  if (!isCapacitor()) return;
  try {
    const capType =
      type === "success" ? NotificationType.Success :
      type === "warning" ? NotificationType.Warning :
      NotificationType.Error;
    await Haptics.notification({ type: capType });
  } catch {
    // noop
  }
}
