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

## Taking the fps reading on a phone

This is the only measurement that can move a P2 row to `VERIFIED`
(DEC-005/DEC-009); sandbox numbers from the CI lane are never a substitute.
Recorded 20-09-2026 with HC-P2-S2.

1. Open the Pages URL on the phone with the stress handle:
   `https://mf103871-boop.github.io/hotel-city-tycoon-lastest/?stress=60&warm=900&debug=1`
   (60 rooms warmed for 900 simulated seconds; the stress hotel reaches
   55 people). Add `&epoch=<milliseconds since 1970>` to force the simulation
   clock to a chosen hour, for example a night reading with the light pools
   and the dark sky up; without it the hour is the phone's local time.
2. Let the hotel run for at least a minute, then read `p5` from the debug
   badge (bottom of the screen). The badge also names the backend
   (`webgpu`, `webgl` or `canvas`): a `canvas` reading on a phone is a
   software fallback and must be reported as such.
3. For the full report run `window.hct.perf()` in the phone's console:
   Android via `chrome://inspect` on a desktop Chrome with USB debugging,
   iOS via Safari > Develop > <device> (Web Inspector enabled in Settings >
   Safari > Advanced). Copy the returned object as is.
4. Paste the object, the device model, the OS version, the build id from
   the badge and the URL used into the step report's evidence section.

`p5 >= 55` at 60 rooms / 55 people is the bar. Inside the Capacitor app the
console is not reachable until HC-P2-S8 wires the native debugging switch
(BL-040); until then take the reading in the phone's browser.

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
