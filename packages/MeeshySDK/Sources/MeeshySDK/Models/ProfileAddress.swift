import Foundation

/// Le glyphe d'une adresse (#18863) : la liste fermée de `ADDRESS_GLYPHS`. Un glyphe inconnu se lit `site`.
public enum ProfileAddressGlyph: String, CaseIterable, Codable, Sendable {
    case site
    case music
    case photos
    case videos
    case shop
    case contact
    case agenda
    case favorite

    public init(wire: String?) {
        self = wire.flatMap(ProfileAddressGlyph.init(rawValue:)) ?? .site
    }
}

/// Une de MES adresses (#18871) telle que `GET /users/me/addresses` la rend à son propriétaire : le contenu, le
/// cercle à partir duquel elle se lit, son rang, si elle s'affiche, et ses clics quand ils sont comptés. Lue par un
/// autre, la même forme arrive sans cercle, sans rang ni clics. Un cercle illisible reste `nil` — jamais Public.
public struct ProfileAddress: Codable, Identifiable, Sendable, Equatable, CacheIdentifiable {
    public let id: String
    public let title: String
    public let url: String
    public let glyph: ProfileAddressGlyph
    public let circle: RelationLevel?
    public let position: Int
    public let isShown: Bool
    public let clicks: Int?
    public let trackedPath: String?

    public init(id: String, title: String, url: String, glyph: ProfileAddressGlyph = .site,
                circle: RelationLevel? = nil, position: Int = 0, isShown: Bool = true,
                clicks: Int? = nil, trackedPath: String? = nil) {
        self.id = id
        self.title = title
        self.url = url
        self.glyph = glyph
        self.circle = circle
        self.position = position
        self.isShown = isShown
        self.clicks = clicks
        self.trackedPath = trackedPath
    }

    enum CodingKeys: String, CodingKey {
        case id, title, url, glyph, circle, position, isShown, clicks, trackedPath
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decode(String.self, forKey: .title)
        url = try container.decode(String.self, forKey: .url)
        glyph = ProfileAddressGlyph(wire: try container.decodeIfPresent(String.self, forKey: .glyph))
        circle = try container.decodeIfPresent(String.self, forKey: .circle).flatMap(RelationLevel.init(rawValue:))
        position = try container.decodeIfPresent(Int.self, forKey: .position) ?? 0
        isShown = try container.decodeIfPresent(Bool.self, forKey: .isShown) ?? true
        clicks = try container.decodeIfPresent(Int.self, forKey: .clicks)
        trackedPath = try container.decodeIfPresent(String.self, forKey: .trackedPath)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(title, forKey: .title)
        try container.encode(url, forKey: .url)
        try container.encode(glyph.rawValue, forKey: .glyph)
        try container.encodeIfPresent(circle?.rawValue, forKey: .circle)
        try container.encode(position, forKey: .position)
        try container.encode(isShown, forKey: .isShown)
        try container.encodeIfPresent(clicks, forKey: .clicks)
        try container.encodeIfPresent(trackedPath, forKey: .trackedPath)
    }

    /// Où mène le geste d'ouvrir : par son lien de suivi quand elle compte ses clics (le clic se compte, la loi de
    /// cercle se rejoue au serveur), sinon l'adresse elle-même. Jamais autre chose que du http(s). L'origine par défaut
    /// est celle de l'environnement actif, comme `TrackedLink.redirectURL`.
    public func opening(webOrigin: String = MeeshyConfig.shared.webOrigin) -> URL? {
        if let trackedPath, trackedPath.hasPrefix("/l/"), let tracked = URL(string: webOrigin + trackedPath) {
            return tracked
        }
        guard let direct = URL(string: url), let scheme = direct.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else { return nil }
        return direct
    }

    /// Le site où l'on part, dit avant de quitter Meeshy.
    public var host: String {
        URL(string: url)?.host ?? displayURL
    }

    /// L'adresse telle qu'on la lit, en chasse fixe : sans schéma ni barre finale.
    public var displayURL: String {
        var text = url
        for scheme in ["https://", "http://"] where text.lowercased().hasPrefix(scheme) {
            text = String(text.dropFirst(scheme.count))
        }
        while text.hasSuffix("/") { text = String(text.dropLast()) }
        return text
    }
}

/// Ce qu'on envoie pour créer ou modifier une adresse : seuls les champs portés partent.
public struct ProfileAddressDraft: Encodable, Sendable, Equatable {
    public var url: String?
    public var title: String?
    public var glyph: ProfileAddressGlyph?
    public var circle: RelationLevel?
    public var isShown: Bool?
    public var countClicks: Bool?

