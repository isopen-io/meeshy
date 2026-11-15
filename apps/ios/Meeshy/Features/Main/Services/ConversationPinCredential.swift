import Foundation
import CommonCrypto
import CryptoKit

// MARK: - Le code dérivé (#11388)

/// Ce que le coffre garde d'un PIN : jamais le PIN, jamais son SHA-256 nu.
///
/// PBKDF2-HMAC-SHA256 sous un sel aléatoire de 16 octets PROPRE À CHAQUE CODE
/// (plus fort qu'un sel par appareil : deux conversations au même PIN ne
/// partagent pas d'empreinte), encodé `pbkdf2-sha256$<itérations>$<sel>$<dérivé>`.
///
/// La dérivation lente renchérit une attaque HORS LIGNE sans la rendre
/// impossible : un code à 4 chiffres n'a que 10 000 valeurs. La barrière réelle
/// est double — l'élément de trousseau ne quitte pas l'appareil
/// (`ThisDeviceOnly`) et chaque essai en ligne passe par
/// `ConversationPinThrottle`.
///
/// `legacySHA256` lit les codes posés par les versions antérieures : vérifiables
/// tels quels, re-dérivés au premier succès (le clair n'est connu qu'à la
/// saisie).
nonisolated struct ConversationPinCredential: Equatable, Sendable {
    nonisolated enum Scheme: Equatable, Sendable {
        case legacySHA256
        case pbkdf2SHA256(iterations: Int, salt: Data)
    }

    static let defaultIterations = 100_000
    static let maximumIterations = 10_000_000
    static let saltLength = 16
    static let digestLength = 32
    private static let schemeTag = "pbkdf2-sha256"

    let scheme: Scheme
    let digest: Data

    static func derive(
        pin: String,
        iterations: Int = ConversationPinCredential.defaultIterations,
        salt: Data = ConversationPinCredential.randomSalt()
    ) -> ConversationPinCredential? {
        guard let digest = pbkdf2(pin: pin, salt: salt, iterations: iterations) else { return nil }
        return ConversationPinCredential(scheme: .pbkdf2SHA256(iterations: iterations, salt: salt), digest: digest)
    }

    static func decode(_ stored: String) -> ConversationPinCredential? {
        decodeDerived(stored) ?? decodeLegacy(stored)
    }

    var encoded: String {
        switch scheme {
        case .legacySHA256:
            return Self.hex(digest)
        case .pbkdf2SHA256(let iterations, let salt):
            return [Self.schemeTag, String(iterations), salt.base64EncodedString(), digest.base64EncodedString()]
                .joined(separator: "$")
        }
    }

    func matches(_ pin: String) -> Bool {
        guard let candidate = candidateDigest(for: pin) else { return false }
        return Self.constantTimeEquals(candidate, digest)
    }

    func needsUpgrade(toIterations target: Int) -> Bool {
        guard case .pbkdf2SHA256(let iterations, _) = scheme else { return true }
        return iterations < target
    }

    static func pbkdf2(pin: String, salt: Data, iterations: Int) -> Data? {
        guard iterations > 0, iterations <= maximumIterations, !salt.isEmpty else { return nil }
        let saltBytes = [UInt8](salt)
        let pinLength = pin.utf8.count
        let keyLength = digestLength
        var derived = [UInt8](repeating: 0, count: keyLength)
        let status = pin.withCString { pinPointer in
            CCKeyDerivationPBKDF(
                CCPBKDFAlgorithm(kCCPBKDF2),
                pinPointer,
                pinLength,
                saltBytes,
                saltBytes.count,
                CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
                UInt32(iterations),
                &derived,
                keyLength
            )
        }
        guard status == Int32(kCCSuccess) else { return nil }
        return Data(derived)
    }

    static func randomSalt() -> Data {
        SymmetricKey(size: .bits128).withUnsafeBytes { Data($0) }
    }

    static func hex(_ data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }

    static func constantTimeEquals(_ lhs: Data, _ rhs: Data) -> Bool {
        guard lhs.count == rhs.count else { return false }
        return zip(lhs, rhs).reduce(UInt8(0)) { $0 | ($1.0 ^ $1.1) } == 0
    }

    private func candidateDigest(for pin: String) -> Data? {
        switch scheme {
        case .legacySHA256:
            return Data(SHA256.hash(data: Data(pin.utf8)))
        case .pbkdf2SHA256(let iterations, let salt):
            return Self.pbkdf2(pin: pin, salt: salt, iterations: iterations)
        }
    }

    private static func decodeDerived(_ stored: String) -> ConversationPinCredential? {
        let parts = stored.split(separator: "$", omittingEmptySubsequences: false).map(String.init)
        guard parts.count == 4, parts[0] == schemeTag,
              let iterations = Int(parts[1]), iterations > 0, iterations <= maximumIterations,
              let salt = Data(base64Encoded: parts[2]), !salt.isEmpty,
              let digest = Data(base64Encoded: parts[3]), digest.count == digestLength else { return nil }
        return ConversationPinCredential(scheme: .pbkdf2SHA256(iterations: iterations, salt: salt), digest: digest)
    }

    private static func decodeLegacy(_ stored: String) -> ConversationPinCredential? {
        let characters = Array(stored.utf8)
        let hexDigits = Set("0123456789abcdefABCDEF".utf8)
        guard characters.count == digestLength * 2, characters.allSatisfy(hexDigits.contains) else { return nil }
        let bytes = stride(from: 0, to: characters.count, by: 2).compactMap { index in
            UInt8(String(decoding: characters[index..<index + 2], as: UTF8.self), radix: 16)
        }
        guard bytes.count == digestLength else { return nil }
        return ConversationPinCredential(scheme: .legacySHA256, digest: Data(bytes))
    }
}
