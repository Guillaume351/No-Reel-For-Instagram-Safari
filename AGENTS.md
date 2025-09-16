# Repository Guidelines

## Project Structure & Module Organization
The Xcode project (`No Reel For Instagram.xcodeproj`) drives every target. Platform folders such as `iOS (App)` and `macOS (App)` contain platform-specific app delegates, storyboards inside `Base.lproj`, and plist configuration. Shared UI code and assets live in `Shared (App)`; keep reusable Swift views or controllers beside `Resources/` and `Assets.xcassets`. Safari extension sources sit in `Shared (Extension)` with platform wrappers in `iOS (Extension)` and `macOS (Extension)`. Group new files in these directories so the project navigator mirrors the filesystem.

## Build, Test, and Development Commands
Open the workspace with `xed "No Reel For Instagram.xcodeproj"` or by double-clicking in Finder. Use `xcodebuild -scheme "No Reel For Instagram" -destination "platform=iOS Simulator,name=iPhone 15" build` for CI-friendly builds, and switch the destination to `platform=macOS` for the macOS target. Run the Safari extension locally through the host app: select the scheme, enable the extension in Safari’s Develop menu, and re-run after asset changes.

## Coding Style & Naming Conventions
Follow Swift API Design Guidelines: camelCase for functions and variables, PascalCase for types, and uppercase `case` names when bridging Objective-C enums. Indent with four spaces and prefer 120-character lines. Run Xcode’s `Editor > Format > Re-Indent` before committing to keep brace placement uniform. Keep assets named with lower_snake_case to match references inside `Assets.xcassets`, and store localized strings under `Resources`.

## Testing Guidelines
Adopt XCTest for unit and UI coverage. Place shared test targets under a `Tests` group parallel to `Shared (App)` so they can be reused across platforms. Name test files with the `SubjectTests.swift` pattern and mark async UI expectations with short timeouts. Execute tests via `xcodebuild -scheme "No Reel For Instagram" test -destination "platform=iOS Simulator,name=iPhone 15"` to surface regressions before pushing.

## Commit & Pull Request Guidelines
Write imperative, concise commit subjects (`Add shared media downloader`). Use the body to summarize intent and mention impacted targets (`Shared (App)`, `iOS (App)`). Pull requests should describe user-facing changes, list manual test steps (simulator model, Safari extension enablement), and link to tracking issues. Attach screenshots or screen recordings whenever UI or Safari extension dialogs change.

## Safari Extension Status (2025-09-16)
- Popup toggles persist three features via `storage.sync`: hiding Reels surfaces, "For You" posts, and suggested users. Each toggle drives page-side controllers injected from `content.js`.
- Popup toggles persist four features via `storage.sync`: hiding Reels surfaces, "For You" posts, suggested users, and the Stories carousel. Each toggle drives page-side controllers injected from `content.js`.
- `Hide For You posts` removes the first instagram.com feed tab, activates the following feed, and forces a `/?variant=following` navigation if the UI click fails.
- `Hide Suggested users` strips the "Suggestions pour vous" rail and any regenerated recommendation blocks, including the follow buttons.
- `Hide Reels surfaces` currently removes discover/Reels links from the left navigation menu and will be extended to page modules next.
- `Hide Stories bar` collapses the top stories carousel (ul._acay) and keeps it hidden as Instagram re-renders the feed.

### Next Steps
1. Expand the Reels controller to target in-feed reels carousels and modal reels players.
2. Extend the Stories controller to handle mobile web markup and story modals.
3. Audit mobile (m.instagram.com) markup for equivalent selectors across all toggles.
4. Add automated smoke coverage (Playwright or XCTest) around enabled/disabled toggles once selectors stabilise.