    public init(url: String? = nil, title: String? = nil, glyph: ProfileAddressGlyph? = nil,
                circle: RelationLevel? = nil, isShown: Bool? = nil, countClicks: Bool? = nil) {
        self.url = url
        self.title = title
        self.glyph = glyph
        self.circle = circle
        self.isShown = isShown
        self.countClicks = countClicks
    }

    enum CodingKeys: String, CodingKey {
        case url, title, glyph, circle, isShown, countClicks
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(url, forKey: .url)
        try container.encodeIfPresent(title, forKey: .title)
        try container.encodeIfPresent(glyph?.rawValue, forKey: .glyph)
        try container.encodeIfPresent(circle?.rawValue, forKey: .circle)
        try container.encodeIfPresent(isShown, forKey: .isShown)
        try container.encodeIfPresent(countClicks, forKey: .countClicks)
    }
}

/// La prévalidation d'une adresse : la MÊME règle que `packages/shared/utils/profile-addresses.ts`, pour dire tout
/// de suite ce que la passerelle refuserait. Le serveur reste juge ; ceci n'est qu'un retour immédiat.
public enum ProfileAddressRules {
    public static let titleMaxLength = 24
    public static let urlMaxLength = 2048
    public static let maxCount = 12

    private static let internalSuffixes = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet",
                                           ".private", ".localdomain", ".home.arpa"]

    /// Rogné ; vide, trop long ou balisé : `nil`.
    public static func normalizedTitle(_ value: String?) -> String? {
        let trimmed = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !containsControlOrMarkup(trimmed) else { return nil }
        return trimmed.count > titleMaxLength ? nil : trimmed
    }

    /// L'adresse à envoyer, ou `nil` si elle n'est pas publiable : http(s) seulement, sans identifiants, vers un
    /// nom de domaine public. Un domaine nu devient `https://`.
    public static func normalizedURL(_ value: String?) -> String? {
        let trimmed = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= urlMaxLength,
              !trimmed.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) || $0.value < 0x20 || $0.value == 0x7F })
        else { return nil }
        let explicit = trimmed.range(of: "^https?://", options: [.regularExpression, .caseInsensitive]) != nil
        let anyScheme = trimmed.range(of: "^[a-zA-Z][a-zA-Z0-9+.-]*:", options: .regularExpression) != nil
        let hostWithPort = trimmed.range(of: "^[^/?#:]+:[0-9]+([/?#]|$)", options: .regularExpression) != nil
        if anyScheme && !hostWithPort && !explicit { return nil }
        let candidate = explicit ? trimmed : "https://\(trimmed)"
        guard let components = URLComponents(string: candidate),
              let scheme = components.scheme?.lowercased(), scheme == "http" || scheme == "https",
              components.user == nil, components.password == nil,
              let host = components.host, isPublicDomain(host) else { return nil }
        return candidate
    }

    private static func containsControlOrMarkup(_ text: String) -> Bool {
        text.unicodeScalars.contains { $0 == "<" || $0 == ">" || $0.value < 0x20 || $0.value == 0x7F }
    }

    private static func isPublicDomain(_ hostname: String) -> Bool {
        var host = hostname.lowercased()
        if host.hasSuffix(".") { host.removeLast() }
        if host.hasPrefix("[") || host.range(of: "^[0-9]+(\\.[0-9]+){0,3}$", options: .regularExpression) != nil {
            return false
        }
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        guard labels.count >= 2, !labels.contains(where: { $0.isEmpty }),
              let last = labels.last, String(last).range(of: "^[a-z][a-z0-9-]*$", options: .regularExpression) != nil,
              host != "localhost" else { return false }
        return !internalSuffixes.contains { host.hasSuffix($0) }
    }
}

/// Les adresses qu'une fiche SERT à son lecteur (#18863) : seulement celles que son cercle ouvre, dans l'ordre du
/// propriétaire, sans rang ni clics — le cercle ne part qu'au propriétaire. Lues avec indulgence : une entrée
/// illisible se saute, et une forme inattendue vaut « aucune », jamais la perte du profil entier.
public struct ServedProfileAddresses: Codable, Sendable, Equatable {
    public let items: [ProfileAddress]

    public init(_ items: [ProfileAddress]) {
        self.items = items
    }

    private struct Skipped: Decodable {
        init(from decoder: Decoder) throws {}
    }

    public init(from decoder: Decoder) throws {
        guard var container = try? decoder.unkeyedContainer() else {
            items = []
            return
        }
        var read: [ProfileAddress] = []
        while !container.isAtEnd {
            if let address = try? container.decode(ProfileAddress.self) {
                read.append(address)
            } else if (try? container.decode(Skipped.self)) == nil {
                break
            }
        }
        items = read
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(items)
    }
}
