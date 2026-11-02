import Foundation

/// « QUI EST PRÉVENU » (#14062) — le cran d'entourage d'une action, miroir de
/// `RelationAudienceChoice` (`packages/shared/utils/relation-levels.ts`) : les
/// six niveaux de l'échelle, plus `NOBODY`. Rangé du plus étroit au plus large,
/// l'ordre dans lequel l'écran les propose.
public enum RelationAudienceChoice: String, CaseIterable, Sendable, Codable {
    case nobody = "NOBODY"
    case blood = "BLOOD"
    case close = "CLOSE"
    case friend = "FRIEND"
    case acquaintance = "ACQUAINTANCE"
    case community = "COMMUNITY"
    case `public` = "PUBLIC"

    public init(level: RelationLevel) {
        switch level {
        case .blood: self = .blood
        case .close: self = .close
        case .friend: self = .friend
        case .acquaintance: self = .acquaintance
        case .community: self = .community
        case .public: self = .public
        }
    }
}

/// Une action d'entourage : ce que fait le propriétaire, ou ce que d'autres
/// font sur ses contenus.
public enum CircleNotifyAction: String, CaseIterable, Sendable {
    case post, reel, story, mood, repost, share, comment, reaction, quote, reference, mention
}

/// Les trois familles de `CIRCLE_NOTIFY_FAMILIES`, avec leurs actions et la
/// feature dont le niveau minimal EST le défaut (A → Proche, B → Proche,
/// C → Sang).
public enum CircleNotifyFamily: String, CaseIterable, Sendable {
    case publication
    case onMyContent
    case elsewhere

    public var feature: RelationFeature {
        switch self {
        case .publication: return .notifyNewContent
        case .onMyContent: return .relayCommentersOnMyPosts
        case .elsewhere: return .relayMyCommentsElsewhere
        }
    }

    public var actions: [CircleNotifyAction] {
        switch self {
        case .publication: return [.post, .reel, .story, .mood, .repost, .share]
        case .onMyContent: return [.comment, .reaction, .share, .repost, .quote, .reference, .mention]
        case .elsewhere: return [.comment, .reaction, .share, .quote, .reference, .mention]
        }
    }

    public var defaultChoice: RelationAudienceChoice { RelationAudienceChoice(level: feature.minimumLevel) }

    public var keys: [CircleNotifyKey] { actions.map { CircleNotifyKey(family: self, action: $0) } }
}

/// La clé PLATE `notification.<clé>` : `circle` + famille + action.
public struct CircleNotifyKey: Hashable, Sendable {
    public let family: CircleNotifyFamily
    public let action: CircleNotifyAction

    public init(family: CircleNotifyFamily, action: CircleNotifyAction) {
        self.family = family
        self.action = action
    }

    public var wireName: String { "circle" + Self.capitalized(family.rawValue) + Self.capitalized(action.rawValue) }

    public static let all: [CircleNotifyKey] = CircleNotifyFamily.allCases.flatMap(\.keys)

    private static func capitalized(_ value: String) -> String {
        value.prefix(1).uppercased() + value.dropFirst()
    }
}

/// Les dix-neuf crans servis. Une clé absente vaut le défaut de sa famille ;
/// un cran INCONNU rend la lecture illisible (`DecodingError`) — afficher un
/// défaut à sa place ferait croire qu'on prévient moins de monde qu'on ne le fait.
public struct CircleNotifyPreferences: Equatable, Sendable, Decodable {
    private var choices: [CircleNotifyKey: RelationAudienceChoice]

    public static let defaults = CircleNotifyPreferences(choices: [:])

    private init(choices: [CircleNotifyKey: RelationAudienceChoice]) {
        self.choices = choices
    }

    public subscript(key: CircleNotifyKey) -> RelationAudienceChoice {
        get { choices[key] ?? key.family.defaultChoice }
        set { choices[key] = newValue }
    }

    public func setting(_ choice: RelationAudienceChoice, for key: CircleNotifyKey) -> CircleNotifyPreferences {
        var copy = self
        copy[key] = choice
        return copy
    }

    /// Le cran commun d'une famille, ou `nil` quand ses actions divergent.
    public func uniformChoice(of family: CircleNotifyFamily) -> RelationAudienceChoice? {
        let distinct = Set(family.keys.map { self[$0] })
        return distinct.count == 1 ? distinct.first : nil
    }

    public static func == (lhs: CircleNotifyPreferences, rhs: CircleNotifyPreferences) -> Bool {
        CircleNotifyKey.all.allSatisfy { lhs[$0] == rhs[$0] }
    }

    private struct WireKey: CodingKey {
        let stringValue: String
        var intValue: Int? { nil }
        init(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: WireKey.self)
        var choices: [CircleNotifyKey: RelationAudienceChoice] = [:]
        for key in CircleNotifyKey.all {
            let wire = WireKey(stringValue: key.wireName)
            guard container.contains(wire), try !container.decodeNil(forKey: wire) else { continue }
            let raw = try container.decode(String.self, forKey: wire)
            guard let choice = RelationAudienceChoice(rawValue: raw) else {
                throw DecodingError.dataCorruptedError(forKey: wire, in: container,
                                                       debugDescription: "cran inconnu \(raw)")
            }
            choices[key] = choice
        }
        self.choices = choices
    }
}

/// L'enveloppe servie par `GET`/`PATCH /me/preferences` : seule la catégorie
/// `notification` compte, absente elle vaut « rien de réglé ».
public struct CircleNotifyEnvelope: Decodable, Sendable {
    public let notification: CircleNotifyPreferences

    private enum CodingKeys: String, CodingKey { case notification }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        notification = try container.decodeIfPresent(CircleNotifyPreferences.self, forKey: .notification) ?? .defaults
    }
}

public protocol CircleNotifyServiceProviding: Sendable {
    func load() async throws -> CircleNotifyPreferences
    /// Écrit UNE clé plate et rend le cran que la passerelle a RETENU.
    func update(_ key: CircleNotifyKey, to choice: RelationAudienceChoice) async throws -> RelationAudienceChoice
}

public final class CircleNotifyService: CircleNotifyServiceProviding {
    public static let shared = CircleNotifyService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    static var fieldsQuery: String { CircleNotifyKey.all.map { "notification.\($0.wireName)" }.joined(separator: ",") }

    public func load() async throws -> CircleNotifyPreferences {
        let response: APIResponse<CircleNotifyEnvelope> = try await api.request(
            MeEndpoint.preferences, queryItems: [URLQueryItem(name: "fields", value: Self.fieldsQuery)]
        )
        return response.data.notification
    }

    public func update(_ key: CircleNotifyKey, to choice: RelationAudienceChoice) async throws -> RelationAudienceChoice {
        let body = ["notification": [key.wireName: choice.rawValue]]
        let response: APIResponse<CircleNotifyEnvelope> = try await api.patch(MeEndpoint.preferences, body: body)
        return response.data.notification[key]
    }
}
