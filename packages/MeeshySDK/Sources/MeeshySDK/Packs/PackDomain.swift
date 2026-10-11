import Foundation

// MARK: - Le moteur des packs, à domaines (#10148 LP0, #10150 LP2)
//
// MIROIR de `packages/shared/types/content-pack.ts` : les stickers, les cadres
// de gloire et (plus tard) les cadres de capture s'installent, se retirent et
// se montrent par le MÊME code. Le domaine choisit l'adresse ; le reste est
// commun.

public enum PackDomain: String, CaseIterable, Codable, Sendable, Hashable {
    case sticker
    case gloryFrame = "glory-frame"
}

/// `builtin` : dessiné par le client ; `official` : publié par Meeshy ;
/// `community` : proposé par un tiers (stickers seuls). Une origine qu'une
/// passerelle plus récente ajouterait se lit `unknown`, jamais en erreur.
public enum PackOrigin: String, Codable, Sendable, Hashable {
    case builtin
    case official
    case community
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PackOrigin(rawValue: raw) ?? .unknown
    }
}

/// **Ce qu'un pack, de n'importe quel domaine, doit dire pour qu'une étagère
/// l'installe, le retire et le compte** — les champs communs de
/// `PackSummaryBase`.
public protocol InstallablePack: Codable, Hashable, Sendable, Identifiable where ID == String {
    var slug: String { get }
    var installed: Bool { get set }
    var installCount: Int { get set }
    /// Dessiné ou embarqué par le client : installer ne rapporte aucun octet,
    /// donc aucune relecture des packs installés n'est nécessaire.
    var isBundled: Bool { get }
}

// MARK: - Le décodage tolérant, par ITEM

/// **Une liste servie dont chaque élément se décode SEUL** : un pack illisible
/// (champ manquant, forme d'une passerelle plus récente) tombe et se compte,
/// la boutique entière ne tombe pas avec lui.
public struct LossyDecodableArray<Element: Decodable>: Decodable {
    public let elements: [Element]
    public let dropped: Int

    public init(elements: [Element], dropped: Int = 0) {
        self.elements = elements
        self.dropped = dropped
    }

    public init(from decoder: Decoder) throws {
        let candidates = try [Failable].init(from: decoder)
        let kept = candidates.compactMap(\.value)
        self.elements = kept
        self.dropped = candidates.count - kept.count
    }

    /// Un élément qui se lit, ou `nil` — son décodage ne lève jamais, donc le
    /// curseur avance toujours, même sur un élément qui n'est pas un objet.
    private struct Failable: Decodable {
        let value: Element?

        init(from decoder: Decoder) throws {
            value = try? Element(from: decoder)
        }
    }
}

extension LossyDecodableArray: Sendable where Element: Sendable {}
extension LossyDecodableArray: Encodable where Element: Encodable {
    public func encode(to encoder: Encoder) throws {
        var container = encoder.unkeyedContainer()
        try container.encode(contentsOf: elements)
    }
}
