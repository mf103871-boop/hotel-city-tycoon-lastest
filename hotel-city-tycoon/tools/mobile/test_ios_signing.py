"""Offline signing guards; fixtures are synthetic and never authorize an Apple upload."""

import base64
import datetime as dt
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from ios_signing import configure_project, prepare, validate_inputs, validate_profile


TEAM = "ABCDE12345"
BUNDLE = "com.hotelcitytycoon.app"
CERT = b"synthetic profile certificate; not an Apple certificate"
IDENTITY = hashlib.sha1(CERT).hexdigest().upper()
PROFILE_ID = "12345678-1234-1234-1234-123456789ABC"
NOW = dt.datetime(2026, 9, 7, tzinfo=dt.timezone.utc)
ROOT = Path(__file__).resolve().parents[2]


def profile():
    return {
        "UUID": PROFILE_ID,
        "TeamIdentifier": [TEAM],
        "ApplicationIdentifierPrefix": [TEAM],
        "ExpirationDate": dt.datetime(2027, 9, 7),
        "DeveloperCertificates": [CERT],
        "Entitlements": {
            "com.apple.developer.team-identifier": TEAM,
            "application-identifier": TEAM + "." + BUNDLE,
            "get-task-allow": False,
            "beta-reports-active": True,
        },
    }


def inputs():
    return {
        "IOS_TEAM_ID": TEAM, "IOS_BUNDLE_ID": BUNDLE, "IOS_BUILD_NUMBER": "1.2.3",
        "IOS_CERTIFICATE_BASE64": base64.b64encode(b"test-p12").decode(),
        "IOS_CERTIFICATE_PASSWORD": "offline-fixture-password",
        "IOS_PROFILE_BASE64": base64.b64encode(b"test-profile").decode(),
    }


