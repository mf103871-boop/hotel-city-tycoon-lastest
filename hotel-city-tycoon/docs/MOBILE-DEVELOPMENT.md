# Mobile development

Owner decision, 2026-09-07: ship iPhone and Android apps from the beginning,
support portrait and landscape, and implement in this repository. Capacitor
8.5.1 wraps the existing React/Pixi game with bundled local assets.

## Build and sync

From `hotel-city-tycoon/`:

```bash
npm ci
npm run verify
npm run mobile:sync
npm run mobile:android
# On macOS:
npm run mobile:ios
```

`mobile:sync` builds production assets with `BASE_PATH=/`, `VITE_NATIVE=1`
and test handles disabled, then copies them to both native projects. Run it
after every web/art change, before using Android Studio or Xcode. Do not copy
a Pages build manually: its subpath and service-worker behavior differ.

The ordinary `npm run build` still produces the web version. There is no
external `server.url` in native configuration. No network service is required
to load the bundled game. Cloud saves and real social features are separate
work; the app still uses the existing local IndexedDB save format (schema 18).
The native origin differs from Pages, so browser saves do not automatically
appear in the app. Export/import support and update durability need native QA.

## Native toolchains and identifiers

Capacitor requires Node 22 or newer. The repository's existing Node 22 setup
remains supported; this work environment ran Node 24.19.0. iOS builds require
macOS/Xcode 26+, with Swift Package Manager used by this project. Android uses
SDK 36 and the Gradle/JDK toolchain supplied by Android Studio. See the
[official environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup).

Generated platform minimums are iOS 15 and Android API 24; these are technical
defaults, **not** a tested game support matrix. See `HC-P0-S10-REPORT.md` for
what was actually run. Native app icons and splash screens currently remain
Capacitor development placeholders and must be replaced before distribution.

Development app ID: `com.hotelcitytycoon.app`; version `0.1.0`, native build 1.
Confirm the permanent ID and owner store accounts before the first external
build. Change it consistently in capacitor.config.ts, Android namespace,
applicationId and MainActivity package, and iOS PRODUCT_BUNDLE_IDENTIFIER.
Signing files and credentials stay outside Git.

## Orientation and safe area

iPhone permits portrait and both landscape directions in Info.plist; iPad
also permits upside-down portrait. Android uses `unspecified`, allowing the
system/user rotation preference to apply. No runtime orientation lock is
installed. See [Capacitor orientation configuration](https://capacitorjs.com/docs/guides/screen-orientation).

App's shared safe rectangle protects the canvas, HUD and dialogs on all four
edges. CSS accepts both standard `env(safe-area-inset-*)` values and the
`--safe-area-inset-*` variables injected by Capacitor's bundled SystemBars
plugin on Android. See [SystemBars inset handling](https://capacitorjs.com/docs/apis/system-bars).
ResizeObserver follows the playable rectangle as insets change during rotation.

## Required before a device beta

- Build an Android debug APK and an iOS simulator/device build with the actual toolchains.
- Rotate during play, placement and open dialogs; test Arabic and English.
- Test notch and gesture insets on both sides, short screens, scroll-to-last-row,
  pinch/drag/tap and Android Back behavior.
- Test background/resume, interrupted saves, offline launch after installation,
  app updates, export/import, sound interruption and mute.
- Measure frame rate, heat, battery and memory with a busy hotel on actual devices.

This foundation does not establish store readiness or visual approval of the
new art. The next art contract is `HC-VIS-001-SPEC.md`.

## Native builds in GitHub Actions

The `native-build` workflow compiles both platforms on pull requests, pushes
to main, and manual runs. Android uses JDK 21 and SDK 36; iOS explicitly selects
Xcode 26.3 on `macos-15` because that image's default Xcode is older than the
[Capacitor 8 requirement](https://capacitorjs.com/docs/getting-started/environment-setup).
The selected version is listed in the
[runner image](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md).

For a successful run, open **Actions → native-build → the run → Artifacts**:

- `hotel-city-android-debug`: a development APK and its SHA-256/asset report.
  Extract the downloaded archive and install the APK on an Android test device,
  or use `adb install -r hotel-city-android-debug.apk`. Each fresh CI runner
  generates its own development signing key; a later APK may need uninstalling
  the old build first. Export your save before uninstalling: uninstalling erases
  that app's local progress. This signing setup is only for disposable testing.
- `hotel-city-ios-simulator`: a ZIP containing `App.app`, plus the bundle report
  and archive checksum. On a Mac, extract it and use
  `xcrun simctl install booted App.app`, then
  `xcrun simctl launch booted com.hotelcitytycoon.app`.
  This unsigned simulator app cannot be installed on an iPhone. A device build
  requires Apple signing; TestFlight distribution is a later step.
- `native-android-diagnostics` and `native-ios-diagnostics`: build logs, plus
  Android lint reports. Diagnostics are retained for 14 days; builds for 30 days.

`tools/mobile/inspect-build.py` checks every production web file against its
copy in the compiled APK/app bundle, verifies the local Capacitor configuration,
and records the actual checkout revision. It does not claim runtime, visual,
orientation, save durability, or performance approval on a device.

## Preparing for Xcode Cloud / TestFlight

**Owner update, 2026-09-07:** no local Mac is available, so the primary signing
route is now the manual `ios-testflight` GitHub Actions workflow. It runs on
GitHub-hosted macOS from main only, validates the supplied App Store profile
against the team/bundle/certificate/expiry, signs and inspects an exported IPA,
and optionally validates/uploads it to Apple. Upload is off by default.
The [Arabic setup guide](IOS-TESTFLIGHT-SETUP_AR.md) lists the four signing/upload
secrets and public identifiers. `signing_request.py` prepares an encrypted key,
public CSR and matching P12 on Linux too; it never creates an Apple certificate
or publishes credentials by itself. No Apple signing or upload has been tested
without the owner's account materials. The Xcode Cloud path below stays optional.

See [the Apple setup guide](IOS-TESTFLIGHT-SETUP_AR.md). Apple requires initial
Xcode Cloud onboarding in Xcode on a Mac; later workflows can be managed in
App Store Connect. The shared `App` scheme supports Release archiving.

Xcode Cloud discovers `ios/App/ci_scripts/ci_post_clone.sh` beside the project.
It selects Node 22 (installing it with the provided Homebrew when necessary),
installs the locked npm dependencies including build tools, builds the native
web assets and runs `cap sync ios`. This restores generated files excluded from
Git before Xcode resolves packages/builds. The script is executable and resolves
the app directory independently of the caller's working directory.

The GitHub iOS job runs that same script from the runner's temporary directory,
then compiles the simulator and archives Release for `generic/platform=iOS`
with `CODE_SIGNING_ALLOWED=NO`. The device archive is a compile check; it is
neither an installable IPA nor a TestFlight upload. Its asset verification report
is included in `native-ios-diagnostics`. `inspect-build.py ios-device` requires
an `iPhoneOS` bundle, while `ios` continues to require `iPhoneSimulator`.

Apple team selection, the permanent bundle ID, the app record, cloud onboarding,
signing and TestFlight distribution remain account-specific steps. No Apple
account connection or distribution configuration is inferred from CI success.
