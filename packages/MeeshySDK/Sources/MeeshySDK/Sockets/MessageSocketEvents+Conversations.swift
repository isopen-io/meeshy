import Foundation
import SocketIO
import Combine
import os

public struct UnreadUpdateEvent: Decodable, Sendable {
    public let conversationId: String
    public let unreadCount: Int
    /// Ce que le serveur annonce du pont ✦ (G-123). Voir `BridgeAnnouncement` :
    /// le troisième état est la raison d'être de ce type.
    public let announcement: BridgeAnnouncement

    /// Le pont annoncé, `nil` s'il n'y en a pas OU si le serveur n'a rien dit.
    /// Conservé pour les lectures qui n'ont besoin QUE de la valeur ; toute
    /// écriture en cache doit passer par `announcement`, sans quoi elle
    /// réintroduit exactement la confusion que ce lot retire.
    public var bridge: ConversationBridge? { announcement.value }

    public init(conversationId: String, unreadCount: Int, announcement: BridgeAnnouncement) {
        self.conversationId = conversationId
        self.unreadCount = unreadCount
        self.announcement = announcement
    }

    /// Compat : `bridge: nil` a toujours voulu dire « pas de pont », donc
    /// `.cleared`. Les appelants qui veulent le silence nomment `.notComputed`.
    public init(conversationId: String, unreadCount: Int, bridge: ConversationBridge? = nil) {
        self.init(
            conversationId: conversationId,
            unreadCount: unreadCount,
            announcement: bridge.map(BridgeAnnouncement.bridge) ?? .cleared
        )
    }

    private enum CodingKeys: String, CodingKey {
        case conversationId, unreadCount, bridge
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.conversationId = try c.decode(String.self, forKey: .conversationId)
        self.unreadCount = try c.decode(Int.self, forKey: .unreadCount)

        // `contains` est le SEUL prédicat qui sépare les deux silences :
        // `decodeIfPresent` rend `nil` aussi bien pour la clé absente que pour
        // un `null` explicite, et c'est précisément la distinction à tenir.
        guard c.contains(.bridge) else {
            self.announcement = .notComputed
            return
        }
        // `try?` APLATIT l'optionnel imbriqué (SE-0230) : `try?` d'un
        // `ConversationBridge?` rend un `ConversationBridge?`, pas un double.
        // Ce `if let` ne réussit donc QUE sur un pont réellement décodé — un
        // `null` comme une erreur de décodage tombent tous deux dans le `else`,
        // où `decodeNil` les sépare.
        if let bridge = try? c.decodeIfPresent(ConversationBridge.self, forKey: .bridge) {
            self.announcement = .bridge(bridge)
        } else if (try? c.decodeNil(forKey: .bridge)) == true {
            self.announcement = .cleared
        } else {
            // Le serveur a bien annoncé QUELQUE CHOSE, mais on ne sait pas le
            // lire (pont malformé). Décodage TOLÉRANT, même patron que
            // `MeeshyConversation.bridge` (`CoreModels.swift`) : l'événement
            // entier reste exploitable. Mais un pont ILLISIBLE n'est pas un
            // pont ABSENT — ne pas savoir lire n'autorise pas à détruire, donc
            // `.notComputed` et non `.cleared`.
            self.announcement = .notComputed
        }
    }
}

public struct UserPreferencesUpdatedEvent: Decodable, Sendable {
    public let userId: String
    public let category: String
    public let conversationId: String?
    public let isPinned: Bool?
    public let isMuted: Bool?
    public let isArchived: Bool?
    public let mentionsOnly: Bool?
    public let categoryId: String?
    public let reaction: String?
    public let customName: String?
    public let tags: [String]?

    public init(
        userId: String,
        category: String,
        conversationId: String? = nil,
        isPinned: Bool? = nil,
        isMuted: Bool? = nil,
        isArchived: Bool? = nil,
        mentionsOnly: Bool? = nil,
        categoryId: String? = nil,
        reaction: String? = nil,
        customName: String? = nil,
        tags: [String]? = nil
    ) {
        self.userId = userId; self.category = category; self.conversationId = conversationId
        self.isPinned = isPinned; self.isMuted = isMuted; self.isArchived = isArchived
        self.mentionsOnly = mentionsOnly
        self.categoryId = categoryId; self.reaction = reaction
        self.customName = customName; self.tags = tags
    }
}

