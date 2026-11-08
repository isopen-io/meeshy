import Foundation

// MARK: - Friend Request

public struct FriendRequest: Codable, CacheIdentifiable, Identifiable, Sendable, Equatable {
    public let id: String
    public let senderId: String
    public let receiverId: String
    public let message: String?
    public let status: String
    public let sender: FriendRequestUser?
    public let receiver: FriendRequestUser?
    public let respondedAt: Date?
    public let createdAt: Date
    public let updatedAt: Date?
    /// Le cran visé (#13933) : `nil` = Ami, le sens historique d'une demande sans niveau.
    public let targetLevel: String?

    /// Le cran que cette demande vise, ou `nil` quand la valeur servie est illisible : une
    /// demande qu'on ne sait pas lire reste une demande simple, jamais un cran inventé.
    public var requestedLevel: RelationLevel? {
        guard let targetLevel else { return .friend }
        let level = RelationLevel(wire: targetLevel)
        return level == .public ? nil : level
    }

    public init(
        id: String,
        senderId: String,
        receiverId: String,
        message: String? = nil,
        status: String,
        sender: FriendRequestUser? = nil,
        receiver: FriendRequestUser? = nil,
        respondedAt: Date? = nil,
        createdAt: Date,
        updatedAt: Date? = nil,
        targetLevel: String? = nil
    ) {
        self.id = id
        self.senderId = senderId
        self.receiverId = receiverId
        self.message = message
        self.status = status
        self.sender = sender
        self.receiver = receiver
        self.respondedAt = respondedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.targetLevel = targetLevel
    }
}

extension FriendRequestUser: Equatable {
    public static func == (lhs: FriendRequestUser, rhs: FriendRequestUser) -> Bool {
        lhs.id == rhs.id
            && lhs.username == rhs.username
            && lhs.firstName == rhs.firstName
            && lhs.lastName == rhs.lastName
            && lhs.displayName == rhs.displayName
            && lhs.avatar == rhs.avatar
            && lhs.isOnline == rhs.isOnline
            && lhs.lastActiveAt == rhs.lastActiveAt
            && lhs.profileDecor == rhs.profileDecor
    }
}

public struct FriendRequestUser: Codable, CacheIdentifiable, Sendable, ProfileDecorWearer {
    public let id: String
    public let username: String
    public let firstName: String?
    public let lastName: String?
    public let displayName: String?
    public let avatar: String?
    public let isOnline: Bool?
    public let lastActiveAt: Date?
    /// Le contour d'avatar équipé (#10945), servi avec la personne. Additif et tolérant : absent
    /// (ancien serveur, aucun contour) ⇒ `nil` ; illisible ⇒ aucun contour (`avatarRing == nil`).
    public let profileDecor: ServedProfileDecor?

    /// Sans lui, un struct `public` sans initialiseur explicite ne reçoit
    /// qu'un memberwise init INTERNAL — inconstructible depuis un autre
    /// module (l'app, ses tests) alors que `FriendRequest` juste au-dessus
    /// en a un. Même patron, pour la même raison.
    public init(
        id: String,
        username: String,
        firstName: String? = nil,
        lastName: String? = nil,
        displayName: String? = nil,
        avatar: String? = nil,
        isOnline: Bool? = nil,
        lastActiveAt: Date? = nil,
        profileDecor: ServedProfileDecor? = nil
    ) {
        self.profileDecor = profileDecor
        self.id = id
        self.username = username
        self.firstName = firstName
        self.lastName = lastName
        self.displayName = displayName
        self.avatar = avatar
        self.isOnline = isOnline
        self.lastActiveAt = lastActiveAt
    }

    public var name: String {
        displayName ?? [firstName, lastName].compactMap { $0 }.joined(separator: " ").nonEmpty ?? username
    }
}

// MARK: - Send Friend Request

public struct SendFriendRequest: Encodable {
    public let receiverId: String
    public let message: String?
    /// Le cran visé (`ACQUAINTANCE|FRIEND|CLOSE|BLOOD`) ; absent = Ami. Omis du corps quand `nil`,
    /// donc une demande simple part exactement comme avant.
    public let targetLevel: String?

    public init(receiverId: String, message: String? = nil, targetLevel: String? = nil) {
        self.receiverId = receiverId
        self.message = message
        self.targetLevel = targetLevel
    }
}

// MARK: - Respond to Friend Request

/// L'ancienne forme — `{ status }` — que les trois ALIAS servent encore.
///
/// Elle ne dit que deux des quatre gestes. La route canonique porte une
/// ACTION (`FriendRequestAction`) ; ce type reste pour un appelant qui viserait
/// délibérément un alias.
public struct RespondFriendRequest: Encodable {
    public let status: String

    public init(accepted: Bool) {
        self.status = accepted ? "accepted" : "rejected"
    }
}

/// Le corps de `PATCH /directory/friend-requests/{id}` — un geste, un verbe.
///
/// Quatre gestes vivaient sur deux verbes et trois routes : `accept`,
/// `reject`, `cancel` (l'émetteur retire la sienne), `dismiss` (l'une ou
/// l'autre partie écarte la ligne).
public struct FriendRequestAction: Encodable {
    public let action: String

    public init(action: String) {
        self.action = action
    }
}

/// Ce que rendent `cancel` et `dismiss` — la ligne a DISPARU, il n'y a plus de
/// demande à décoder.
///
/// Décodé comme tel, et non en `[String: Bool]` : un type trop STRICT
/// transforme un succès serveur en échec client, ce que le dépôt a déjà payé
/// sur le déblocage — l'enregistrement d'outbox n'était jamais acquitté, et
/// l'écran affichait « impossible » sur un serveur qui avait écrit.
public struct FriendRequestActionResult: Decodable, Sendable {
    public let id: String?
    public let deleted: Bool?
    public let message: String?

    public init(id: String? = nil, deleted: Bool? = nil, message: String? = nil) {
        self.id = id
        self.deleted = deleted
        self.message = message
    }
}

// MARK: - Email Invitation

public struct EmailInvitationRequest: Encodable {
    public let email: String

    public init(email: String) {
        self.email = email
    }
}

public struct EmailInvitationResponse: Decodable {
    public let email: String
    public let sentAt: Date?
}

// MARK: - String Helper

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
