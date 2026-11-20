import Foundation

/// Une demande d'entrée EN ATTENTE, telle que la passerelle la sert à un
/// intendant (`GET /communities/:id/join-requests`, #19429 ; lue sur iOS par
/// #19877). Miroir de `CommunityJoinRequest` du web
/// (`apps/web/src/lib/api/community-join-requests.ts`).
///
/// Une PROJECTION : nom, identifiant public, avatar, pays (code ISO à deux
/// lettres, jamais la ville) et date. La passerelle ne sert ni la présence ni
/// les coordonnées du demandeur, et rien de plus ne se garde.
public struct APICommunityJoinRequest: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let userId: String
    public let name: String
    public let username: String
    public let avatar: String?
    public let country: String?
    public let createdAt: Date

    public init(id: String, userId: String, name: String, username: String, avatar: String?, country: String?, createdAt: Date) {
        self.id = id; self.userId = userId; self.name = name; self.username = username
        self.avatar = avatar; self.country = Self.isoCountry(country); self.createdAt = createdAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let id = try c.decode(String.self, forKey: .id)
        let userId = try c.decode(String.self, forKey: .userId)
        guard !id.isEmpty, !userId.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .id, in: c, debugDescription: "identifiant vide")
        }
        if let status = try c.decodeIfPresent(String.self, forKey: .status), status != "pending" {
            throw DecodingError.dataCorruptedError(forKey: .status, in: c, debugDescription: "demande déjà tranchée")
        }
        let user = try c.decode(Requester.self, forKey: .user)
        self.init(
            id: id,
            userId: userId,
            name: Self.text(user.displayName) ?? user.username,
            username: user.username,
            avatar: Self.text(user.avatar),
            country: try c.decodeIfPresent(String.self, forKey: .country),
            createdAt: try c.decode(Date.self, forKey: .createdAt)
        )
    }

    private struct Requester: Decodable {
        let username: String
        let displayName: String?
        let avatar: String?
    }

    private enum CodingKeys: String, CodingKey {
        case id, userId, status, country, createdAt, user
    }

    private static func text(_ value: String?) -> String? {
        guard let value, !value.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return value
    }

    private static func isoCountry(_ value: String?) -> String? {
        guard let value, value.count == 2, value.allSatisfy({ $0.isASCII && $0.isUppercase }) else { return nil }
        return value
    }
}

/// Une page de demandes et le curseur OPAQUE de la suivante (`nil` = dernière).
/// Décodage tolérant PAR LIGNE : une demande illisible est sautée, la page reste.
public struct CommunityJoinRequestPage: Sendable, Equatable {
    public let requests: [APICommunityJoinRequest]
    public let nextCursor: String?

    public init(requests: [APICommunityJoinRequest], nextCursor: String?) {
        self.requests = requests
        self.nextCursor = nextCursor.flatMap { $0.isEmpty ? nil : $0 }
    }
}

/// La décision d'un intendant sur une demande.
public enum CommunityJoinRequestDecision: String, Sendable, Equatable {
    case accept, reject
}

/// `community:join-requested` (#19429) — posé sur la room personnelle des
/// administrateurs, des modérateurs et du créateur SEULEMENT. Miroir de
/// `CommunityJoinRequestedEventData`
/// (`packages/shared/types/socketio-events/community.ts`). La charge ne nomme
/// le demandeur que par son identifiant : la liste se RELIT, et la relecture
/// repasse par les gardes de la passerelle (blocage, compte fermé).
public struct CommunityJoinRequestedEvent: Decodable, Sendable, Equatable {
    public let communityId: String
    public let requestId: String
    public let userId: String
    public let pendingCount: Int
    public let at: String

    public init(communityId: String, requestId: String, userId: String, pendingCount: Int, at: String) {
        self.communityId = communityId; self.requestId = requestId; self.userId = userId
        self.pendingCount = pendingCount; self.at = at
    }
}
