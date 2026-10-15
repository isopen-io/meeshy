import Foundation

// MARK: - World Wide (#10000, #10006)

/// Ce que `GET /api/v1/world` sert — public, sans identité. La clé de jonction
/// (`shareLinkIdentifier`) se LIT ici ; aucun client ne l'écrit en dur, ce qui
/// permet au serveur de changer de lien sans republier d'application.
/// Miroir de `worldEntrySchema` (`packages/shared/types/world.ts`).
public struct WorldEntry: Decodable, Sendable, Equatable {
    public let identifier: String
    public let title: String
    public let shareLinkIdentifier: String
    public let memberCount: Int
    public let memberCountCapped: Bool?
    /// L'avatar et la bannière de World Wide (#10204), en adresses absolues.
    /// Optionnels : un serveur qui ne les sert pas laisse les initiales et le
    /// dégradé, jamais une erreur de décodage.
    public let avatar: String?
    public let banner: String?

    public init(
        identifier: String,
        title: String,
        shareLinkIdentifier: String,
        memberCount: Int,
        memberCountCapped: Bool? = nil,
        avatar: String? = nil,
        banner: String? = nil
    ) {
        self.identifier = identifier
        self.title = title
        self.shareLinkIdentifier = shareLinkIdentifier
        self.memberCount = memberCount
        self.memberCountCapped = memberCountCapped
        self.avatar = avatar
        self.banner = banner
    }

    /// `formatMemberCount(count, capped)` : « 199+ » au-delà du plafond.
    public var formattedMemberCount: String {
        memberCountCapped == true ? "\(memberCount)+" : "\(memberCount)"
    }
}

/// L'effectif n'est plus servi à un visiteur sans compte (#10205, #10216) :
/// absent, il vaut 0 et ne s'affiche nulle part — jamais une entrée World Wide
/// perdue parce qu'un agrégat manque.
extension WorldEntry {
    enum CodingKeys: String, CodingKey {
        case identifier, title, shareLinkIdentifier, memberCount, memberCountCapped, avatar, banner
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            identifier: try c.decode(String.self, forKey: .identifier),
            title: try c.decode(String.self, forKey: .title),
            shareLinkIdentifier: try c.decode(String.self, forKey: .shareLinkIdentifier),
            memberCount: try c.decodeIfPresent(Int.self, forKey: .memberCount) ?? 0,
            memberCountCapped: try c.decodeIfPresent(Bool.self, forKey: .memberCountCapped),
            avatar: try c.decodeIfPresent(String.self, forKey: .avatar),
            banner: try c.decodeIfPresent(String.self, forKey: .banner)
        )
    }
}

// MARK: - POST /links/:key/members (porte canonique, #4167)

/// Le corps de la jonction d'un INVITÉ : son nom (le pseudo que le fil
/// montrera) et sa langue principale.
public struct LinkMembershipRequest: Encodable, Sendable {
    public let nickname: String
    public let language: String

    public init(nickname: String, language: String) {
        self.nickname = nickname
        self.language = language
    }
}

/// Les droits RÉSOLUS du participant, servis au seul visiteur sans compte.
public struct LinkEntryRights: Decodable, Sendable, Equatable {
    public let canSendMessages: Bool?
    public let canSendFiles: Bool?
    public let canSendImages: Bool?
    public let canSendVideos: Bool?
    public let canSendAudios: Bool?
    public let canSendLocations: Bool?
    public let canSendLinks: Bool?
    public let canViewHistory: Bool?

    /// Fermé par défaut : un droit que la réponse ne nomme pas n'est pas accordé.
    public var permissions: ParticipantPermissions {
        ParticipantPermissions(
            canSendMessages: canSendMessages ?? false,
            canSendFiles: canSendFiles ?? false,
            canSendImages: canSendImages ?? false,
            canSendVideos: canSendVideos ?? false,
            canSendAudios: canSendAudios ?? false,
            canSendLocations: canSendLocations ?? false,
            canSendLinks: canSendLinks ?? false
        )
    }
}

public struct LinkMembershipEntry: Decodable, Sendable {
    public let outcome: String
    public let canViewHistory: Bool?
    public let rights: LinkEntryRights?
    /// Les familles BRUTES servies (#10001) — `nil` quand le lien ne restreint rien.
    public let allowedAttachmentKinds: [String]?

    public var attachmentAllowance: GuestAttachmentAllowance {
        GuestAttachmentAllowance(kinds: GuestAttachmentKind.knownKinds(from: allowedAttachmentKinds))
    }
}

public struct LinkMembershipResponse: Decodable, Sendable {
    /// Remis une fois, au seul visiteur sans compte.
    public let sessionToken: String?
    public let conversationId: String
    public let participantId: String
    public let entry: LinkMembershipEntry
}