/// `conversation:deleted` — per-user soft delete broadcast to the user's room.
/// Named `…SocketEvent` to avoid clashing with `ConversationDeletedEvent`
/// (the store input type, same module).
public struct ConversationDeletedSocketEvent: Decodable, Sendable {
    public let userId: String
    public let conversationId: String
}

/// `conversation:restored` — la MONTANTE du couple `delete-for-me` /
/// `restore-for-me` (#4389, moitié cliente de #4344).
///
/// Miroir EXACT de `ConversationDeletedSocketEvent` — mêmes deux champs, même
/// room personnelle (`ROOMS.user`), même geste symétrique. La charge n'est pas
/// élargie d'un octet, et c'est délibéré : le décodeur iOS est STRICT, donc un
/// champ non optionnel absent fait échouer le décodage de l'événement ENTIER,
/// en silence, dans un `catch`. Un nom NEUF plutôt qu'un élargissement de
/// `conversation:updated` relève de la même mesure — c'est la leçon du cycle
/// 128, et le serveur a tranché pareil.
public struct ConversationRestoredSocketEvent: Decodable, Sendable {
    public let userId: String
    public let conversationId: String
}

/// `user:preferences-reordered` — batch drag-reorder broadcast.
public struct UserPreferencesReorderedSocketEvent: Decodable, Sendable {
    public struct Update: Decodable, Sendable {
        public let conversationId: String
        public let orderInCategory: Int
    }
    public let userId: String
    public let updates: [Update]
}

/// `user:updated` — un CONTACT (quelqu'un avec qui on partage au moins une
/// conversation) a changé son profil public. Delta léger : seules les clés
/// modifiées sont présentes.
///
/// **Les quatre composants du nom voyagent en GROUPE** (contrat gateway,
/// `UserUpdatedEventData` dans `packages/shared/types/socketio-events.ts`) :
/// dès que l'un change, les quatre sont émis. C'est nécessaire parce qu'un
/// client ne stocke que le nom DÉJÀ composé — recomposer depuis un delta
/// partiel est impossible. `hasNameGroup` matérialise ce contrat : `avatar` et
/// `banner` changent seuls, le nom jamais, donc la présence de `username`
/// suffit à reconnaître le groupe.
///
/// `avatar`/`banner` sont tri-états et c'est délibéré : clé absente = « pas
/// concerné », clé à `null` = « photo RETIRÉE ». Les confondre laisserait
/// l'ancienne image après une suppression.
public struct UserUpdatedEvent: Decodable, Sendable {
    public let userId: String
    public let displayName: String?
    public let firstName: String?
    public let lastName: String?
    public let username: String?
    /// `true` quand le payload porte le groupe du nom (cf. ci-dessus).
    public let hasNameGroup: Bool
    public let avatar: OptionalMediaChange
    public let banner: OptionalMediaChange

    /// Clé absente vs clé à `null` — même distinction que
    /// `LastMessagePreviewTranslations`, pour la même raison.
    public enum OptionalMediaChange: Sendable, Hashable {
        case unchanged
        case replaced(String?)
    }

    private enum CodingKeys: String, CodingKey {
        case userId, changes
    }

    private enum ChangeKeys: String, CodingKey {
        case displayName, firstName, lastName, username, avatar, banner
    }

    public init(from decoder: Decoder) throws {
        let root = try decoder.container(keyedBy: CodingKeys.self)
        self.userId = try root.decode(String.self, forKey: .userId)
        let changes = try root.nestedContainer(keyedBy: ChangeKeys.self, forKey: .changes)
        self.displayName = try changes.decodeIfPresent(String.self, forKey: .displayName)
        self.firstName = try changes.decodeIfPresent(String.self, forKey: .firstName)
        self.lastName = try changes.decodeIfPresent(String.self, forKey: .lastName)
        self.username = try changes.decodeIfPresent(String.self, forKey: .username)
        self.hasNameGroup = changes.contains(.username)
        // `if` plutôt qu'un ternaire : Swift refuse un `try` à droite d'un
        // opérateur non-affectation.
        if changes.contains(.avatar) {
            self.avatar = .replaced(try changes.decodeIfPresent(String.self, forKey: .avatar))
        } else {
            self.avatar = .unchanged
        }
        if changes.contains(.banner) {
            self.banner = .replaced(try changes.decodeIfPresent(String.self, forKey: .banner))
        } else {
            self.banner = .unchanged
        }
    }
}

