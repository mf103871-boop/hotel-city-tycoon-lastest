"""Validate local Apple signing inputs and configure the App target in CI only."""

import argparse
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import uuid


def required(env, name):
    value = env.get(name, "").strip()
    if not value:
        raise ValueError("Missing setting: " + name)
    return value


def validate_inputs(env):
    team = required(env, "IOS_TEAM_ID")
    bundle = required(env, "IOS_BUNDLE_ID")
    build = required(env, "IOS_BUILD_NUMBER")
    if not re.fullmatch(r"[A-Z0-9]{10}", team):
        raise ValueError("IOS_TEAM_ID must be the 10-character Apple Team ID")
    if not re.fullmatch(r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+", bundle):
        raise ValueError("IOS_BUNDLE_ID must be an explicit bundle identifier")
    if not re.fullmatch(r"[1-9][0-9]{0,3}(?:\.(?:0|[1-9][0-9]?)){0,2}", build):
        raise ValueError("IOS_BUILD_NUMBER must use Apple's numeric build format")
    for name in ("IOS_CERTIFICATE_BASE64", "IOS_CERTIFICATE_PASSWORD", "IOS_PROFILE_BASE64"):
        required(env, name)
    upload = env.get("IOS_UPLOAD", "false")
    if upload not in ("true", "false"):
        raise ValueError("IOS_UPLOAD must be true or false")
    if upload == "true":
        if not re.fullmatch(r"[A-Z0-9]{10}", required(env, "ASC_KEY_ID")):
            raise ValueError("Invalid ASC_KEY_ID")
        uuid.UUID(required(env, "ASC_ISSUER_ID"))
        required(env, "ASC_PRIVATE_KEY")
    return team, bundle, build


def validate_profile(profile, team, bundle, identity, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    if profile.get("TeamIdentifier") != [team]:
        raise ValueError("Provisioning profile belongs to a different Apple team")
    expiry = profile.get("ExpirationDate")
    if not isinstance(expiry, dt.datetime):
        raise ValueError("Provisioning profile has no expiration date")
    if expiry.replace(tzinfo=dt.timezone.utc) <= now:
        raise ValueError("Provisioning profile has expired")
    entitlements = profile.get("Entitlements", {})
    if entitlements.get("com.apple.developer.team-identifier") != team:
        raise ValueError("Profile team entitlement does not match")
    prefixes = profile.get("ApplicationIdentifierPrefix", [])
    if not prefixes or entitlements.get("application-identifier") not in [p + "." + bundle for p in prefixes]:
        raise ValueError("Profile does not match the exact bundle identifier")
    if ("ProvisionedDevices" in profile or profile.get("ProvisionsAllDevices")
            or entitlements.get("get-task-allow") is not False
            or entitlements.get("beta-reports-active") is not True):
        raise ValueError("An App Store distribution profile is required")
    certificates = profile.get("DeveloperCertificates", [])
    if identity.upper() not in [hashlib.sha1(cert).hexdigest().upper() for cert in certificates]:
        raise ValueError("Profile does not include the imported signing certificate")
    profile_id = str(uuid.UUID(profile.get("UUID", ""))).upper()
    return profile_id


def configure_project(text, team, profile_id, identity, build):
    # Only App/Release receives a profile. Global xcodebuild profile overrides
    # would incorrectly apply it to Swift package/framework targets as well.
    pattern = r'(504EC3181FED79650016851F /\* Release \*/ = \{\s*isa = XCBuildConfiguration;\s*buildSettings = \{)(.*?)(\n\t\t\t\};)'
    settings = {
        "CODE_SIGN_STYLE": "Manual",
        "DEVELOPMENT_TEAM": team,
        "CODE_SIGN_IDENTITY": identity,
        "PROVISIONING_PROFILE_SPECIFIER": profile_id,
        "CURRENT_PROJECT_VERSION": build,
    }

    def replace(match):
        body = match.group(2)
        for name, value in settings.items():
            line = '\n\t\t\t\t' + name + ' = "' + value + '";'
            rule = r'\n[ \t]*' + name + r' = [^;]*;'
            if re.search(rule, body):
                body = re.sub(rule, lambda _: line, body)
            else:
                body += line
        return match.group(1) + body + match.group(3)

    result, count = re.subn(pattern, replace, text, flags=re.S)
    if count != 1:
        raise ValueError("App Release settings changed; review the signing adapter")
    return result


def prepare(directory, env):
    validate_inputs(env)
    directory.mkdir(mode=0o700, parents=True, exist_ok=False)
    for name, filename in (("IOS_CERTIFICATE_BASE64", "certificate.p12"),
                           ("IOS_PROFILE_BASE64", "profile.mobileprovision")):
        data = base64.b64decode("".join(env[name].split()), validate=True)
        if not data:
            raise ValueError("Empty signing file: " + name)
        path = directory / filename
        path.write_bytes(data)
        path.chmod(0o600)
    if env.get("IOS_UPLOAD") == "true":
        keys = directory / "private_keys"
        keys.mkdir(mode=0o700)
        path = keys / ("AuthKey_" + env["ASC_KEY_ID"] + ".p8")
        path.write_text(env["ASC_PRIVATE_KEY"])
        path.chmod(0o600)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("preflight", "prepare", "configure"))
    parser.add_argument("--directory", type=Path)
    parser.add_argument("--identity")
    args = parser.parse_args()
    team, bundle, build = validate_inputs(os.environ)
    if args.action == "preflight":
        print("Required signing settings are present; Apple access is not tested")
        return
    if args.directory is None:
        parser.error("--directory is required")
    if args.action == "prepare":
        prepare(args.directory, os.environ)
        return
    if not re.fullmatch(r"[A-F0-9]{40}", args.identity or ""):
        raise ValueError("No valid distribution signing identity was imported")
    root = Path(__file__).resolve().parents[2]
    config = json.loads((root / "ios/App/App/capacitor.config.json").read_text())
    if config.get("appId") != bundle:
        raise ValueError("Confirm and commit the permanent app ID before signing")
    profile = plistlib.loads((args.directory / "profile.plist").read_bytes())
    profile_id = validate_profile(profile, team, bundle, args.identity)
    project = root / "ios/App/App.xcodeproj/project.pbxproj"
    text = project.read_text()
    if set(re.findall(r'PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)"?;', text)) != {bundle}:
        raise ValueError("Xcode and Capacitor bundle identifiers do not match")
    project.write_text(configure_project(text, team, profile_id, args.identity, build))
    options = {
        "method": "app-store-connect", "destination": "export",
        "signingStyle": "manual", "teamID": team,
        "signingCertificate": args.identity,
        "provisioningProfiles": {bundle: profile_id},
        "manageAppVersionAndBuildNumber": False,
        "stripSwiftSymbols": True, "uploadSymbols": True,
    }
    (args.directory / "ExportOptions.plist").write_bytes(plistlib.dumps(options))
    (args.directory / "profile-uuid").write_text(profile_id)
    print("Profile, team, bundle ID and signing certificate match")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError) as error:
        raise SystemExit(str(error)) from None
