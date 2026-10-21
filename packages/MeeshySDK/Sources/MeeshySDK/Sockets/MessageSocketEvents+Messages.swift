import Foundation
import SocketIO
import Combine
import os

// MARK: - Message Socket Event Data

public struct MessageDeletedEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String

    public init(messageId: String, conversationId: String) {
        self.messageId = messageId
        self.conversationId = conversationId
    }
}

/// `message:expired` — un message autodestructible échu, brûlé par le SERVEUR
/// (`ExpiredMessagesCleanupService`) plutôt que supprimé par un utilisateur.
///
/// Même forme, même effet local que `MessageDeletedEvent` (la bulle disparaît) :
/// un événement distinct existe pour que la CAUSE reste distinguable, si un
/// consommateur en a besoin (un log, un futur toast). Sans handler dédié, ce
/// client n'a aucun traitement d'éphémère et un message échu restait affiché
/// tant que la conversation restait ouverte.
public struct MessageExpiredEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String

    public init(messageId: String, conversationId: String) {
        self.messageId = messageId
        self.conversationId = conversationId
    }
}

/// `message:countdown-started` — le gateway a enregistré la PREMIÈRE réception
/// d'un destinataire et sert désormais une échéance pour ce lecteur (contrat du
/// fil #7451, point 5).
///
/// L'événement existe parce que `message:new` ne PEUT PAS porter l'échéance
/// d'un éphémère : c'est une diffusion en room, et l'échéance est résolue par
/// LECTEUR (`D(u) = réception(u) + ephemeralDuration`). Il part donc vers la
/// room `user:<destinataire>` — pour ses AUTRES appareils, qui n'ont pas vu
/// l'arrivée — et vers `user:<expéditeur>`, avec la plus tardive des échéances
/// connues, qui est la seule horloge qu'un envoi puisse afficher.
public struct MessageCountdownStartedEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String
    public let expiresAt: Date

    public init(messageId: String, conversationId: String, expiresAt: Date) {
        self.messageId = messageId
        self.conversationId = conversationId
        self.expiresAt = expiresAt
    }
}

/// L'ADRESSE d'un message dont la visibilité PERSONNELLE vient de changer.
///
/// Le couple, jamais le seul `messageId` : un lot de masquage traverse
/// plusieurs conversations (« effacer ces 100 »), et le consommateur doit
/// pouvoir trier les références qui concernent le fil qu'il tient.
public struct PersonalMessageVisibilityRef: Decodable, Sendable, Equatable {
    public let messageId: String
    public let conversationId: String

    public init(messageId: String, conversationId: String) {
        self.messageId = messageId
        self.conversationId = conversationId
    }
}

/// `message:hidden-for-me` — CE lecteur vient de retirer des messages de SA
/// vue, depuis un autre de ses appareils.
///
/// À ne pas confondre avec `message:deleted`, qui décrit une suppression POUR
/// TOUS et laisse une pierre tombale (« ce message a été supprimé »). Ici le
/// message reste vivant pour les autres participants : il doit simplement
/// DISPARAÎTRE du fil de ce lecteur, sans trace. Les deux gestes n'ont donc pas
/// la même écriture locale, et réutiliser `markDeleted` afficherait une
/// tombstone là où l'utilisateur attend le vide.
///
/// Une LISTE, pas un id : la route de masquage en lot en accepte cent, et un
/// événement par message ferait payer cent réconciliations à un seul geste. La
/// route unitaire émet une liste d'un élément — les clients n'ont qu'une forme
/// à traiter. Contrat serveur : `services/gateway/src/services/personalMessageVisibilitySync.ts`.
public struct MessageHiddenForMeEvent: Decodable, Sendable {
    public let userId: String
    public let messages: [PersonalMessageVisibilityRef]
    /// Instant ISO-8601 du masquage. Optionnel côté client : il n'arbitre rien
    /// (le masquage est un fait par-lecteur, sans concurrence à départager) et
    /// un serveur plus ancien pourrait ne pas le porter.
    public let hiddenAt: String?

    public init(userId: String, messages: [PersonalMessageVisibilityRef], hiddenAt: String? = nil) {
        self.userId = userId
        self.messages = messages
        self.hiddenAt = hiddenAt
    }
}