/// `category:created` / `category:updated` — full category snapshot. The
/// nested `category` object decodes straight into `ConversationCategory`
/// (extra gateway keys userId/createdAt/updatedAt are ignored).
public struct CategorySocketEvent: Decodable, Sendable {
    public let userId: String
    public let category: ConversationCategory
}

/// `category:deleted`.
public struct CategoryDeletedSocketEvent: Decodable, Sendable {
    public let userId: String
    public let categoryId: String
}

/// `categories:reordered`.
public struct CategoriesReorderedSocketEvent: Decodable, Sendable {
    public struct Update: Decodable, Sendable {
        public let categoryId: String
        public let order: Int
    }
    public let userId: String
    public let updates: [Update]
}

public struct ConversationStatsEvent: Decodable, Sendable {
    public let conversationId: String
    public let stats: ConversationStats

    public struct ConversationStats: Decodable, Sendable {
        public let participantCount: Int?
        public let onlineUsers: [OnlineUser]?
        public let messagesPerLanguage: [String: Int]?
        public let participantsPerLanguage: [String: Int]?
    }

    public struct OnlineUser: Decodable, Sendable {
        public let id: String
        public let username: String?
        public let firstName: String?
        public let lastName: String?
    }
}

public struct UserStatusEvent: Decodable, Sendable {
    public let userId: String
    public let username: String
    public let isOnline: Bool
    public let lastActiveAt: Date?

    public init(userId: String, username: String, isOnline: Bool, lastActiveAt: Date? = nil) {
        self.userId = userId; self.username = username
        self.isOnline = isOnline; self.lastActiveAt = lastActiveAt
    }
}

/// Snapshot émis par le gateway juste après l'authentification du socket. Liste tous
/// les contacts (autres participants des conversations du nouvel arrivant) avec leur
/// `isOnline` runtime calculé depuis la `connectedUsers` Map. Permet au client de seed
/// son store de présence sans attendre des events `user:status` individuels. Voir
/// `services/gateway/src/socketio/MeeshySocketIOManager.ts → _emitPresenceSnapshot`.
public struct PresenceSnapshotEvent: Decodable, Sendable {
    public let users: [UserStatusEvent]

    public init(users: [UserStatusEvent]) {
        self.users = users
    }
}

// MARK: - Participant Role Updated Event Data

/// Le participant imbriqué de `participant:role-updated`.
///
/// `role` porte le rôle **GLOBAL** (`USER|ADMIN|…`) depuis le cycle 92 bis ; le rang
/// DANS LA CONVERSATION est `conversationRole`, et il voyage aussi au premier
/// niveau de l'événement sous `newRole` — c'est celui-là qu'on applique.
///
/// Tout est optionnel sauf `id` : un champ manquant ne doit jamais faire tomber
/// l'événement ENTIER. Le décodeur du manager journalise et JETTE l'événement sur
/// la moindre erreur, donc un nom absent coûterait la mise à jour du rang.
public struct ParticipantRoleUpdatedParticipantInfo: Decodable, Sendable {
    public let id: String
    public let role: String?
    public let conversationRole: String?
    public let displayName: String?
    public let userId: String?
}

public struct ConversationParticipationEvent: Decodable, Sendable {
    public let conversationId: String
    public let userId: String
}

/// Server-rejected `conversation:join` carrying the offending conversationId
/// so the client can route the failure to the right ViewModel and purge any
/// stale cache entries. `reason` is a stable machine-readable code:
/// `not_a_member`, `banned`, `no_longer_member`, `invalid_payload`,
/// `server_error`. `message` is a localized, human-readable description.
/// Refus d'une jonction de conversation (`conversation:join-error`).
///
/// Contrat partagé : `ConversationJoinErrorEventData`
/// (`packages/shared/types/socketio-events.ts`).
public struct ConversationJoinErrorEvent: Decodable, Sendable {
    public let conversationId: String
    /// Motif du refus. `nil` seulement d'une passerelle antérieure au contrat.
    ///
    /// **Il DÉCIDE.** Voir ``isMembershipDenied`` — un consommateur qui
    /// l'ignore traite une limite de débit comme une exclusion.
    public let reason: String?
    public let message: String?

