import Foundation

// L'ÉCOUTE PARTAGÉE (#13934, #16686) — ce qu'un Proche ou un Sang écoute ou regarde, TEL QUE LE SERVEUR ME LE SERT.
// Le contrat est `packages/shared/types/now-playing.ts` ; ce fichier en est la lecture Swift, côté RÉCEPTION (#16755).
// La passerelle a déjà tronqué chaque état au niveau du lecteur : un Proche ne reçoit ni `title` ni `source`. Ce
// décodeur ne garde que les champs du contrat, bornés comme le serveur les borne : un champ en trop ou trop long ne
// traverse jamais jusqu'à l'écran, même si une passerelle future en servait davantage.

public enum NowPlayingContract {
    /// `NOW_PLAYING_TITLE_MAX`.
    public static let titleMax = 200
    /// `NOW_PLAYING_SOURCE_MAX`.
    public static let sourceMax = 60
    /// `NOW_PLAYING_TTL_SECONDS` : un état vit au plus 15 minutes sans nouvel envoi.
    public static let ttl: TimeInterval = 900
}

/// `NOW_PLAYING_CATEGORIES` : ce qu'un Proche voit, la nature de l'activité.
public enum NowPlayingCategory: String, Sendable, Equatable, CaseIterable {
    case music
    case video
    case browsing
}

/// `now-playing:changed` — l'écoute d'UNE personne, déjà tronquée pour MOI. `title` et `source` sont `nil` pour un
/// Proche ; une origine sans titre ne se garde jamais.
public struct NowPlayingChanged: Decodable, Sendable, Equatable {
    public let userId: String
    public let category: NowPlayingCategory
    public let title: String?
    public let source: String?
    public let updatedAt: Date
    public let expiresAt: Date

    public init(userId: String, category: NowPlayingCategory, title: String? = nil, source: String? = nil,
                updatedAt: Date, expiresAt: Date) {
        self.userId = userId
        self.category = category
        self.title = title
        self.source = title == nil ? nil : source
        self.updatedAt = updatedAt
        self.expiresAt = expiresAt
    }

    /// La durée de vie servie, bornée par le contrat : une échéance absurde ne garde jamais une écoute affichée.
    public var lifetime: TimeInterval {
        min(NowPlayingContract.ttl, max(0, expiresAt.timeIntervalSince(updatedAt)))
    }

    private enum CodingKeys: String, CodingKey { case userId, category, title, source, updatedAt, expiresAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let userId = try c.decode(String.self, forKey: .userId).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !userId.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .userId, in: c, debugDescription: "userId vide")
        }
        guard let category = NowPlayingCategory(rawValue: try c.decode(String.self, forKey: .category)) else {
            throw DecodingError.dataCorruptedError(forKey: .category, in: c, debugDescription: "catégorie inconnue")
        }
        guard let updatedAt = Self.instant(try c.decode(String.self, forKey: .updatedAt)),
              let expiresAt = Self.instant(try c.decode(String.self, forKey: .expiresAt)) else {
            throw DecodingError.dataCorruptedError(forKey: .updatedAt, in: c, debugDescription: "instant illisible")
        }
        let title = Self.bounded((try? c.decodeIfPresent(String.self, forKey: .title)) ?? nil, max: NowPlayingContract.titleMax)
        let source = Self.bounded((try? c.decodeIfPresent(String.self, forKey: .source)) ?? nil, max: NowPlayingContract.sourceMax)
        self.init(userId: userId, category: category, title: title, source: source, updatedAt: updatedAt, expiresAt: expiresAt)
    }

    private static func bounded(_ value: String?, max: Int) -> String? {
        guard let text = value?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty, text.count <= max else {
            return nil
        }
        return text
    }

    private static func instant(_ value: String) -> Date? {
        WireDate.date(from: value)
    }
}

/// `now-playing:cleared` — l'écoute de cette personne s'arrête chez moi (pause, fin, baisse, blocage, retrait).
public struct NowPlayingCleared: Decodable, Sendable, Equatable {
    public let userId: String

    public init(userId: String) {
        self.userId = userId
    }
}

/// `GET /relations/now-playing` — les écoutes servies à MOI, déjà tronquées. Un élément illisible est écarté, il ne
/// fait pas tomber le rattrapage.
public struct NowPlayingSnapshot: Decodable, Sendable, Equatable {
    public let items: [NowPlayingChanged]

    public init(items: [NowPlayingChanged]) {
        self.items = items
    }

    private enum CodingKeys: String, CodingKey { case items }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let lenient = (try? c.decodeIfPresent([Lenient].self, forKey: .items)) ?? nil
        items = (lenient ?? []).compactMap(\.value)
    }

    private struct Lenient: Decodable {
        let value: NowPlayingChanged?

        init(from decoder: Decoder) throws {
            value = try? NowPlayingChanged(from: decoder)
        }
    }
}

/// `now-playing:update` — MON état courant, COMPLET, envoyé une fois (#16803). Le serveur le garde scellé et le
/// tronque lecteur par lecteur : ce n'est pas à l'émetteur de choisir qui voit quoi. Les bornes du contrat sont
/// appliquées ICI, avant l'envoi : un titre trop long est raccourci, un texte vide disparaît, une origine sans titre
/// ne part pas — le serveur refuserait la charge entière (`NOW_PLAYING_INVALID`) plutôt que d'en garder une partie.
public struct NowPlayingUpdate: Sendable, Equatable {
    public let category: NowPlayingCategory
    public let title: String?
    public let source: String?

    public init(category: NowPlayingCategory, title: String? = nil, source: String? = nil) {
        let boundedTitle = Self.clipped(title, max: NowPlayingContract.titleMax)
        self.category = category
        self.title = boundedTitle
        self.source = boundedTitle == nil ? nil : Self.clipped(source, max: NowPlayingContract.sourceMax)
    }

    /// La charge de la socket : les clés absentes n'existent pas (le schéma serveur est strict).
    public var wirePayload: [String: String] {
        var payload = ["category": category.rawValue]
        if let title { payload["title"] = title }
        if let source { payload["source"] = source }
        return payload
    }

    private static func clipped(_ value: String?, max: Int) -> String? {
        guard let text = value?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        guard text.count > max else { return text }
        let cut = String(text.prefix(max)).trimmingCharacters(in: .whitespacesAndNewlines)
        return cut.isEmpty ? nil : cut
    }
}

/// Ce que la passerelle a répondu à `now-playing:update`. Un refus n'est jamais rejoué tel quel : l'émetteur attend
/// le prochain changement.
public enum NowPlayingPublishOutcome: Sendable, Equatable {
    case accepted
    case rateLimited
    case refused
    case offline
}
