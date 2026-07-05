// Thin wrappers around Capacitor plugins. All calls are guarded so the web
// build (demo mode, plus development in the browser) never crashes when a
// plugin is missing — calls just become no-ops.

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { SplashScreen } from '@capacitor/splash-screen';

const isNative = Capacitor.isNativePlatform();

/**
 * Tag <html> with `native-app` when running inside Capacitor, so CSS can
 * apply app-only behaviour (e.g. suppressing the iOS long-press text-selection
 * loupe on UI chrome) without changing the web build. Call once at startup.
 */
export function markNativePlatform() {
  if (!isNative) return;
  document.documentElement.classList.add('native-app');
}

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
    // 'Native' resizes the whole WKWebView frame when the keyboard appears, so
    // `vh` units and `position: fixed` elements shrink to the area ABOVE the
    // keyboard. This is what makes a sticky modal footer / bottom-of-page Save
    // button reachable.
    //
    // (Was 'Body', which only resizes <body>. Because our editor modals are
    // `position: fixed; inset-0` sized in vh, Body mode left them anchored to
    // the full layout viewport — so their Save footer rendered behind the
    // keyboard and couldn't be scrolled to. 'Native' fixes that everywhere.)
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
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
