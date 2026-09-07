"""Check the compiled native package against the production web build."""

import argparse
import hashlib
import json
import plistlib
import subprocess
import zipfile
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=("android", "ios", "ios-device"))
    parser.add_argument("package", type=Path)
    parser.add_argument("--app-id", default="com.hotelcitytycoon.app")
    parser.add_argument("--build-number")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    dist = root / "dist"
    files = sorted(path for path in dist.rglob("*") if path.is_file())
    if not files or not (dist / "index.html").is_file():
        raise SystemExit("Build the production web assets before checking a native package")

    package = args.package.resolve()
    report = {"platform": args.platform, "package": package.name}
    archive = None
    try:
        if args.platform == "android":
            archive = zipfile.ZipFile(package)
            if "classes.dex" not in archive.namelist():
                raise ValueError("The APK has no compiled Android code")

            def read_asset(name):
                return archive.read("assets/public/" + name)

            config = json.loads(archive.read("assets/capacitor.config.json"))
            report["sha256"] = hashlib.sha256(package.read_bytes()).hexdigest()
        else:
            info = plistlib.loads((package / "Info.plist").read_bytes())
            expected_platform = "iPhoneOS" if args.platform == "ios-device" else "iPhoneSimulator"
            if info["CFBundleSupportedPlatforms"] != [expected_platform]:
                raise ValueError("Expected an " + expected_platform + " build")
            if info["CFBundleIdentifier"] != args.app_id:
                raise ValueError("Unexpected iOS application identifier")
            if args.build_number is not None and info["CFBundleVersion"] != args.build_number:
                raise ValueError("Unexpected iOS build number")
            executable = package / info["CFBundleExecutable"]
            if not executable.is_file() or executable.stat().st_size == 0:
                raise ValueError("The iOS bundle has no compiled executable")

            def read_asset(name):
                return (package / "public" / name).read_bytes()

            config = json.loads((package / "capacitor.config.json").read_text())
            report["executable_sha256"] = hashlib.sha256(executable.read_bytes()).hexdigest()
            report["minimum_os"] = info["MinimumOSVersion"]
            report["apple_platform"] = expected_platform
            report["app_version"] = info["CFBundleShortVersionString"]
            report["build_number"] = info["CFBundleVersion"]

        if config.get("appId") != args.app_id:
            raise ValueError("Unexpected Capacitor application identifier")
        if config.get("server", {}).get("url"):
            raise ValueError("The app points to a development server")
        for path in files:
            name = path.relative_to(dist).as_posix()
            if read_asset(name) != path.read_bytes():
                raise ValueError("Packaged asset differs from production build: " + name)

        report.update({
            "app_id": config["appId"],
            "bundled_files_checked": len(files),
            "tested_revision": subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=root, text=True
            ).strip(),
            "result": "packaged assets match production build",
            "device_runtime_tested": False,
        })
        destination = root / "build" / "native" / (args.platform + "-build.json")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
    finally:
        if archive is not None:
            archive.close()


if __name__ == "__main__":
    main()
