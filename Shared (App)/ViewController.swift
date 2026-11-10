//
//  ViewController.swift
//  Shared (App)
//
//  Created by Guillaume Claverie on 16/09/2025.
//

import WebKit

#if os(iOS)
import SafariServices
import StoreKit
import UIKit
typealias PlatformViewController = UIViewController
#elseif os(macOS)
import Cocoa
import SafariServices
typealias PlatformViewController = NSViewController
#endif

let extensionBundleIdentifier = "com.guillaumeclaverie.No-Reel-For-Instagram.Extension"

/// Languages of Resources/Locales/<code>/host.json. Norwegian Bokmål is "nb".
let hostLocales = ["en", "fr", "es", "de", "ar", "ja", "it", "nl", "tr", "pl", "sv", "da", "nb", "fi"]

/// Dismissible card for the developer's other paid Safari extensions: No Shorts (YouTube,
/// iPhone, iPad and Mac) and the "Social Media : Dopamine Detox" App Store bundle (iOS only).
/// No tracking or network call: the card is local HTML. It stays hidden during the first
/// activation and appears once the extension is known to be on, or on a later day.
enum SisterAppsPromo {
    static let noShortsAppStoreID = "6502996298"
    static let noShortsAppStoreURL = URL(string: "https://apps.apple.com/app/id6502996298")!
    static let bundleAppStoreURL = URL(string: "https://apps.apple.com/app-bundle/id1878643524")!
    static let dismissedDefaultsKey = "sisterAppsPromo.dismissed"

    static func shouldShow(extensionIsEnabled: Bool?) -> Bool {
#if os(iOS)
        guard !ProcessInfo.processInfo.isiOSAppOnMac else {
            return false
        }
#endif
        guard !UserDefaults.standard.bool(forKey: dismissedDefaultsKey) else {
            return false
        }
        return extensionIsEnabled == true || ReviewRequestCoordinator.shared.activeDayCount >= 2
    }

    static func dismiss() {
        UserDefaults.standard.set(true, forKey: dismissedDefaultsKey)
    }
}

class ViewController: PlatformViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

#if os(iOS)
        // People leave for Settings and Safari during setup; count the return as an active day.
        NotificationCenter.default.addObserver(
            self, selector: #selector(applicationWillEnterForeground),
            name: UIApplication.willEnterForegroundNotification, object: nil)
#endif

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

#if os(iOS)
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        ReviewRequestCoordinator.shared.recordActiveDay()
    }

    @objc private func applicationWillEnterForeground() {
        ReviewRequestCoordinator.shared.recordActiveDay()
        refreshExtensionState()
    }

    /// The extension state API needs iOS 26.2. On earlier versions the state is unknown:
    /// the promo then waits for a later day and no review is requested.
    private func refreshExtensionState() {
        guard #available(iOS 26.2, *) else {
            applyExtensionState(isEnabled: nil)
            return
        }

        SFSafariExtensionManager.getStateOfExtension(withIdentifier: extensionBundleIdentifier) { [weak self] state, error in
            DispatchQueue.main.async {
                self?.applyExtensionState(isEnabled: error == nil ? state?.isEnabled : nil)
            }
        }
    }

    private func applyExtensionState(isEnabled: Bool?) {
        if SisterAppsPromo.shouldShow(extensionIsEnabled: isEnabled) {
            webView.evaluateJavaScript("showSisterAppsPromo('ios')")
        }
        ReviewRequestCoordinator.shared.requestReviewIfAppropriate(
            extensionIsEnabled: isEnabled ?? false,
            in: view.window?.windowScene)
    }
#elseif os(macOS)
    override func viewDidAppear() {
        super.viewDidAppear()
        ReviewRequestCoordinator.shared.recordActiveDay()
    }
#endif

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        installHostStrings()
#if os(iOS)
        webView.evaluateJavaScript("show('ios')")

        // The first activation stays focused on No Reel: the promo needs a known-enabled
        // extension or a later visit (see SisterAppsPromo.shouldShow).
        refreshExtensionState()
#elseif os(macOS)
        webView.evaluateJavaScript("show('mac')")

        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            guard let state = state, error == nil else {
                // Insert code to inform the user that something went wrong.
                return
            }

            DispatchQueue.main.async {
                if #available(macOS 13, *) {
                    webView.evaluateJavaScript("show('mac', \(state.isEnabled), true)")
                } else {
                    webView.evaluateJavaScript("show('mac', \(state.isEnabled), false)")
                }

                if SisterAppsPromo.shouldShow(extensionIsEnabled: state.isEnabled) {
                    webView.evaluateJavaScript("showSisterAppsPromo('mac')")
                }
                ReviewRequestCoordinator.shared.requestReviewIfAppropriate(
                    extensionIsEnabled: state.isEnabled,
                    from: self)
            }
        }
#endif
    }

    private func installHostStrings() {
        var localizedStrings: [String: Any] = [:]
        for locale in hostLocales {
            guard let url = Bundle.main.url(forResource: "host", withExtension: "json", subdirectory: "Locales/\(locale)"),
                  let data = try? Data(contentsOf: url),
                  let strings = try? JSONSerialization.jsonObject(with: data) else {
                continue
            }
            localizedStrings[locale] = strings
        }
        guard !localizedStrings.isEmpty,
              let data = try? JSONSerialization.data(withJSONObject: localizedStrings),
              let json = String(data: data, encoding: .utf8),
              let localeData = try? JSONSerialization.data(withJSONObject: Bundle.preferredLocalizations(
                from: hostLocales, forPreferences: Locale.preferredLanguages
              ).first ?? "en", options: .fragmentsAllowed),
              let localeJSON = String(data: localeData, encoding: .utf8) else {
            return
        }
        // WKWebView file pages do not need a fetch() to load their local strings.
        webView.evaluateJavaScript("window.noReelHostStrings = \(json); window.noReelHostLocale = \(localeJSON)")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let body = message.body as? String
        if body == "dismiss-sister-apps-promo" {
            SisterAppsPromo.dismiss()
            return
        }
#if os(iOS)
        if body == "open-no-shorts" {
            presentNoShortsOnAppStore()
        } else if body == "open-bundle" {
            UIApplication.shared.open(SisterAppsPromo.bundleAppStoreURL, options: [:], completionHandler: nil)
        }
#elseif os(macOS)
        if body == "open-no-shorts" {
            NSWorkspace.shared.open(SisterAppsPromo.noShortsAppStoreURL)
            return
        }

        if body != "open-preferences" {
            return
        }

        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            DispatchQueue.main.async {
                if error != nil {
                    self.webView.evaluateJavaScript("showPreferencesError()")
                } else {
                    NSApp.terminate(self)
                }
            }
        }
#endif
    }

}

#if os(iOS)
extension ViewController: SKOverlayDelegate {
    func presentNoShortsOnAppStore() {
        guard let scene = view.window?.windowScene else {
            openNoShortsAppStoreURL()
            return
        }

        let configuration = SKOverlay.AppConfiguration(appIdentifier: SisterAppsPromo.noShortsAppStoreID, position: .bottom)
        configuration.userDismissible = true

        let overlay = SKOverlay(configuration: configuration)
        overlay.delegate = self
        overlay.present(in: scene)
    }

    func storeOverlayDidFailToLoad(_ overlay: SKOverlay, error: Error) {
        DispatchQueue.main.async {
            self.openNoShortsAppStoreURL()
        }
    }

    private func openNoShortsAppStoreURL() {
        UIApplication.shared.open(SisterAppsPromo.noShortsAppStoreURL, options: [:], completionHandler: nil)
    }
}
#endif