    /// Les seuls motifs qui ÉTABLISSENT que le lecteur n'est pas membre, donc
    /// les seuls où purger le cache de la conversation ou fermer la vue ouverte
    /// est fondé.
    ///
    /// JUMEAU de `isMembershipDeniedJoinError()`
    /// (`packages/shared/utils/conversation-join-error.ts`) — toute évolution
    /// touche les deux.
    ///
    /// La passerelle émet sept motifs ; quatre sont transitoires (`rate_limited`,
    /// `server_error`, `not_authenticated`, `invalid_payload`) et ne disent rien
    /// de l'appartenance. Ce client les traitait tous comme une révocation
    /// d'accès : une limite de débit franchie par une tempête de reconnexion
    /// fermait le fil que l'utilisateur était en train de lire, sur un bandeau
    /// « accès révoqué », après avoir purgé son cache.
    ///
    /// Liste d'AUTORISATION, jamais d'exclusion : un motif inconnu — d'une
    /// passerelle plus récente que ce client — rend `false`. Ne pas savoir lire
    /// n'autorise pas à détruire ; c'est la règle que `MeeshyConversation.bridge`
    /// applique déjà, pour la même raison.
    public var isMembershipDenied: Bool {
        guard let reason else { return false }
        return ["not_a_member", "banned", "no_longer_member"].contains(reason)
    }
}

public struct ParticipantRoleUpdatedEvent: Decodable, Sendable {
    public let conversationId: String
    public let userId: String
    public let newRole: String
    public let updatedBy: String
    /// OPTIONNEL, comme le déclare le type partagé (`participant?`) : la
    /// passerelle envoie `null` quand la relecture du rang ne rend rien. Il était
    /// non-optionnel ici, et un `null` faisait échouer le décodage de l'événement
    /// ENTIER — donc aucun rafraîchissement, sans trace côté produit.
    ///
    /// Ce qui compte pour appliquer le changement (`userId`, `newRole`) est au
    /// premier niveau : l'événement reste utile sans ce bloc.
    public let participant: ParticipantRoleUpdatedParticipantInfo?
}

public struct SocketEventUser: Decodable, Sendable {
    public let id: String
}

/// `conversation:participant-joined` — quelqu'un a été AJOUTÉ à la conversation.
///
/// Symétrique de `ParticipantLeftEvent`, et le seul événement qui porte ce fait
/// sans ambiguïté : `conversation:joined` sert le MÊME payload pour l'ack
/// self-only qu'un socket reçoit en rejoignant la room, que produit chaque
/// ouverture de fil et qui ne change aucune appartenance. Compter dessus
/// gonflerait l'effectif à chaque ouverture.
public struct ParticipantJoinedEvent: Decodable, Sendable {
    public let conversationId: String
    public let userId: String
    public let displayName: String
    public let joinedAt: String

    /// Effectif ACTIF APRÈS l'adhésion, absolu — à POSER, jamais à incrémenter.
    ///
    /// Un delta ne converge pas : l'événement manqué (hors room, hors ligne,
    /// trou de reconnexion) laisse une dérive que RIEN ne rattrape, et qu'iOS
    /// PERSISTE (`schedulePersist` écrit la valeur fausse dans le cache
    /// disque). Un total, lui, se rattrape au premier événement suivant.
    ///
    /// Le compte INCLUT l'arrivant, alors même que l'éventail serveur l'écarte.
    ///
    /// Absent (`nil`) sur un gateway antérieur à ce contrat, où l'incrément
    /// reste le seul repli disponible.
    public let memberCount: Int?

    /// Vrai quand `memberCount` arrive plafonné à 199 (cap d'affichage
    /// « 199+ », broadcast unique pour toute la room). À POSER avec lui ;
    /// absent quand l'effectif transmis est exact.
    public let memberCountCapped: Bool?
}

