import Foundation

// MARK: - Le moteur des packs, à domaines (#10148 LP0, #10150 LP2)
//
// MIROIR de `packages/shared/types/content-pack.ts` : les stickers, les cadres
// de gloire et (plus tard) les cadres de capture s'installent, se retirent et
// se montrent par le MÊME code. Le domaine choisit l'adresse ; le reste est
// commun.

public enum PackDomain: String, Codable, Sendable, Hashable, CaseIterable {
    case sticker
    case gloryFrame = "glory-frame"
    case wallpaper
    case avatarRing = "avatar-ring"
    case banner
    /// Le cadre posé SUR la photo de bannière, centre transparent (#10932, #10936).
    case bannerFrame = "banner-frame"
    /// Un domaine qu'une passerelle plus récente ajouterait (`capture-frame`,
    /// ou tout autre) : il se lit, il ne fait pas tomber la liste qui le porte,
    /// et il ne route JAMAIS une requête (§ 11 de la spécification 2026-10-14).
    case unknown

    /// Les domaines que ce client sait router — `unknown` n'en est pas un.
    public static var allCases: [PackDomain] { [.sticker, .gloryFrame, .wallpaper, .avatarRing, .banner, .bannerFrame] }

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PackDomain(rawValue: raw) ?? .unknown
    }

    /// La valeur de `?domaine=` d'un lien : `nil` pour l'absent, le blanc et
    /// l'inconnu — la vitrine s'ouvre alors sur son premier domaine.
    public init?(queryValue: String?) {
        guard let raw = queryValue?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              let domain = PackDomain(rawValue: raw), domain != .unknown else { return nil }
        self = domain
    }

    /// Un domaine dont le registre peut porter un prix (§ 4.3).
    public var isPurchasable: Bool {
        switch self {
        case .wallpaper, .avatarRing, .banner, .bannerFrame: true
        case .sticker, .gloryFrame, .unknown: false
        }
    }
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
