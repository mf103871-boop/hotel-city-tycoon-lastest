"""Create an encrypted signing key/CSR, then package Apple's certificate without a Mac."""

import argparse
import base64
import os
from pathlib import Path
import subprocess


def run(*args):
    return subprocess.check_output(["openssl", *map(str, args)], stderr=subprocess.DEVNULL)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("request", "package"))
    parser.add_argument("--directory", required=True, type=Path)
    parser.add_argument("--certificate", type=Path, help="Apple's downloaded DER .cer file")
    args = parser.parse_args()
    if len(os.environ.get("IOS_CERTIFICATE_PASSWORD", "")) < 16:
        raise SystemExit("Set IOS_CERTIFICATE_PASSWORD to a private password of at least 16 characters")
    os.umask(0o077)
    directory = args.directory.resolve()
    key = directory / "distribution.key"
    if args.action == "request":
        directory.mkdir(mode=0o700, parents=True, exist_ok=False)
        run("genrsa", "-aes256", "-passout", "env:IOS_CERTIFICATE_PASSWORD", "-out", key, "2048")
        run("req", "-new", "-sha256", "-key", key, "-passin", "env:IOS_CERTIFICATE_PASSWORD",
            "-subj", "/CN=Hotel City Distribution", "-out", directory / "distribution.csr")
        print("Public CSR created: " + str(directory / "distribution.csr"))
        print("The encrypted private key stays in the protected directory; do not commit it.")
        return
    if args.certificate is None:
        parser.error("--certificate is required for package")
    if (directory / "distribution.p12").exists():
        raise SystemExit("Output already exists; will not overwrite signing material")
    certificate = directory / "distribution.pem"
    run("x509", "-inform", "DER", "-in", args.certificate, "-out", certificate)
    cert_key = run("x509", "-in", certificate, "-pubkey", "-noout")
    private_public = run("pkey", "-in", key, "-passin", "env:IOS_CERTIFICATE_PASSWORD", "-pubout")
    if cert_key != private_public:
        raise SystemExit("Apple certificate does not match this CSR's private key")
    run("x509", "-in", certificate, "-checkend", "0", "-noout")
    p12 = directory / "distribution.p12"
    run("pkcs12", "-export", "-inkey", key, "-in", certificate,
        "-passin", "env:IOS_CERTIFICATE_PASSWORD", "-passout", "env:IOS_CERTIFICATE_PASSWORD",
        "-name", "Hotel City Distribution", "-out", p12)
    (directory / "certificate-base64.txt").write_text(base64.b64encode(p12.read_bytes()).decode())
    print("Encrypted P12 and its GitHub secret value saved in the protected directory.")
    print("The certificate has not been authenticated against Apple by this packaging tool.")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError:
        raise SystemExit("OpenSSL failed; check the password and certificate inputs. No key contents logged.") from None