/// `message:restored-for-me` — l'INVERSE de `message:hidden-for-me` : un
/// message que CE lecteur avait retiré de sa vue redevient visible, depuis un
/// autre de ses appareils (`POST /api/messages/:id/restore-for-me`).
///
/// La charge utile ne porte VOLONTAIREMENT aucun contenu, et c'est la propriété
/// qui décide de l'écriture locale. Une APPARITION ne peut pas s'écrire comme
/// une tombstone inversée : le masquage a PURGÉ la ligne (cf.
/// `MessageHiddenForMeEvent`), l'appareil ne détient donc plus rien à
/// ressusciter. La seule instruction honnête que porte cet événement est une
/// ADRESSE — « va rechercher ce message » — et le consommateur doit refaire un
/// aller-retour serveur. Contrat serveur :
/// `services/gateway/src/services/personalMessageVisibilitySync.ts`.
public struct MessageRestoredForMeEvent: Decodable, Sendable {
    public let userId: String
    public let messages: [PersonalMessageVisibilityRef]
    /// Instant ISO-8601 du retour en vue. Optionnel pour la même raison que
    /// `hiddenAt` : il n'arbitre rien, et un serveur plus ancien pourrait ne
    /// pas le porter — son absence ne doit pas faire perdre le retour.
    public let restoredAt: String?

    public init(userId: String, messages: [PersonalMessageVisibilityRef], restoredAt: String? = nil) {
        self.userId = userId
        self.messages = messages
        self.restoredAt = restoredAt
    }
}

public struct ReactionAggregationEvent: Decodable, Sendable {
    public let emoji: String
    public let count: Int
    public let participantIds: [String]?
    /// **Ne jamais lire ce champ.** Il n'est plus émis (gateway, cycle 115) et
    /// reste décodable pour la seule raison qu'il peut encore arriver : la file
    /// hors-ligne rejoue jusqu'à 48 h la charge telle qu'elle a été ENFILÉE.
    ///
    /// Quand il arrive, il vaut ce que la passerelle avait calculé pour
    /// l'**ACTEUR** de l'événement — donc `true` pour la réaction d'un TIERS.
    /// Une diffusion de room n'a pas de lecteur : il n'y a pas de « moi » à y
    /// résoudre. « Ma réaction » se dérive de `ReactionUpdateEvent.userId`
    /// confronté au `currentUser`, comme le font déjà `PostDetailViewModel` et
    /// `StoryViewerView+Content` sur la famille commentaire.
    public let hasCurrentUser: Bool?
}

public struct ReactionUpdateEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String?
    /// `Participant.id` résolu côté serveur — PAS un `User.id`. La ligne
    /// optimiste locale est keyée par `User.id` (sentinelle `currentUserId`) :
    /// comparer les deux champs ne matche jamais pour sa propre réaction.
    public let participantId: String?
    /// `User.id` de l'auteur de la réaction (envoyé par le gateway depuis
    /// toujours, décodé depuis 2026-08-12). C'est LA clé d'identité stable
    /// pour reconnaître l'écho de sa propre réaction et dédupliquer contre la
    /// ligne optimiste.
    public let userId: String?
    public let emoji: String
    public let action: String?
    public let aggregation: ReactionAggregationEvent?
    public let timestamp: String?

    public var count: Int { aggregation?.count ?? 0 }
}

/// BUG2 A' — delta de réaction par-image reçu du serveur
/// (`attachment:reaction-added` / `attachment:reaction-removed`). `reactionSummary`
/// porte les comptes agrégés APRÈS l'action ; l'état « ma réaction » est maintenu
/// côté client (optimiste + cold-load REST), miroir des réactions message-level.
public struct AttachmentReactionUpdateEvent: Decodable, Sendable {
    public let attachmentId: String
    public let messageId: String
    public let conversationId: String?
    public let participantId: String?
    public let emoji: String
    public let action: String?
    public let reactionSummary: [String: Int]?
    public let timestamp: String?
}

public struct TypingEvent: Decodable, Sendable {
    public let userId: String
    /// Identifiant (handle) de l'utilisateur.
    public let username: String
    /// Nom d'affichage explicite (displayName saisi ou « Prénom Nom »). `nil` si le
    /// gateway ne l'a pas transmis (version antérieure). Le gateway transmet les deux
    /// valeurs brutes — le client choisit quoi afficher via `preferredDisplayName`.
    public let displayName: String?
    public let conversationId: String

    /// Nom à afficher dans l'indicateur de frappe : `displayName` en priorité,
    /// `username` en repli. La décision d'affichage appartient au client.
    public var preferredDisplayName: String {
        if let displayName, !displayName.isEmpty { return displayName }
        return username
    }

    public init(userId: String, username: String, displayName: String? = nil, conversationId: String) {
        self.userId = userId
        self.username = username
        self.displayName = displayName
        self.conversationId = conversationId
    }
}

