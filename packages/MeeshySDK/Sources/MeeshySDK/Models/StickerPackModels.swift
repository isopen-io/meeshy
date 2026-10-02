import Foundation

// MARK: - Les packs de stickers (#9141 web + passerelle, #9190 iOS)

/// **Le genre d'un sticker de pack** — `packages/shared/types/sticker-pack.ts`.
///
/// `static` est un mot réservé de Swift : le cas s'appelle `still`, sa valeur
/// brute reste celle du fil. Un genre qu'une passerelle plus récente ajouterait
/// se décode en `unknown`, jamais en erreur : la boutique entière ne tombe pas
/// pour un sticker qu'iOS ne sait pas encore lire.
public enum StickerPackKind: String, Sendable, Hashable, Codable {
    case still = "static"
    case cinematic
    case instant
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StickerPackKind(rawValue: raw) ?? .unknown
    }
}

public enum StickerPackStatus: String, Sendable, Hashable, Codable {
    case pending
    case approved
    case rejected
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StickerPackStatus(rawValue: raw) ?? .unknown
    }
}

/// Une zone de texte d'un Instant — ce qu'iOS en lit aujourd'hui : de quoi la
/// NOMMER. Le rendu des zones de tiers est un lot à part (#9190, reste).
public struct StickerPackTextZone: Codable, Hashable, Sendable {
    public let slot: String
    public let label: String
    public let defaultText: String
    public let maxLength: Int

    public init(slot: String, label: String, defaultText: String, maxLength: Int) {
        self.slot = slot
        self.label = label
        self.defaultText = defaultText
        self.maxLength = maxLength
    }
}

public struct StickerPackItem: Codable, Hashable, Sendable, Identifiable {
    public let key: String
    public let title: String
    public let emoji: String
    public let kind: StickerPackKind
    public let mimeType: String
    /// Chemin servi par `GET /attachments/file/*`, à résoudre comme tout média.
    public let fileUrl: String
    public let width: Int
    public let height: Int
    public let zones: [StickerPackTextZone]

    public var id: String { key }

    public init(key: String, title: String, emoji: String, kind: StickerPackKind,
                mimeType: String, fileUrl: String, width: Int, height: Int,
                zones: [StickerPackTextZone] = []) {
        self.key = key
        self.title = title
        self.emoji = emoji
        self.kind = kind
        self.mimeType = mimeType
        self.fileUrl = fileUrl
        self.width = width
        self.height = height
        self.zones = zones
    }

    enum CodingKeys: String, CodingKey {
        case key, title, emoji, kind, mimeType, fileUrl, width, height, zones
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? key
        emoji = try c.decodeIfPresent(String.self, forKey: .emoji) ?? ""
        kind = try c.decodeIfPresent(StickerPackKind.self, forKey: .kind) ?? .unknown
        mimeType = try c.decodeIfPresent(String.self, forKey: .mimeType) ?? "image/png"
        fileUrl = try c.decodeIfPresent(String.self, forKey: .fileUrl) ?? ""
        width = try c.decodeIfPresent(Int.self, forKey: .width) ?? 0
        height = try c.decodeIfPresent(Int.self, forKey: .height) ?? 0
        zones = (try? c.decodeIfPresent([StickerPackTextZone].self, forKey: .zones)) ?? []
    }
}

/// **Un pack, résumé (boutique) ou détaillé (feuille)** — `StickerPackSummary`
/// et `StickerPackDetail` du shared en un seul type : le résumé est un détail
/// sans `items`.
public struct StickerPack: Codable, Hashable, Sendable, Identifiable {
    public let slug: String
    public let name: String
    public let description: String
    public let author: String
    /// Dessiné par le client (Mee, Meo, Mee & Meo) : aucun fichier côté serveur.
    public let isBuiltin: Bool
    public let status: StickerPackStatus
    public let itemCount: Int
    public let kinds: [StickerPackKind]
    public let coverUrl: String?
    public var installed: Bool
    public var installCount: Int
    public let items: [StickerPackItem]

    public var id: String { slug }

