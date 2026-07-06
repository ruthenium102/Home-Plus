import UIKit
import WebKit
import Capacitor

// UIScene lifecycle host. The window (and therefore the rubber-band overscroll
// area iOS paints behind the WebView) now lives on the scene rather than the
// AppDelegate, so the dark-mode background fix that used to live in AppDelegate
// moved here. The storyboard (UISceneStoryboardFile = Main in Info.plist)
// auto-instantiates the Capacitor bridge VC into `window` before
// scene(_:willConnectTo:) runs.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?
    private var themeColorObservation: NSKeyValueObservation?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard scene is UIWindowScene else { return }
        applyHostBackground()
        observeWebViewThemeColor()

        // Forward any launch-time URL / universal-link so Capacitor still sees
        // it under the scene lifecycle (these no longer reach the AppDelegate).
        if let url = connectionOptions.urlContexts.first?.url {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared, open: url, options: [:]
            )
        }
        if let userActivity = connectionOptions.userActivities.first {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared, continue: userActivity
            ) { _ in }
        }
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        applyHostBackground()
        observeWebViewThemeColor()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared, open: url, options: [:]
        )
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared, continue: userActivity
        ) { _ in }
    }

    private func findWebView() -> WKWebView? {
        guard let root = window?.rootViewController else { return nil }
        for sub in root.view.subviews {
            if let wk = sub as? WKWebView { return wk }
        }
        return nil
    }

    /// The app has its OWN theme setting (light/dark/system) that can differ
    /// from the OS appearance — keying the host colour off traitCollection
    /// painted a cream overscroll band under dark-themed pages whenever the
    /// phone itself was in light mode. The web app already mirrors its
    /// resolved theme into <meta name="theme-color"> (ThemeContext), which
    /// iOS 15+ surfaces as the KVO-observable WKWebView.themeColor — so we
    /// track that and repaint whenever the in-app theme flips.
    private func observeWebViewThemeColor() {
        guard themeColorObservation == nil, let wk = findWebView() else { return }
        if #available(iOS 15.0, *) {
            themeColorObservation = wk.observe(\.themeColor, options: [.initial, .new]) {
                [weak self] _, _ in
                DispatchQueue.main.async { self?.applyHostBackground() }
            }
        }
    }

    /// Cream in light, deep cocoa in dark — kept in sync with the web --bg
    /// token. Prefers the page's live meta theme-color (= the app's resolved
    /// theme); falls back to the OS appearance until the page has loaded.
    /// Applied to the window + the Capacitor bridge's WKWebView scroll view
    /// so overscroll never shows the wrong colour.
    private func applyHostBackground() {
        let wk = findWebView()
        var color: UIColor
        if #available(iOS 15.0, *), let pageTheme = wk?.themeColor {
            color = pageTheme
        } else {
            let dark = window?.traitCollection.userInterfaceStyle == .dark
                || UITraitCollection.current.userInterfaceStyle == .dark
            color = dark
                ? UIColor(red: 0x1a/255.0, green: 0x18/255.0, blue: 0x15/255.0, alpha: 1)
                : UIColor(red: 0xf8/255.0, green: 0xf4/255.0, blue: 0xed/255.0, alpha: 1)
        }
        window?.backgroundColor = color
        if let root = window?.rootViewController {
            root.view.backgroundColor = color
            if let wk {
                wk.backgroundColor = color
                wk.scrollView.backgroundColor = color
                // iOS 15+: the rubber-band overscroll area is painted with
                // underPageBackgroundColor (defaults to systemBackground —
                // white) and IGNORES scrollView.backgroundColor. Without
                // this line the app shows a white band when scrolled past
                // the top/bottom, whatever the colours above say.
                wk.underPageBackgroundColor = color
                wk.isOpaque = true
            }
        }
    }
}
