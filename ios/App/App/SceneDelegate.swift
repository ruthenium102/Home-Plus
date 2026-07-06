import UIKit
import Capacitor

// UIScene lifecycle host. All WKWebView host styling / overscroll colour now
// lives in ViewController (a CAPBridgeViewController subclass instantiated by
// the storyboard) where the web view is guaranteed to exist — the scene just
// forwards launch URLs / universal links that no longer reach the AppDelegate.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard scene is UIWindowScene else { return }

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
}
