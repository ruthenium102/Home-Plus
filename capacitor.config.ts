import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.benellis.homeplus',
  appName: 'Home Plus',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  ios: {
    contentInset: 'automatic',
    // Match the light-theme --bg cream so the WKWebView host doesn't show
    // black during the iOS rubber-band overscroll. Dark mode shifts via JS
    // on the body bg, but iOS only reads this once at launch.
    backgroundColor: '#F8F4ED'
  }
};

export default config;