/// Ce que le serveur DIT du pont ✦ sur `conversation:unread-updated` — trois
/// états, là où le fil n'a que deux formes (cycle 63).
///
/// Le champ `bridge` était un `ConversationBridge?`, et cet optionnel confondait
/// deux affirmations opposées : « j'ai calculé, il n'y a pas de pont » et « je
/// n'ai pas calculé ». Le moteur de synchro recopiait l'optionnel tel quel —
/// `updated[idx].bridge = event.bridge` — donc tout émetteur serveur muet
/// ordonnait un effacement sans le savoir. C'est ainsi que chaque reconnexion
/// retirait le pont de TOUTES les lignes du lecteur (cycle 62).
///
/// Le fil sépare désormais les deux : clé absente ≠ `bridge: null`. Cette énum
/// est le miroir Swift de cette grammaire — on ne peut plus lire le champ sans
/// avoir à dire dans quel cas on est.
///
/// @see `ConversationUnreadUpdatedEventData` (`packages/shared/types/socketio-events.ts`)
/// @see `services/gateway/src/socketio/unreadBridgeField.ts` — les émetteurs
public enum BridgeAnnouncement: Sendable, Equatable {
    /// Clé ABSENTE du payload : le serveur n'a pas calculé le pont. On garde
    /// celui qu'on a — un silence ne détruit rien.
    case notComputed
    /// `bridge: null` EXPLICITE : le serveur a calculé, il n'y a pas de pont.
    /// On efface.
    case cleared
    /// Un pont neuf. On remplace.
    case bridge(ConversationBridge)

    /// Le pont à écrire, quand il y en a un. `nil` ne suffit PAS à décider :
    /// il faut savoir si l'on est en `.cleared` (écrire `nil`) ou en
    /// `.notComputed` (ne rien écrire). Cette propriété n'existe donc que pour
    /// lire la valeur une fois la décision prise.
    public var value: ConversationBridge? {
        if case .bridge(let bridge) = self { return bridge }
        return nil
    }
}

/// `message:pending-delivered` — la file hors-ligne d'un utilisateur vient
/// d'être rejouée au reconnect. `count` ne compte que ce qui est réellement
/// reparti ; `conversationIds` nomme les fils TOUCHÉS par le drain (rejeu
/// réussi ou entrée perdue), pour qu'un client aille les resynchroniser.
/// I3 (#7349) : iOS ne l'écoutait pas du tout (vérifié : aucune occurrence
/// dans `apps/ios`/`packages/MeeshySDK` avant ce lot), alors que le web
/// l'utilise déjà pour invalider ses listes de messages
/// (`apps/web/src/lib/api/socket.ts`).
public struct PendingMessagesDeliveredEvent: Decodable, Sendable {
    public let count: Int
    public let conversationIds: [String]

    public init(count: Int, conversationIds: [String]) {
        self.count = count
        self.conversationIds = conversationIds
    }
}

// MARK: - Attachment Status Updated Event Data

public struct AttachmentStatusUpdatedEvent: Decodable, Sendable {
    public let attachmentId: String
    public let messageId: String
    public let conversationId: String
    public let userId: String
    public let action: String
    public let updatedAt: Date?
    public let playPositionMs: Int?
    public let durationMs: Int?
    public let percentage: Int?
}

// MARK: - Attachment Updated Event Data (`message:attachment-updated`)

/// Payload de `SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED`.
///
/// Reçu quand un worker gateway a enrichi un attachment d'un message
/// existant (transcription Whisper finalisée, traduction audio NLLB+TTS
/// finalisée pour une langue, etc.). `attachment` est la forme complète
/// sérialisée par `serializeAttachmentForSocket` côté gateway — incluant
/// `transcription` et `translations` enrichis. Le client remplace
/// l'attachment correspondant dans son store atomiquement et rehydrate
/// les dictionnaires de métadonnées dérivées.
public struct AttachmentUpdatedEvent: Decodable, Sendable {
    public let conversationId: String
    public let messageId: String
    public let attachment: APIMessageAttachment
}

// MARK: - Reaction Sync Event Data

public struct ReactionSyncEvent: Decodable, Sendable {
    public let messageId: String
    public let reactions: [ReactionAggregationEvent]
    public let totalCount: Int?
    public let userReactions: [String]?
}

// MARK: - Attachment Status Event Data

public struct AttachmentStatusEvent: Decodable, Sendable {
    public let attachmentId: String
    public let status: String
}

// MARK: - Mention Event Data

public struct MentionCreatedEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String
    public let senderId: String?
    public let mentionedUserId: String?
    public let content: String?
    public let timestamp: String?
}
