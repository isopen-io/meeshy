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
/// L'empreinte est un HMAC-SHA256 du clair, ENCADRÉ par l'id du message, sous
/// une clé SECRÈTE de cet appareil (`ContentOriginDeviceKey`, #11402) — jamais
/// le clair lui-même ni son SHA-256 nu : une empreinte nue se renverse par
/// dictionnaire (« oui ») et relie deux messages au même clair. La clé n'est
/// pas dérivée d'une donnée publique : la passerelle, un cache réécrit ou une
/// sauvegarde restaurée ailleurs ne recalculent pas l'empreinte d'un texte
/// forgé. Elle ne quitte pas l'appareil — aucun producteur réseau ne la
/// décode (`APIMessage` ne la porte pas), seul le cache local (chiffré au
/// repos) la relit — et n'y voyage qu'À CÔTÉ du clair qu'elle couvre : un
/// texte effacé ou réécrit emporte sa provenance avec lui
/// (`MeeshyMessage.content`, `didSet`), donc aucune empreinte d'un clair
/// disparu ne survit à l'effacement.
public enum MessageContentOrigin: Sendable, Equatable {
    case wire
    case decryptedOnDevice(digest: String)

    /// La provenance d'un clair que l'appareil vient de déchiffrer pour CE message.
    public static func decrypted(_ plaintext: String, messageId: String) -> MessageContentOrigin {
        decrypted(plaintext, messageId: messageId, key: ContentOriginDeviceKey.current)
    }

    static func decrypted(_ plaintext: String, messageId: String, key: Data) -> MessageContentOrigin {
        .decryptedOnDevice(digest: digest(of: plaintext, messageId: messageId, key: key))
    }

    /// Cette provenance couvre-t-elle CE texte, pour CE message, sur CET
    /// appareil ? `.wire` ne couvre jamais rien, et ne lit donc pas le
    /// trousseau : la clé ne s'évalue qu'après le genre (#12721).
    public func vouches(for content: String, messageId: String) -> Bool {
        vouches(for: content, messageId: messageId, key: ContentOriginDeviceKey.current)
    }

    func vouches(for content: String, messageId: String, key: @autoclosure () -> Data) -> Bool {
        guard case .decryptedOnDevice(let digest) = self else { return false }
        return Self.constantTimeEquals(digest, Self.digest(of: content, messageId: messageId, key: key()))
    }

    private static let domain = Data("meeshy.message.contentOrigin.v2".utf8)

    /// `domaine ‖ longueur(id) sur 4 octets ‖ id ‖ clair` : l'id et le clair
    /// ne se recombinent pas l'un dans l'autre.
    private static func digest(of content: String, messageId: String, key: Data) -> String {
        let id = Data(messageId.utf8)
        let idLength = withUnsafeBytes(of: UInt32(id.count).bigEndian) { Data($0) }
        let framed = domain + idLength + id + Data(content.utf8)
        return HMAC<SHA256>.authenticationCode(for: framed, using: SymmetricKey(data: key))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    private static func constantTimeEquals(_ lhs: String, _ rhs: String) -> Bool {
        let left = Array(lhs.utf8)
        let right = Array(rhs.utf8)
        guard left.count == right.count else { return false }
        return zip(left, right).reduce(UInt8(0)) { acc, pair in acc | (pair.0 ^ pair.1) } == 0
    }
}

// MARK: - Codage (cache local)

/// `decryptedOnDevice.v2` porte une empreinte sous la clé de l'appareil. Une
/// ligne écrite par #11382 (`decryptedOnDevice`, clé dérivée de l'id, que
/// n'importe qui recalcule) n'est plus vérifiable : elle se relit `.wire` —
/// le texte reste affiché, seule la provenance tombe (fail-closed). Un ancien
/// client qui relit une ligne `v2` n'en connaît pas le genre et la relit
/// `.wire` de même.
extension MessageContentOrigin: Codable {
    private enum CodingKeys: String, CodingKey {
        case kind, digest
    }

    private enum Kind: String, Codable {
        case wire
        case idKeyedLegacy = "decryptedOnDevice"
        case decryptedOnDevice = "decryptedOnDevice.v2"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(Kind.self, forKey: .kind) {
        case .wire, .idKeyedLegacy:
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
    /// Un message supprimé ou échu n'a plus de clair à prouver.
    public var isContentDecryptedOnDevice: Bool {
        deletedAt == nil && contentOrigin.vouches(for: content, messageId: id)
    }

    /// L'UNIQUE porte d'un clair déchiffré : le texte et sa provenance, ensemble.
    public mutating func adoptDecryptedContent(_ plaintext: String) {
        content = plaintext
        contentOrigin = .decrypted(plaintext, messageId: id)
    }

    /// Recouvre le texte par le clair qu'un AUTRE exemplaire du même message
    /// porte — la même ligne relue du cache, ou la copie que la réconciliation
    /// temp → serveur réécrit sous son nouvel id —, avec sa provenance liée à
    /// CET id. Seulement si la provenance de l'exemplaire connu le couvre ;
    /// sinon rien ne change (fail-closed). Le site qui l'appelle apparie les
    /// deux exemplaires.
    public mutating func carryDecryptedContent(from known: MeeshyMessage) {
        guard known.isContentDecryptedOnDevice else { return }
        content = known.content
        contentOrigin = .decrypted(known.content, messageId: id)
    }

    /// Une provenance relue du cache ne vaut que si elle couvre encore le texte.
    func adoptingCachedOrigin(_ cached: MessageContentOrigin) -> MessageContentOrigin {
        guard deletedAt == nil, cached.vouches(for: content, messageId: id) else { return .wire }
        return cached
    }
}
