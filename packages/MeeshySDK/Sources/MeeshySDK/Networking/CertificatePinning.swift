import Foundation
import Security
import CryptoKit
import os

/// SHA-256 SubjectPublicKeyInfo (SPKI) pinning, matching the standard
/// established by RFC 7469 and the convention used by Mozilla / Chromium.
///
/// Why SPKI rather than full-certificate pinning? Servers rotate certificates
/// far more often than they rotate the underlying public key, and pinning
/// the cert itself bricks the app the next time the cert is reissued — even
/// when the operator legitimately renewed it. Pinning the SPKI lets the
/// operator reissue freely while still defending against rogue certs from a
/// compromised CA.
///
/// The pinned hashes are configured via ``MeeshyConfig.certificatePins``.
/// When that set is empty, ``CertificatePinningDelegate`` falls back to
/// system chain validation (the historical behaviour). Operators MUST
/// populate the set with the production SPKI hashes before shipping.
public enum CertificatePinning {

    /// Compute the base64-encoded SHA-256 of the certificate's
    /// SubjectPublicKeyInfo (SPKI). Returns `nil` when the key uses an
    /// algorithm or size we don't have an ASN.1 prefix for — callers should
    /// treat that as a pin miss and reject the chain rather than degrade
    /// silently.
    public static func spkiSHA256Base64(for certificate: SecCertificate) -> String? {
        guard let publicKey = SecCertificateCopyKey(certificate) else { return nil }
        guard let spki = subjectPublicKeyInfo(for: publicKey) else { return nil }
        let digest = SHA256.hash(data: spki)
        return Data(digest).base64EncodedString()
    }

    /// Pure helper exposed for tests: reconstructs the DER-encoded SPKI from
    /// a `SecKey` by prepending the appropriate ASN.1 AlgorithmIdentifier
    /// header to the raw key bytes returned by
    /// `SecKeyCopyExternalRepresentation`.
    public static func subjectPublicKeyInfo(for publicKey: SecKey) -> Data? {
        var error: Unmanaged<CFError>?
        guard let rawKey = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else {
            return nil
        }
        guard let prefix = asn1SPKIHeader(for: publicKey) else { return nil }
        return prefix + rawKey
    }

    private static func asn1SPKIHeader(for publicKey: SecKey) -> Data? {
        guard let attrs = SecKeyCopyAttributes(publicKey) as? [String: Any],
              let keyType = attrs[kSecAttrKeyType as String] as? String,
              let keySize = attrs[kSecAttrKeySizeInBits as String] as? Int
        else { return nil }

        switch (keyType, keySize) {
        case (kSecAttrKeyTypeRSA as String, 2048): return rsa2048Header
        case (kSecAttrKeyTypeRSA as String, 4096): return rsa4096Header
        case (kSecAttrKeyTypeECSECPrimeRandom as String, 256): return ec256Header
        case (kSecAttrKeyTypeECSECPrimeRandom as String, 384): return ec384Header
        default: return nil
        }
    }

    // ASN.1 SubjectPublicKeyInfo prefixes per RFC 5280 + RFC 5480.
    // Verified against published constants used by Mozilla, Google, Apple sample code.
    private static let rsa2048Header = Data([
        0x30, 0x82, 0x01, 0x22, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
        0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00, 0x03, 0x82, 0x01, 0x0f, 0x00
    ])
    private static let rsa4096Header = Data([
        0x30, 0x82, 0x02, 0x22, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
        0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00, 0x03, 0x82, 0x02, 0x0f, 0x00
    ])
    private static let ec256Header = Data([
        0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
        0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03,
        0x42, 0x00
    ])
    private static let ec384Header = Data([
        0x30, 0x76, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
        0x01, 0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22, 0x03, 0x62, 0x00
    ])
}

/// Decision outcome for a pinning check. Surfaced for tests + logging — the
/// production delegate maps these to URLSession dispositions.
public enum CertificatePinDecision: Equatable, Sendable {
    /// No pins configured. The delegate falls back to plain chain validation.
    case unconfigured
    /// At least one certificate in the chain matched a configured pin.
    case matched(hash: String)
    /// Pins are configured but no chain certificate's SPKI matched any of them.
    /// Treated as a MITM attempt; the connection must be cancelled.
    case mismatch
    /// We couldn't extract a SPKI from any cert in the chain (unsupported
    /// algorithm, malformed cert). Treated as a mismatch — fail closed.
    case chainUnreadable
}

extension CertificatePinning {
    /// Stateless pin evaluator used both by the production delegate and the
    /// unit tests. `chain` is the leaf-first array of certificates returned
    /// by `SecTrustCopyCertificateChain`.
    public static func evaluate(
        chain: [SecCertificate],
        against pinSet: Set<String>
    ) -> CertificatePinDecision {
        if pinSet.isEmpty { return .unconfigured }
        if chain.isEmpty { return .chainUnreadable }
        var sawAnyHash = false
        for cert in chain {
            guard let hash = spkiSHA256Base64(for: cert) else { continue }
            sawAnyHash = true
            if pinSet.contains(hash) {
                return .matched(hash: hash)
            }
        }
        return sawAnyHash ? .mismatch : .chainUnreadable
    }
}