    public init(slug: String, name: String, description: String = "", author: String = "",
                isBuiltin: Bool = false, status: StickerPackStatus = .approved,
                itemCount: Int = 0, kinds: [StickerPackKind] = [], coverUrl: String? = nil,
                installed: Bool = false, installCount: Int = 0, items: [StickerPackItem] = []) {
        self.slug = slug
        self.name = name
        self.description = description
        self.author = author
        self.isBuiltin = isBuiltin
        self.status = status
        self.itemCount = itemCount
        self.kinds = kinds
        self.coverUrl = coverUrl
        self.installed = installed
        self.installCount = installCount
        self.items = items
    }

    enum CodingKeys: String, CodingKey {
        case slug, name, description, author, status, itemCount, kinds, coverUrl
        case installed, installCount, items
        case isBuiltin = "builtin"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        slug = try c.decode(String.self, forKey: .slug)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? slug
        description = try c.decodeIfPresent(String.self, forKey: .description) ?? ""
        author = try c.decodeIfPresent(String.self, forKey: .author) ?? ""
        isBuiltin = try c.decodeIfPresent(Bool.self, forKey: .isBuiltin) ?? false
        status = try c.decodeIfPresent(StickerPackStatus.self, forKey: .status) ?? .unknown
        itemCount = try c.decodeIfPresent(Int.self, forKey: .itemCount) ?? 0
        kinds = try c.decodeIfPresent([StickerPackKind].self, forKey: .kinds) ?? []
        coverUrl = try c.decodeIfPresent(String.self, forKey: .coverUrl)
        installed = try c.decodeIfPresent(Bool.self, forKey: .installed) ?? false
        installCount = try c.decodeIfPresent(Int.self, forKey: .installCount) ?? 0
        items = try c.decodeIfPresent([StickerPackItem].self, forKey: .items) ?? []
    }

    /// **Ce qu'iOS sait poser ou envoyer** : les stickers fixes et cinématiques.
    /// Un Instant de tiers demande le moteur de zones de texte (`layoutStickerText`
    /// du shared), qu'iOS n'a pas encore ; il n'est pas offert plutôt qu'offert
    /// muet — son image de repli ne porterait pas le texte saisi.
    public var sendableItems: [StickerPackItem] {
        items.filter { $0.kind == .still || $0.kind == .cinematic }
    }

    /// Le descripteur qui part avec l'image de repli — le contrat du web
    /// (`composer-pack-stickers.tsx`).
    public func messageSticker(for item: StickerPackItem) -> MessageSticker {
        MessageSticker(templateId: StickerPackTemplateID.make(slug: slug, key: item.key),
                       emoji: item.emoji.isEmpty ? nil : item.emoji)
    }
}

// MARK: - Le gabarit d'un sticker de pack dans un message

/// `pack.<slug>.<clé>` — `stickerPackTemplateId` / `parseStickerPackTemplateId`
/// du shared, aux mêmes motifs.
public enum StickerPackTemplateID {
    public static let prefix = "pack."

    public static func make(slug: String, key: String) -> String {
        "\(prefix)\(slug).\(key)"
    }

    public static func parse(_ templateID: String?) -> (slug: String, key: String)? {
        guard let templateID, templateID.hasPrefix(prefix) else { return nil }
        let parts = templateID.dropFirst(prefix.count).split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return nil }
        let slug = String(parts[0])
        let key = String(parts[1])
        guard isSlugShaped(slug), isSlugShaped(key) else { return nil }
        return (slug, key)
    }

    /// `^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$` — le motif du shared, sans regex.
    static func isSlugShaped(_ value: String) -> Bool {
        let allowed = Set("abcdefghijklmnopqrstuvwxyz0123456789-")
        guard let first = value.first, let last = value.last,
              first != "-", last != "-" else { return false }
        return value.allSatisfy(allowed.contains)
    }
}

// MARK: - Les packs intégrés

/// Mee, Meo et « Mee & Meo » — `BUILTIN_STICKER_PACKS` du shared, dans son
/// ordre. Installés par défaut tant que l'utilisateur ne les a pas retirés.
public enum BuiltinStickerPack: String, CaseIterable, Sendable {
    case mee
    case meo
    case meeEtMeo = "mee-et-meo"

    public init?(slug: String) {
        self.init(rawValue: slug)
    }
}
