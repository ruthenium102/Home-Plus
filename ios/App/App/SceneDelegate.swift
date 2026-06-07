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

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard scene is UIWindowScene else { return }
        applyHostBackground()

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

    /// Cream in light, deep cocoa in dark — kept in sync with the web --bg
    /// token. Applied to the window + the Capacitor bridge's WKWebView scroll
    /// view so overscroll never shows the wrong colour.
    private func applyHostBackground() {
        let dark = window?.traitCollection.userInterfaceStyle == .dark
            || UITraitCollection.current.userInterfaceStyle == .dark
        let color = dark
            ? UIColor(red: 0x1a/255.0, green: 0x18/255.0, blue: 0x15/255.0, alpha: 1)
            : UIColor(red: 0xf8/255.0, green: 0xf4/255.0, blue: 0xed/255.0, alpha: 1)
        window?.backgroundColor = color
        if let root = window?.rootViewController {
            root.view.backgroundColor = color
            for sub in root.view.subviews {
                if let wk = sub as? WKWebView {
                    wk.backgroundColor = color
                    wk.scrollView.backgroundColor = color
                    wk.isOpaque = true
                }
            }
        }
    }
}
