// Thin wrappers around Capacitor plugins. All calls are guarded so the web
// build (demo mode, plus development in the browser) never crashes when a
// plugin is missing — calls just become no-ops.

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { SplashScreen } from '@capacitor/splash-screen';

const isNative = Capacitor.isNativePlatform();

/** Sync the iOS status-bar style to the resolved theme. */
export async function setStatusBarForTheme(resolved: 'light' | 'dark') {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: resolved === 'dark' ? Style.Dark : Style.Light });
  } catch {
    /* not all platforms support this */
  }
}

/** Configure keyboard resize behaviour. Call once at app start. */
export async function configureKeyboard() {
  if (!isNative) return;
  try {
    // 'Body' resize avoids covering modal inputs — the WebView shrinks to fit.
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
  } catch {
    /* ignore */
  }
}

/** Light tap haptic — PIN entry, chore/habit completion, swipe commit. */
export async function hapticLight() {
  if (!isNative) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* ignore */
  }
}

/** Medium tap haptic — for slightly heavier confirmations. */
export async function hapticMedium() {
  if (!isNative) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    /* ignore */
  }
}

/** Hide the native launch splash. Call once React has painted the first
 *  screen so there's no white/cream flash between splash and content. */
export async function hideSplash() {
  if (!isNative) return;
  try {
    await SplashScreen.hide();
  } catch {
    /* ignore */
  }
}