public struct ParticipantLeftEvent: Decodable, Sendable {
    public let conversationId: String
    /// L'identité TOUJOURS servie — la seule qu'un visiteur venu par un lien
    /// partagé possède, n'ayant aucune ligne `User`. C'est sur elle qu'on retire
    /// la bonne ligne, jamais sur `userId`.
    ///
    /// Optionnelle pour un gateway antérieur au contrat, pas parce qu'elle
    /// manquerait : `names(_:)` compare alors au seul `userId`, ce qui reproduit
    /// le comportement d'avant.
    public let participantId: String?
    /// `nil` quand la personne n'a PAS de compte. **Non-optionnel jusqu'ici** :
    /// le premier visiteur sans compte expulsé aurait fait échouer le décodage
    /// de l'événement ENTIER, en silence — `Decodable` refuse un `null` sur un
    /// `String`, et l'événement n'aurait atteint aucun abonné.
    public let userId: String?
    public let displayName: String
    public let leftAt: String

    /// La personne nommée par cet événement est-elle `identity` ?
    ///
    /// Une identité iOS est un `User.id` pour un compte, un `Participant.id`
    /// pour un visiteur de lien partagé (cf. `authContext.userId` côté gateway).
    /// L'événement porte les DEUX faces, et il faut les essayer toutes les deux :
    /// comparer au seul `userId` rate tout visiteur sans compte, comparer au seul
    /// `participantId` rate tout compte.
    public func names(_ identity: String) -> Bool {
        !identity.isEmpty && (identity == userId || identity == participantId)
    }

    /// Effectif ACTIF APRÈS le départ, absolu — à POSER, jamais à soustraire.
    /// Même raison que sur `ParticipantJoinedEvent` : un client qui décrémente
    /// ne se rattrape jamais d'un événement manqué. `nil` sur un gateway
    /// antérieur, où le décrément reste le seul repli.
    public let memberCount: Int?

    /// Vrai quand `memberCount` arrive plafonné à 199 (cap d'affichage
    /// « 199+ », broadcast unique pour toute la room). À POSER avec lui ;
    /// absent quand l'effectif transmis est exact.
    public let memberCountCapped: Bool?
}

public struct ParticipantBannedEvent: Decodable, Sendable {
    public let conversationId: String
    /// Voir `ParticipantLeftEvent.participantId`.
    public let participantId: String?
    /// `nil` sans compte — voir `ParticipantLeftEvent.userId`.
    public let userId: String?
    public let bannedBy: SocketEventUser
    public let bannedAt: String
    /// Le lien de partage que ce bannissement a FERMÉ. `nil` quand la personne
    /// n'était pas entrée par un lien : il n'y avait pas de porte à fermer.
    public let closedShareLinkId: String?

    /// La personne nommée par cet événement est-elle `identity` ?
    ///
    /// Une identité iOS est un `User.id` pour un compte, un `Participant.id`
    /// pour un visiteur de lien partagé (cf. `authContext.userId` côté gateway).
    /// L'événement porte les DEUX faces, et il faut les essayer toutes les deux :
    /// comparer au seul `userId` rate tout visiteur sans compte, comparer au seul
    /// `participantId` rate tout compte.
    public func names(_ identity: String) -> Bool {
        !identity.isEmpty && (identity == userId || identity == participantId)
    }
    /// `false` quand la cible avait DÉJÀ quitté la conversation : bannir un
    /// ancien membre reste possible — c'est ce qui l'empêche de revenir par un
    /// lien de partage — mais ce bannissement-là ne retire aucune appartenance.
    ///
    /// Absent des serveurs antérieurs à ce contrat, où bannir retirait toujours :
    /// `nil` se lit donc comme `true`, cf. `didEndMembership`.
    public let membershipEnded: Bool?

    /// La lecture à faire d'un champ optionnel dont l'absence signifie l'ancien
    /// comportement — jamais `event.membershipEnded == true`, qui traiterait un
    /// serveur plus ancien comme un bannissement sans effet.
    public var didEndMembership: Bool { membershipEnded ?? true }

    /// Effectif ACTIF APRÈS le bannissement, absolu — à POSER.
    ///
    /// Quand il est là, il tranche `membershipEnded` de lui-même : bannir un
    /// ex-membre ne retire personne, donc le compte est simplement inchangé, et
    /// le poser est exact dans les deux cas. Le court-circuit sur
    /// `didEndMembership` ne subsiste que pour un gateway qui ne l'envoie pas.
    public let memberCount: Int?

