import UIKit
import WebKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        // Match the native host + WKWebView background to the current system
        // appearance so the rubber-band overscroll area (which iOS paints, not
        // the web layer) isn't a cream flash for dark-mode users. Re-applied on
        // trait changes via applicationDidBecomeActive + the appearance check.
        applyHostBackground()
        return true
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

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
        applyHostBackground()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
