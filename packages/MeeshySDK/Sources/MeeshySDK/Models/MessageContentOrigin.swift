import CryptoKit
import Foundation

// MARK: - D'où vient le texte d'un message, sur cet appareil (#11382)

/// **La provenance LOCALE de `MeeshyMessage.content`.**
///
/// Un message chiffré arrive du fil avec son cryptogramme ; le déchiffrement
/// sur l'appareil le remplace par le clair. Rien dans le texte ne dit lequel
/// des deux il porte — deviner à sa forme (base64 d'une enveloppe) se trompe
/// dans les deux sens. La provenance le DIT : `.wire` par défaut, et
/// `.decryptedOnDevice` posée par le seul déchiffrement, liée par empreinte
/// au texte qu'il a produit. Un site qui réécrit `content` sans repasser par
/// le déchiffrement (le REST rend le cryptogramme) rompt l'empreinte : la
/// provenance ne couvre plus le texte, et le message redevient scellé.
///
/// L'empreinte est un SHA-256 du clair, jamais le clair lui-même, et ne quitte
/// pas l'appareil : aucun producteur réseau ne la décode (`APIMessage` ne la
/// porte pas), seul le cache local (chiffré au repos) la relit.
public enum MessageContentOrigin: Sendable, Equatable {
    case wire
    case decryptedOnDevice(digest: String)

    /// La provenance d'un clair que l'appareil vient de déchiffrer.
    public static func decrypted(_ plaintext: String) -> MessageContentOrigin {
        .decryptedOnDevice(digest: digest(of: plaintext))
    }

    /// Cette provenance couvre-t-elle CE texte ? `.wire` ne couvre jamais rien.
    public func vouches(for content: String) -> Bool {
        guard case .decryptedOnDevice(let digest) = self else { return false }
        return digest == Self.digest(of: content)
    }

    private static func digest(of content: String) -> String {
        SHA256.hash(data: Data(content.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - Codage (cache local)

extension MessageContentOrigin: Codable {
    private enum CodingKeys: String, CodingKey {
        case kind, digest
    }

    private enum Kind: String, Codable {
        case wire, decryptedOnDevice
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(Kind.self, forKey: .kind) {
        case .wire:
            self = .wire
        case .decryptedOnDevice:
            self = .decryptedOnDevice(digest: try c.decode(String.self, forKey: .digest))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .wire:
            try c.encode(Kind.wire, forKey: .kind)
        case .decryptedOnDevice(let digest):
            try c.encode(Kind.decryptedOnDevice, forKey: .kind)
            try c.encode(digest, forKey: .digest)
        }
    }
}

// MARK: - Le message porte sa provenance

extension MeeshyMessage {
    /// Le texte que porte ce message est-il le clair que CET appareil a
    /// déchiffré ? Faux pour tout texte venu du fil, et pour un clair que
    /// quelqu'un a réécrit depuis.
    public var isContentDecryptedOnDevice: Bool {
        contentOrigin.vouches(for: content)
    }

    /// L'UNIQUE porte d'un clair déchiffré : le texte et sa provenance, ensemble.
    public mutating func adoptDecryptedContent(_ plaintext: String) {
        content = plaintext
        contentOrigin = .decrypted(plaintext)
    }

    /// Recouvre le texte par le clair qu'un AUTRE exemplaire du même message
    /// porte, avec sa provenance — seulement si celle-ci le couvre. Sinon,
    /// rien ne change (fail-closed).
    public mutating func carryDecryptedContent(from known: MeeshyMessage) {
        guard known.isContentDecryptedOnDevice else { return }
        content = known.content
        contentOrigin = known.contentOrigin
    }
}
