# Certificate pinning — operator runbook

The iOS SDK now supports SHA-256 SubjectPublicKeyInfo (SPKI) pinning, per
RFC 7469. By default the pin set is empty so the app continues to work
with system chain validation only. To enable pinning in production,
compute the pin hashes from the live certificate chain on
`gate.meeshy.me` and add them to ``MeeshyConfig.shared.certificatePins``
during app boot.

## How to compute a pin

The canonical incantation, using OpenSSL on any UNIX machine:

```sh
openssl s_client -servername gate.meeshy.me -connect gate.meeshy.me:443 < /dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary \
  | openssl base64
```

The output is one base64 line — that's the pin to embed.

## Rotation strategy

Pin **at least two values** at all times: the SPKI of the leaf currently
in use, plus the SPKI of the rotation key the operator has staged for
the next renewal. When the renewal happens, the second pin already
matches and the app keeps working; the operator can then push a new
release that drops the old pin and adds the next backup.

Without a backup pin, any cert/key change locks the app out until a new
binary ships through App Review (which can take days).

## Where to set the pin set

In `apps/ios/Meeshy/MeeshyApp.swift` early in `init()`:

```swift
MeeshyConfig.shared.certificatePins = [
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", // current leaf
  "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=", // staged backup
]
```

A future iteration will move this to a bundled JSON resource so a
TestFlight build can be reissued with rotated pins without recompiling
Swift. For now the in-code list keeps the surface tiny and visible at
review time.

## Failure mode

When pins are configured and none of the certificates in the chain
match, the connection is **cancelled** (the URLSession completes with
`NSURLErrorCancelled`). The SDK logs a `fault`-level entry in the
`me.meeshy.sdk` / `tls-pinning` category so the failure is visible in
the device console and any centralised log forwarder.

## Tested invariants

`packages/MeeshySDK/Tests/MeeshySDKTests/Networking/CertificatePinningTests.swift`
covers:

- empty pin set → `unconfigured`
- non-empty pin set + empty chain → `chainUnreadable`
- identical key → identical hash (determinism)
- distinct keys → distinct SPKI bytes
- ASN.1 prefix bytes for EC256 keys

The integration-level `CertificatePinningDelegate` is intentionally not
unit-tested with synthetic `SecTrust` objects because the OS APIs to do
so are unstable; the production path runs through real URLSession
behaviour and is covered by manual / device-level smoke tests.
