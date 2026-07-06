import UIKit
import WebKit
import Capacitor

// Owns all WKWebView host styling and scroll behaviour. This lives HERE (not
// in SceneDelegate) because `webView` is guaranteed to exist by viewDidLoad —
// the scene-side subview scanning used previously could run before the bridge
// attached its web view and silently leave the overscroll area
// systemBackground white. The storyboard instantiates this subclass.
class ViewController: CAPBridgeViewController {

    private var themeColorObservation: NSKeyValueObservation?

    override func viewDidLoad() {
        super.viewDidLoad()
        guard let wk = webView else { return }

        // Native scroll feel:
        //  - bounce/rubber-band at both edges, even when the page is shorter
        //    than the viewport (this is the springy "pull past the end" that
        //    the native pull-down menus have — a fixed UIKit curve that already
        //    ramps up resistance the further you pull past the top/bottom).
        //  - a slightly heavier deceleration than the default .normal (0.998)
        //    so a flick glides but still settles with control rather than
        //    flying to the bottom. Tunable: raise toward 0.998 for more glide,
        //    lower toward .fast (0.99) for a stickier stop. (0.996 = a touch
        //    more glide than the initial 0.992, per Ben's feedback; the edge
        //    bounce is independent of this and stays the same.)
        wk.scrollView.bounces = true
        wk.scrollView.alwaysBounceVertical = true
        wk.scrollView.decelerationRate = UIScrollView.DecelerationRate(rawValue: 0.996)

        applyHostBackground()

        // The app has its OWN theme setting (light/dark/system) that can
        // differ from the OS appearance. The web side mirrors its resolved
        // theme into <meta name="theme-color"> (ThemeContext), which iOS 15+
        // surfaces as the KVO-observable `themeColor` — observe it so the
        // native chrome always matches the page, including live in-app theme
        // flips and the initial load.
        if #available(iOS 15.0, *) {
            themeColorObservation = wk.observe(\.themeColor, options: [.initial, .new]) {
                [weak self] _, _ in
                DispatchQueue.main.async { self?.applyHostBackground() }
            }
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // Re-apply once attached to the window so window.backgroundColor
        // (nil during viewDidLoad) gets painted too.
        applyHostBackground()
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        // Only matters while the page hasn't reported a theme-color yet
        // (fallback path below) — harmless afterwards.
        applyHostBackground()
    }

    private func applyHostBackground() {
        guard let wk = webView else { return }
        var color: UIColor
        if #available(iOS 15.0, *), let pageTheme = wk.themeColor {
            color = pageTheme
        } else {
            // Pre-load fallback: cream in light, deep cocoa in dark — matches
            // the web --bg token.
            let dark = traitCollection.userInterfaceStyle == .dark
            color = dark
                ? UIColor(red: 0x1a/255.0, green: 0x18/255.0, blue: 0x15/255.0, alpha: 1)
                : UIColor(red: 0xf8/255.0, green: 0xf4/255.0, blue: 0xed/255.0, alpha: 1)
        }
        view.backgroundColor = color
        view.window?.backgroundColor = color
        wk.backgroundColor = color
        wk.scrollView.backgroundColor = color
        // iOS 15+: the rubber-band overscroll area is painted with
        // underPageBackgroundColor (defaults to systemBackground — white) and
        // IGNORES scrollView.backgroundColor. This is the line that actually
        // removes the white bands.
        wk.underPageBackgroundColor = color
        wk.isOpaque = true
    }
}
