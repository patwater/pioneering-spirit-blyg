# Agent brief: Blygger Desktop for Windows

> This brief is how the Windows port began. The port is done and now lives in [patwater/burrow-blyg-windows-](https://github.com/patwater/burrow-blyg-windows-); its `WINDOWS.md` describes what was built.

You are porting Blygger Desktop to Windows so that Patrick Atwater can read and write his blyg (https://pioneeringspirit.xyz) in one native app. Read this whole brief before writing code, and stop to ask Patrick when a decision below says to.

## The goal

The result should be a Windows build of Blygger Desktop with the same functionality as the macOS app, including the unified reading and writing experience. In one window, Patrick should be able to read the blygs and plain RSS feeds he subscribes to, triage them into hoppers, quote, stub, or fork what he reads, and write and publish fragments and threads to his own blyg. The macOS app already does this, so the work is a port, not a redesign.

## Where things are

- **The app:** https://github.com/aneeshsathe/blygger-desktop (MIT). It is a Rust workspace with four crates: `blyg-core` (API client, sync, SQLite store), `blyg-ai`, `blyg-render` (Markdown, TK, and transclusion preview), and `blyg-app` (the GPUI interface, with a `wry` webview for the full editor). Read its `README.md`, `CLAUDE.md`, and `docs/SERVER.md` first.
- **The protocol:** https://github.com/blygger/blygger-spec, especially `docs/protocol-v0.2.md` and `docs/v0.3-plan.md`.
- **Patrick's server:** https://github.com/patwater/pioneering-spirit-blyg. Its `worker/` folder is a verbatim copy of the upstream reference client and must never be edited (see that repo's `CLAUDE.md`).

## Part 1: Port the app to Windows

Work upstream-first. Fork `aneeshsathe/blygger-desktop`, keep every change behind `cfg(target_os = ...)` so the macOS build is unaffected, and aim to open a pull request to Aneesh rather than maintaining a long-lived fork. Open an issue on his repo early to say the port is underway and ask whether he has preferences.

The macOS-specific surface is small, and these are the places to change:

1. **Objective-C calls** in `crates/blyg-app/src/platform.rs` (dock icon), `src/main.rs` (bringing the window to front), and `src/studio/webview.rs` (webview first-responder handling). Replace each with a Windows equivalent or a no-op, using the `windows` crate if you need Win32 calls.
2. **Token storage.** `blyg-core` enables `keyring` with `apple-native`. Add `windows-native` for Windows so the token lives in Windows Credential Manager.
3. **Key bindings.** Map every `⌘` binding in `crates/blyg-app/src/keymap.rs` to `Ctrl`, and check that none of them collide with Windows system shortcuts. Update the labels shown in tooltips and the tour.
4. **Global hotkey for quick capture** (`global-hotkey`) works on Windows but pick a default that does not clash with common Windows shortcuts.
5. **Webview.** `wry` uses WebView2 on Windows. Confirm the full editor loads, and make the installer bootstrap the WebView2 runtime if it is missing.
6. **Paths.** Move data, cache, and config locations to `%APPDATA%` and `%LOCALAPPDATA%` through the platform-directory helpers rather than hard-coded macOS paths.
7. **Fonts.** Make sure the bundled fonts load from the Windows install directory.
8. **Auto-update.** The updater in `crates/blyg-app/src/update/` verifies signed releases and installs `.app` bundles. Keep the signature verification and add a Windows install path that replaces the installed files (an MSIX or an Inno Setup/WiX installer that the updater can launch). If this is large, disable auto-update on Windows for the first release and say so.
9. **Packaging and CI.** Add a Windows job to the release workflow that builds `x86_64-pc-windows-msvc` (and `aarch64` if cheap), produces an installer and a zip, and adds both to `SHA256SUMS`. The build will be unsigned at first, so document the SmartScreen warning the way the README documents Gatekeeper today.

Confirm early that the pinned GPUI snapshot (`gpui-kit = 0.6.6`) builds and renders on Windows. If it does not, stop and report to Patrick before attempting a GPUI upgrade, since that choice belongs to Aneesh.

## Part 2: Give Patrick's server what the app needs

The app talks to a blyg through its owner API and needs four small, additive extensions that upstream Blygger does not yet have. `docs/SERVER.md` in the app repo has the exact contracts. They are bearer-token owner auth, JSON reads for items and subscriptions, read extensions for the reading list, mentions, settings, and hoppers, and client-recorded AI provenance. Without them the app turns the matching features off, which would gut the reading experience.

Do not edit `worker/` in `patwater/pioneering-spirit-blyg`. Instead, choose one of these two routes and ask Patrick which he prefers before building:

- **Upstream (preferred long-term):** implement the extensions in `blygger/blygger-spec` as a pull request, then bring them into Patrick's repo with `npm run upgrade-worker`.
- **Local wrapper (fastest):** add a `server-ext/` folder to Patrick's repo containing a small Worker entry point that imports the reference client's app (`makeApp` in `worker/src/index.ts`), registers the extra `/api/...` routes against the same D1 database, and delegates everything else to the reference client. Point `main` in `wrangler.jsonc` at this entry, add tests for each extension, and keep `npm test` green. Store any new secret, such as the bearer token's signing key, with `wrangler secret put`.

Either way, never break the public protocol surface (`blyg.json`, `feed.xml`, `items/…`), and never publish, pin, or withdraw anything on Patrick's live blyg while testing. Use `npm run dev` locally, as described in that repo's README.

## Definition of done

- A Windows installer that Patrick can download from a GitHub release, verify against `SHA256SUMS`, and run.
- On Windows the app connects to https://pioneeringspirit.xyz, shows his subscriptions in the reading list, and can capture, draft, generate, publish, quote, stub, and follow.
- The macOS build and its tests still pass unchanged.
- The server extensions are live on Patrick's blyg (after he approves the deploy), with tests.
- A short note in the app's README covering Windows install, SmartScreen, and any features that differ from macOS.

## Working rules

- Keep changes small and reviewable, one concern per commit.
- Run `cargo test --workspace` and `cargo clippy` on both platforms in CI before every push.
- Report anything you cannot test yourself, such as installer behavior on a real Windows machine, instead of claiming it works.
- Write any notes or messages for Patrick in full sentences and full paragraphs.