class SigningGuards(unittest.TestCase):
    def validate(self, value):
        return validate_profile(value, TEAM, BUNDLE, IDENTITY, NOW)

    def test_matching_app_store_profile(self):
        self.assertEqual(self.validate(profile()), PROFILE_ID)

    def test_legacy_app_prefix_is_separate_from_team(self):
        value = profile()
        value["ApplicationIdentifierPrefix"] = ["OLDPRE1234"]
        value["Entitlements"]["application-identifier"] = "OLDPRE1234." + BUNDLE
        self.assertEqual(self.validate(value), PROFILE_ID)

    def test_expired_or_missing_expiry_is_rejected(self):
        for expiry in (None, dt.datetime(2020, 1, 1), NOW.replace(tzinfo=None)):
            with self.subTest(expiry=expiry):
                value = profile()
                value["ExpirationDate"] = expiry
                with self.assertRaises(ValueError):
                    self.validate(value)

    def test_foreign_team_or_team_entitlement_is_rejected(self):
        for key in ("TeamIdentifier", "entitlement"):
            value = profile()
            if key == "TeamIdentifier":
                value[key] = ["OTHER12345"]
            else:
                value["Entitlements"]["com.apple.developer.team-identifier"] = "OTHER12345"
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.validate(value)

    def test_wrong_or_wildcard_bundle_is_rejected(self):
        for app_id in (TEAM + ".*", TEAM + ".com.other.app", "wrongprefix." + BUNDLE):
            value = profile()
            value["Entitlements"]["application-identifier"] = app_id
            with self.subTest(app_id=app_id), self.assertRaises(ValueError):
                self.validate(value)

    def test_development_adhoc_and_enterprise_are_rejected(self):
        for change in ({"ProvisionedDevices": []}, {"ProvisionedDevices": ["device"]},
                       {"ProvisionsAllDevices": True}, {"get-task-allow": True},
                       {"get-task-allow": None}, {"beta-reports-active": False}):
            value = profile()
            for key, setting in change.items():
                target = value["Entitlements"] if key in ("get-task-allow", "beta-reports-active") else value
                target[key] = setting
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.validate(value)

    def test_foreign_or_missing_certificate_is_rejected(self):
        for certificates in ([], [b"different certificate"]):
            value = profile()
            value["DeveloperCertificates"] = certificates
            with self.subTest(certificates=certificates), self.assertRaises(ValueError):
                self.validate(value)

    def test_profile_id_cannot_escape_install_directory(self):
        value = profile()
        value["UUID"] = "../../unrelated-profile"
        with self.assertRaises(ValueError):
            self.validate(value)

    def test_build_without_upload_does_not_require_api_key(self):
        self.assertEqual(validate_inputs(inputs()), (TEAM, BUNDLE, "1.2.3"))

    def test_upload_requires_complete_team_api_identity(self):
        env = inputs() | {"IOS_UPLOAD": "true"}
        with self.assertRaises(ValueError):
            validate_inputs(env)
        env.update(ASC_KEY_ID="KEYID12345", ASC_ISSUER_ID=PROFILE_ID, ASC_PRIVATE_KEY="synthetic-key")
        self.assertEqual(validate_inputs(env)[0], TEAM)

    def test_malformed_settings_fail_before_signing(self):
        for key, bad in (("IOS_TEAM_ID", "ABC\nINJECTED=value"), ("IOS_BUNDLE_ID", "com.*"),
                         ("IOS_BUILD_NUMBER", "$(id)"), ("IOS_BUILD_NUMBER", "10000"),
                         ("IOS_BUILD_NUMBER", "1.100"), ("IOS_UPLOAD", "yes"),
                         ("IOS_CERTIFICATE_PASSWORD", "")):
            env = inputs() | {key: bad}
            with self.subTest(key=key, value=bad), self.assertRaises(ValueError):
                validate_inputs(env)

    def test_material_is_private_and_not_overwritten(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / "material"
            prepare(directory, inputs())
            self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
            self.assertEqual((directory / "certificate.p12").stat().st_mode & 0o777, 0o600)
            self.assertEqual((directory / "certificate.p12").read_bytes(), b"test-p12")
            with self.assertRaises(FileExistsError):
                prepare(directory, inputs())

    def test_malformed_base64_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaises(ValueError):
                prepare(Path(temporary) / "material", inputs() | {"IOS_PROFILE_BASE64": "bad!"})

    def test_only_app_release_signing_is_changed(self):
        original = (ROOT / "ios/App/App.xcodeproj/project.pbxproj").read_text()
        changed = configure_project(original, TEAM, PROFILE_ID, IDENTITY, "2.1")
        marker = "504EC3181FED79650016851F /* Release */ = {"
        self.assertEqual(original.split(marker)[0], changed.split(marker)[0])
        self.assertEqual(original.split("/* End XCBuildConfiguration section */")[1],
                         changed.split("/* End XCBuildConfiguration section */")[1])
        self.assertEqual(changed.count('PROVISIONING_PROFILE_SPECIFIER = "' + PROFILE_ID + '";'), 1)
        self.assertIn('CURRENT_PROJECT_VERSION = "2.1";', changed)
        self.assertEqual(configure_project(changed, TEAM, PROFILE_ID, IDENTITY, "2.1"), changed)
        with self.assertRaises(ValueError):
            configure_project("unknown project", TEAM, PROFILE_ID, IDENTITY, "2.1")


class SigningRequestRoundTrip(unittest.TestCase):
    def test_encrypted_csr_and_p12_round_trip_without_mac(self):
        env = os.environ | {"IOS_CERTIFICATE_PASSWORD": "offline-fixture-password"}
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / "signing"
            command = ["python3", str(ROOT / "tools/mobile/signing_request.py")]
            request = subprocess.check_output(command + ["request", "--directory", str(directory)], env=env, text=True)
            self.assertNotIn(env["IOS_CERTIFICATE_PASSWORD"], request)
            self.assertIn("ENCRYPTED", (directory / "distribution.key").read_text())
            # A disposable self-signed certificate tests packaging, not Apple trust.
            certificate = Path(temporary) / "fixture.cer"
            subprocess.run(["openssl", "x509", "-req", "-in", str(directory / "distribution.csr"),
                            "-signkey", str(directory / "distribution.key"), "-passin", "env:IOS_CERTIFICATE_PASSWORD",
                            "-days", "1", "-outform", "DER", "-out", str(certificate)],
                           env=env, check=True, capture_output=True)
            subprocess.run(command + ["package", "--directory", str(directory), "--certificate", str(certificate)],
                           env=env, check=True, capture_output=True)
            p12 = directory / "distribution.p12"
            self.assertEqual(base64.b64decode((directory / "certificate-base64.txt").read_text()), p12.read_bytes())
            self.assertEqual(p12.stat().st_mode & 0o777, 0o600)
            subprocess.run(["openssl", "pkcs12", "-in", str(p12), "-passin", "env:IOS_CERTIFICATE_PASSWORD", "-noout"],
                           env=env, check=True, capture_output=True)


if __name__ == "__main__":
    unittest.main()
