import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.benellis.homeplus',
  appName: 'Home Plus',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      // We hide the splash from JS (hideSplash) once React paints the first
      // screen, so there's no flash. launchAutoHide:false keeps the native
      // splash up until then; the long fallback timeout is just a safety net.
      launchAutoHide: false,
      launchFadeOutDuration: 200,
      backgroundColor: '#F8F4ED',
      showSpinner: false,
    },
  },
  ios: {
    // 'never', NOT 'automatic': the web layer already pads for every safe-area
    // inset via env(safe-area-inset-*) (see App.tsx outer wrapper + dock).
    // 'automatic' made WKWebView ALSO inset the scroll view for the status bar,
    // so the notch height was applied twice — a big empty gap at the top of
    // every page. Let CSS be the single source of truth for insets.
    contentInset: 'never',
    // No web-style long-press link previews — the preview gesture recognizer
    // competes with touches over the whole page and this is an app, not a
    // browser.
    allowsLinkPreview: false,
    // Match the light-theme --bg cream so the WKWebView host doesn't show
    // black during the iOS rubber-band overscroll. Dark mode shifts via JS
    // on the body bg, but iOS only reads this once at launch.
    backgroundColor: '#F8F4ED'
  }
};

export default config;
