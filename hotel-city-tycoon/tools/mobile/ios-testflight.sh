#!/bin/bash
set -euo pipefail
umask 077

HOTEL_APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HOTEL_APP_ROOT"
python3 tools/mobile/ios_signing.py preflight
: "${RUNNER_TEMP:?Run this signing command on a GitHub-hosted macOS runner}"
HOTEL_SIGNING_ROOT="$(mktemp -d "$RUNNER_TEMP/hotel-city-signing.XXXXXX")"
HOTEL_SIGNING_DIR="$HOTEL_SIGNING_ROOT/material"
HOTEL_KEYCHAIN="$HOTEL_SIGNING_DIR/signing.keychain-db"
HOTEL_INSTALLED_PROFILE=""

cleanup() {
  security delete-keychain "$HOTEL_KEYCHAIN" >/dev/null 2>&1 || true
  if [[ -n "$HOTEL_INSTALLED_PROFILE" ]]; then
    rm -f "$HOTEL_INSTALLED_PROFILE"
  fi
  rm -rf "$HOTEL_SIGNING_ROOT"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
python3 tools/mobile/ios_signing.py prepare --directory "$HOTEL_SIGNING_DIR"
HOTEL_KEYCHAIN_PASSWORD="$(openssl rand -hex 32)"
echo "::add-mask::$HOTEL_KEYCHAIN_PASSWORD"
security create-keychain -p "$HOTEL_KEYCHAIN_PASSWORD" "$HOTEL_KEYCHAIN"
security set-keychain-settings -lut 21600 "$HOTEL_KEYCHAIN"
security unlock-keychain -p "$HOTEL_KEYCHAIN_PASSWORD" "$HOTEL_KEYCHAIN"
security import "$HOTEL_SIGNING_DIR/certificate.p12" \
  -P "$IOS_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security \
  -f pkcs12 -k "$HOTEL_KEYCHAIN" >/dev/null
security set-key-partition-list -S apple-tool:,apple: \
  -k "$HOTEL_KEYCHAIN_PASSWORD" "$HOTEL_KEYCHAIN" >/dev/null
security list-keychains -d user -s "$HOTEL_KEYCHAIN" "$HOME/Library/Keychains/login.keychain-db"
HOTEL_IDENTITY="$(security find-identity -v -p codesigning "$HOTEL_KEYCHAIN" | \
  sed -nE 's/^[[:space:]]*[0-9]+\) ([A-F0-9]{40}) "(Apple Distribution|iPhone Distribution):.*$/\1/p')"
security cms -D -i "$HOTEL_SIGNING_DIR/profile.mobileprovision" > "$HOTEL_SIGNING_DIR/profile.plist"
python3 tools/mobile/ios_signing.py configure --directory "$HOTEL_SIGNING_DIR" --identity "$HOTEL_IDENTITY"
unset IOS_CERTIFICATE_BASE64 IOS_CERTIFICATE_PASSWORD IOS_PROFILE_BASE64 ASC_PRIVATE_KEY
HOTEL_PROFILE_UUID="$(cat "$HOTEL_SIGNING_DIR/profile-uuid")"
HOTEL_PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
mkdir -p "$HOTEL_PROFILE_DIR"
HOTEL_INSTALLED_PROFILE="$HOTEL_PROFILE_DIR/$HOTEL_PROFILE_UUID.mobileprovision"
cp "$HOTEL_SIGNING_DIR/profile.mobileprovision" "$HOTEL_INSTALLED_PROFILE"

xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath build/native/ios-signed-derived \
  -archivePath build/native/HotelCity-signed.xcarchive archive
python3 tools/mobile/inspect-build.py ios-device \
  build/native/HotelCity-signed.xcarchive/Products/Applications/App.app \
  --app-id "$IOS_BUNDLE_ID" --build-number "$IOS_BUILD_NUMBER"
xcodebuild -exportArchive -archivePath build/native/HotelCity-signed.xcarchive \
  -exportOptionsPlist "$HOTEL_SIGNING_DIR/ExportOptions.plist" -exportPath build/native/ios-export

# Validate the exported IPA, not just the pre-export archive.
HOTEL_IPAS=(build/native/ios-export/*.ipa)
if [[ "${#HOTEL_IPAS[@]}" != "1" || ! -f "${HOTEL_IPAS[0]}" ]]; then
  echo "Expected exactly one exported IPA" >&2
  exit 1
fi
cp "${HOTEL_IPAS[0]}" build/native/hotel-city-iphone.ipa
ditto -x -k build/native/hotel-city-iphone.ipa "$HOTEL_SIGNING_DIR/exported"
codesign --verify --deep --strict "$HOTEL_SIGNING_DIR/exported/Payload/App.app"
python3 tools/mobile/inspect-build.py ios-device \
  "$HOTEL_SIGNING_DIR/exported/Payload/App.app" \
  --app-id "$IOS_BUNDLE_ID" --build-number "$IOS_BUILD_NUMBER"
shasum -a 256 build/native/hotel-city-iphone.ipa > build/native/iphone.sha256

if [[ "${IOS_UPLOAD:-false}" == "true" ]]; then
  # altool discovers ./private_keys; key contents never enter command arguments.
  cd "$HOTEL_SIGNING_DIR"
  xcrun altool --validate-app -f "$HOTEL_APP_ROOT/build/native/hotel-city-iphone.ipa" \
    -t ios --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
  xcrun altool --upload-app -f "$HOTEL_APP_ROOT/build/native/hotel-city-iphone.ipa" \
    -t ios --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
  echo "Upload command succeeded. Apple processing and TestFlight availability still need checking."
fi
