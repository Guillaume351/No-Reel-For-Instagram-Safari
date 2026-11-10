# No Reel For Instagram - Safari Extension

**Keep useful Instagram browsing while hiding Reels and other distractions in Safari.**

[Download No Reel on the App Store](https://apps.apple.com/app/apple-store/id6752605548?pt=118619543&ct=noreel-github-202609&mt=8) · **One purchase, no subscription**

No Reel works on **Instagram Web in Safari**, not inside the official Instagram app. Enable the extension and allow instagram.com after installation. Some native publishing and notification features may not be available on the website.

**En français :** masquez les Reels sur Instagram Web dans Safari. Achat unique, sans abonnement. L’extension ne modifie pas l’app Instagram.

## Overview

**No Reel For Instagram** is a Safari extension that hides Instagram Reels and other distracting surfaces from instagram.com and m.instagram.com. Enjoy a calmer feed by stripping Reels entry points, suggested posts and users, and the Stories bar while you browse Instagram on your Mac or iPhone.

**Available for macOS and iOS (iPhone).**

## Features

- Hides Reels navigation and Reel posts in Home, filters Reel cards in Search, and can remove the entire recommended Search / Explore grid on desktop and mobile web.
- Optionally removes the Stories bar. Turn off **Hide Stories bar** in the Safari popup to keep Stories visible.
- Filters suggested and sponsored posts, strips the "For You" tab, and removes the Suggested Users rail in the home feed.
- Runs locally in Safari with no tracking or analytics.
- Works seamlessly with Safari on macOS and iPhone.

## Installation Options

### App Store

Support the development by getting the extension from the App Store on your Mac or iPhone:

[![Download on the App Store](https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg)](https://apps.apple.com/app/apple-store/id6752605548?pt=118619543&ct=noreel-github-202609&mt=8)

- Watch the iPhone installation video:

  <video controls width="100%" preload="metadata">
    <source src="https://nextcloud.d1.guillaumeclaverie.com/s/tMNzFji7m9Ka8ZX/download" type="video/mp4">
    <a href="https://nextcloud.d1.guillaumeclaverie.com/s/tMNzFji7m9Ka8ZX">Open the tutorial in Safari</a>
  </video>

### Build it yourself

You can also build and run the project for free using Xcode:

1. Clone this repository
2. Open the project in Xcode (`xed "No Reel For Instagram.xcodeproj"`)
3. Build and run the extension on macOS or iOS (iPhone)

### Regression tests

Run `npm install`, then `npm test` to exercise the extension against anonymized mobile Instagram DOM fixtures.

## Usage

Once installed and enabled, the extension automatically hides reels and the other targeted modules across Instagram on your Mac or iPhone. Toggle features directly from the popup whenever you need to adjust what gets hidden—changes take effect immediately.

To enable the extension:

- **On macOS:** Open Safari → Settings (or Preferences) → Extensions and enable "No Reel For Instagram".
- **On iPhone:** Open Settings → Safari → Extensions, enable "No Reel For Instagram", then allow access for `instagram.com`.

## Contributing

Contributions are welcome! If you have suggestions for improvements or find any issues, please open an issue or submit a pull request.

## Contact

For any questions or support, please open an issue on the repository or email guillaume.claverie@mail.com.

Looking for a similar experience on YouTube? Check out [No YouTube Shorts - Safari Extension](https://github.com/Guillaume351/No-YouTube-Shorts-Safari).

## Filter your other social websites

[Explore the three-extension bundle](https://apps.apple.com/app-bundle/id1878643524) for YouTube, Instagram and X in Safari. Check each included app’s device compatibility and your price on the App Store. BrowseKind Plus is separate and is not included.

## Does No Reel change the Instagram app?

No. Safari extensions filter websites in Safari. Open instagram.com in Safari and allow the extension on that website to use its filters.


## Choose navigation and content separately

- **Hide Reels tab** removes the Reels navigation shortcut. **Hide Reels in Home** independently filters Reel posts in the Home feed. Turn the second option off to keep Reels shared by people you follow while hiding the Reels tab.
- **Hide Search / Explore shortcut** removes the navigation entry. **Hide Explore recommendations** independently hides recommended photos and Reels on the discovery landing page while preserving manual keyword searches. Keep the shortcut visible if you want to use search.
- **Hide Search Reels** remains a separate choice for filtering Reel cards in Search and Explore, including intentional searches.
- Existing saved choices are preserved during upgrade: the two new content options initially inherit their previous combined setting. Explicit independent choices are kept on later launches.

## Can I use an iPhone Home Screen shortcut?

Use a shortcut that opens Instagram in a normal Safari tab so the extension can run. On iOS 26 and iPadOS 26, turn off **Open as Web App** when adding the site to the Home Screen to create a browser bookmark. A standalone Home Screen web app uses a different browsing context; report your device and OS version if the extension is unavailable there. This iPhone/iPad guidance does not describe Mac web apps, which can support Safari web extensions.

Apple documents the bookmark option in [WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) and Mac support in [Add extensions to web apps in Safari on Mac](https://support.apple.com/en-gb/guide/safari/ibrw4a0164a5/mac).
