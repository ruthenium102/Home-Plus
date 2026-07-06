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

        // Native scroll feel: rubber-band at both edges (even when the page is
        // shorter than the viewport) with the standard deceleration curve.
        wk.scrollView.alwaysBounceVertical = true
        wk.scrollView.decelerationRate = .normal

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
