//
//  ViewController.swift
//  Shared (App)
//
//  Created by Guillaume Claverie on 16/09/2025.
//

import WebKit

#if os(iOS)
import StoreKit
import UIKit
typealias PlatformViewController = UIViewController
#elseif os(macOS)
import Cocoa
import SafariServices
typealias PlatformViewController = NSViewController
#endif

let extensionBundleIdentifier = "com.guillaumeclaverie.No-Reel-For-Instagram.Extension"

#if os(iOS)
/// Dismissible cross-promotion card for BrowseKind, a separate iPhone-only app (iOS 17+)
/// by the same developer. No tracking or network call: the card is local HTML and the
/// App Store page is shown with StoreKit's overlay (apps.apple.com as a fallback).
enum BrowseKindPromo {
    static let appStoreID = "6796664167"
    static let appStoreURL = URL(string: "https://apps.apple.com/app/id6796664167")!
    static let dismissedDefaultsKey = "browseKindPromo.dismissed"

    static var shouldShow: Bool {
        guard #available(iOS 17.0, *) else {
            return false
        }
        guard !ProcessInfo.processInfo.isiOSAppOnMac,
              UIDevice.current.userInterfaceIdiom == .phone else {
            return false
        }
        return !UserDefaults.standard.bool(forKey: dismissedDefaultsKey)
    }

    static func dismiss() {
        UserDefaults.standard.set(true, forKey: dismissedDefaultsKey)
    }
}
#endif

class ViewController: PlatformViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        installHostStrings()
#if os(iOS)
        webView.evaluateJavaScript("show('ios')")

        // Safari installation cannot be verified here. Keep activation focused
        // on No Reel rather than showing a separate app promotion at launch.
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
            }
        }
#endif
    }

    private func installHostStrings() {
        var localizedStrings: [String: Any] = [:]
        for locale in ["en", "fr", "es", "de", "ar"] {
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
                from: ["en", "fr", "es", "de", "ar"], forPreferences: Locale.preferredLanguages
              ).first ?? "en", options: .fragmentsAllowed),
              let localeJSON = String(data: localeData, encoding: .utf8) else {
            return
        }
        // WKWebView file pages do not need a fetch() to load their local strings.
        webView.evaluateJavaScript("window.noReelHostStrings = \(json); window.noReelHostLocale = \(localeJSON)")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
#if os(iOS)
        if message.body as? String == "open-browsekind" {
            presentBrowseKindOnAppStore()
        } else if message.body as? String == "dismiss-browsekind-promo" {
            BrowseKindPromo.dismiss()
        }
#elseif os(macOS)
        if (message.body as! String != "open-preferences") {
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
    func presentBrowseKindOnAppStore() {
        guard let scene = view.window?.windowScene else {
            openBrowseKindAppStoreURL()
            return
        }

        let configuration = SKOverlay.AppConfiguration(appIdentifier: BrowseKindPromo.appStoreID, position: .bottom)
        configuration.userDismissible = true

        let overlay = SKOverlay(configuration: configuration)
        overlay.delegate = self
        overlay.present(in: scene)
    }

    func storeOverlayDidFailToLoad(_ overlay: SKOverlay, error: Error) {
        DispatchQueue.main.async {
            self.openBrowseKindAppStoreURL()
        }
    }

    private func openBrowseKindAppStoreURL() {
        UIApplication.shared.open(BrowseKindPromo.appStoreURL, options: [:], completionHandler: nil)
    }
}
#endif