    /// Vrai quand `memberCount` arrive plafonné à 199 (cap d'affichage
    /// « 199+ », broadcast unique pour toute la room). À POSER avec lui ;
    /// absent quand l'effectif transmis est exact.
    public let memberCountCapped: Bool?
}

public struct ParticipantUnbannedEvent: Decodable, Sendable {
    public let conversationId: String
    /// Voir `ParticipantLeftEvent.participantId`.
    public let participantId: String?
    /// `nil` sans compte — voir `ParticipantLeftEvent.userId`.
    public let userId: String?
    /// Le bannissement est levé dans tous les cas ; l'appartenance n'est rendue
    /// que si le bannissement l'avait prise. `false` quand la personne était
    /// partie d'elle-même AVANT d'être bannie.
    ///
    /// Même lecture que `membershipEnded` : absent ⇒ `true`.
    public let membershipRestored: Bool?

    public var didRestoreMembership: Bool { membershipRestored ?? true }

    /// Effectif ACTIF APRÈS la levée, absolu — à POSER. Même lecture que sur
    /// `ParticipantBannedEvent` : présent, il tranche `membershipRestored`.
    public let memberCount: Int?

    /// Vrai quand `memberCount` arrive plafonné à 199 (cap d'affichage
    /// « 199+ », broadcast unique pour toute la room). À POSER avec lui ;
    /// absent quand l'effectif transmis est exact.
    public let memberCountCapped: Bool?
}

public struct ConversationClosedEvent: Decodable, Sendable {
    public let conversationId: String
    public let closedBy: String
    public let closedAt: String
}

public struct ConversationNewEvent: Decodable, Sendable {
    public let conversationId: String
    public let conversationType: String
    public let title: String?
    public let creatorId: String
    public let participantIds: [String]
    public let createdAt: String

    public init(
        conversationId: String,
        conversationType: String,
        title: String?,
        creatorId: String,
        participantIds: [String],
        createdAt: String
    ) {
        self.conversationId = conversationId
        self.conversationType = conversationType
        self.title = title
        self.creatorId = creatorId
        self.participantIds = participantIds
        self.createdAt = createdAt
    }
}

public struct NotificationReadEvent: Decodable, Sendable {
    public let notificationId: String
}

/// `notification:read-bulk` — un AUTRE appareil du meme compte vient de marquer
/// un LOT lu. Le gateway n'envoie AUCUN id (`updateMany` / `$runCommandRaw` ne
/// les rendent pas) : il annonce le PREDICAT, que chaque client rejoue sur son
/// propre cache. @see NotificationBulkScopeMapping.
public struct NotificationReadBulkEvent: Decodable, Sendable {
    public let scope: NotificationBulkScopePayload
}

/// `notification:deleted-bulk` — jumeau du precedent cote PURGE. Cas plus fort :
/// `notification:counts` ne dit RIEN d'une purge des lues (`unread` est
/// inchange par construction), donc sans ce predicat rien n'annonce la purge
/// aux autres appareils.
public struct NotificationDeletedBulkEvent: Decodable, Sendable {
    public let scope: NotificationBulkScopePayload
}

/// `friend-request:cancelled` — signal temps reel PUR (aucune ligne
/// `Notification` persistee, contrairement a NEW/ACCEPTED/REJECTED). Emis a
/// l'user-room de l'AUTRE partie, donc `cancelledBy` designe par construction
/// l'interlocuteur, jamais le lecteur.
public struct FriendRequestCancelledEvent: Decodable, Sendable {
    public let friendRequestId: String?
    public let cancelledBy: String
}

/// `friend-request:rejected` — emis a l'user-room de l'EXPEDITEUR d'origine.
/// C'est donc `_sentPending` qu'il faut vider chez le lecteur, jamais
/// `_receivedPending`. `senderId` n'est PAS sur le fil (il ne sert qu'a router
/// l'emission cote gateway) : declare optionnel par tolerance, jamais lu.
public struct FriendRequestRejectedEvent: Decodable, Sendable {
    public let friendRequestId: String?
    public let senderId: String?
    public let rejecterId: String
}

public struct NotificationDeletedEvent: Decodable, Sendable {
    public let notificationId: String
}

public struct NotificationCountsEvent: Decodable, Sendable {
    public let total: Int
    public let unread: Int
    public let byType: [String: Int]?
}
