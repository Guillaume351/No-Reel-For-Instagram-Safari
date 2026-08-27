# No Reel For Instagram - Safari Extension

## Overview

**No Reel For Instagram** is a Safari extension that hides Instagram Reels and other distracting surfaces from instagram.com and m.instagram.com. Enjoy a calmer feed by stripping Reels entry points, suggested posts and users, and the Stories bar while you browse Instagram on your Mac or iPhone.

**Available for macOS and iOS (iPhone).**

## Features

- Hides Reels navigation and Reel posts in Home, filters Reel cards in Search, and can remove the entire recommended Search / Explore grid on desktop and mobile web.
- Removes the Stories bar and keeps it hidden as Instagram re-renders the feed.
- Filters suggested and sponsored posts, strips the "For You" tab, and removes the Suggested Users rail in the home feed.
- Runs locally in Safari with no tracking or analytics.
- Works seamlessly with Safari on macOS and iPhone.

## Installation Options

### App Store

Support the development by getting the extension from the App Store on your Mac or iPhone:

[![Download on the App Store](https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg)](https://apps.apple.com/fr/app/no-reel-for-instagram/id6752605548?l=en-GB&mt=12)

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
