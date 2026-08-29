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

public struct MessagePinnedEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String
    public let pinnedBy: String?
    public let pinnedAt: String?

    public init(messageId: String, conversationId: String, pinnedBy: String? = nil, pinnedAt: String? = nil) {
        self.messageId = messageId
        self.conversationId = conversationId
        self.pinnedBy = pinnedBy
        self.pinnedAt = pinnedAt
    }
}

public struct MessageUnpinnedEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String

    public init(messageId: String, conversationId: String) {
        self.messageId = messageId
        self.conversationId = conversationId
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

/// `user:preferences-updated` — **conversation scope**. Mirrors the gateway's
/// `UserPreferencesConversationUpdatedEventData` (versioned per-conversation
/// preferences). The same socket event name also carries a flat **category
/// scope** (`{ userId, category }`) decoded by `UserPreferencesUpdatedEvent`;
/// the decode site discriminates on the presence of `conversationId`.
///
/// `version` drives optimistic-vs-socket resolution in `ConversationStore`
/// (drop when `version <= local`). `reset == true` (DELETE) carries
/// `preferences == nil` — the client restores its local defaults.
public struct UserPreferencesConversationUpdatedSocketEvent: Decodable, Sendable {
    public struct Preferences: Decodable, Sendable {
        public let isPinned: Bool
        public let isMuted: Bool
        public let mentionsOnly: Bool
        public let isArchived: Bool
        public let tags: [String]
        public let categoryId: String?
        public let orderInCategory: Int?
        public let customName: String?
        public let reaction: String?
        public let deletedForUserAt: Date?
        public let clearHistoryBefore: Date?
        /// `ReadingModePreference` (raw : `auto|focal|script|resume|riviere`) —
        /// G-124, champ requis du payload gelé `ConversationPreferencesPayload`
        /// (`packages/shared/types/socketio-events.ts`, « payload complet »,
        /// jamais omis par le gateway sur ce scope). Décodé en `String` brute
        /// ici (pas `ReadingModeOrchestrator.ReadingModePreference` — ce type
        /// vit dans l'app, `MeeshySDK` ne le connaît pas) ; l'app-level
        /// consommateur (`ConversationStoreSocketBridge`
        /// `.onReadingModePreferenceChanged`) fait le `RawRepresentable` sur
        /// SES 5 cas gelés, une valeur inconnue y rendant simplement `nil`.
        ///
        /// Défaut `"auto"` dans l'init memberwise ci-dessous UNIQUEMENT pour
        /// les call sites de test antérieurs à G-124 (le décodage JSON, lui,
        /// exige TOUJOURS la clé — le champ n'est pas optionnel sur le fil).
        public let readingMode: String

        public init(
            isPinned: Bool, isMuted: Bool, mentionsOnly: Bool, isArchived: Bool,
            tags: [String], categoryId: String?, orderInCategory: Int?,
            customName: String?, reaction: String?,
            deletedForUserAt: Date?, clearHistoryBefore: Date?,
            readingMode: String = "auto"
        ) {
            self.isPinned = isPinned; self.isMuted = isMuted
            self.mentionsOnly = mentionsOnly; self.isArchived = isArchived
            self.tags = tags; self.categoryId = categoryId; self.orderInCategory = orderInCategory
            self.customName = customName; self.reaction = reaction
            self.deletedForUserAt = deletedForUserAt; self.clearHistoryBefore = clearHistoryBefore
            self.readingMode = readingMode
        }
    }
    public let userId: String
    public let conversationId: String
    public let version: Int
    public let reset: Bool
    public let preferences: Preferences?
}

/// `conversation:deleted` — per-user soft delete broadcast to the user's room.
/// Named `…SocketEvent` to avoid clashing with `ConversationDeletedEvent`
/// (the store input type, same module).
public struct ConversationDeletedSocketEvent: Decodable, Sendable {
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

    /// Nom à afficher, recomposé avec la règle du chemin REST
    /// (`APIConversationUser.name` : `displayName` puis `username`) pour que la
    /// ligne de liste dise la même chose quel que soit le transport qui l'a
    /// hydratée. `nil` quand le payload ne porte pas le groupe du nom.
    public var resolvedDisplayName: String? {
        guard hasNameGroup else { return nil }
        return [displayName, username].compactMap { $0 }.first { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
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

// MARK: - Translation Event Data

public struct TranslationData: Codable, Sendable, CacheIdentifiable {
    public let id: String
    public let messageId: String
    public let sourceLanguage: String
    public let targetLanguage: String
    public let translatedContent: String
    public let translationModel: String
    public let confidenceScore: Double?
}

public struct TranslationEvent: Codable, Sendable {
    public let messageId: String
    public let translations: [TranslationData]
}

// MARK: - Transcription Event Data

public struct TranscriptionSegment: Codable, Sendable {
    public let text: String
    public let startTime: Double?
    public let endTime: Double?
    public let speakerId: String?
    public let voiceSimilarityScore: Double?

    private enum CodingKeys: String, CodingKey {
        case text, startMs, endMs, startTime, endTime, speakerId, voiceSimilarityScore
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        text = try c.decode(String.self, forKey: .text)
        speakerId = try c.decodeIfPresent(String.self, forKey: .speakerId)
        voiceSimilarityScore = try c.decodeIfPresent(Double.self, forKey: .voiceSimilarityScore)
        if let ms = try c.decodeIfPresent(Double.self, forKey: .startMs) {
            startTime = ms / 1000.0
        } else {
            startTime = try c.decodeIfPresent(Double.self, forKey: .startTime)
        }
        if let ms = try c.decodeIfPresent(Double.self, forKey: .endMs) {
            endTime = ms / 1000.0
        } else {
            endTime = try c.decodeIfPresent(Double.self, forKey: .endTime)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(text, forKey: .text)
        try c.encodeIfPresent(startTime, forKey: .startTime)
        try c.encodeIfPresent(endTime, forKey: .endTime)
        try c.encodeIfPresent(speakerId, forKey: .speakerId)
        try c.encodeIfPresent(voiceSimilarityScore, forKey: .voiceSimilarityScore)
    }
}

public struct TranscriptionData: Codable, Sendable {
    public let id: String?
    public let text: String
    public let language: String
    public let confidence: Double?
    public let durationMs: Int?
    public let segments: [TranscriptionSegment]?
    public let speakerCount: Int?
}

public struct TranscriptionReadyEvent: Codable, Sendable {
    public let messageId: String
    public let attachmentId: String
    public let conversationId: String
    public let transcription: TranscriptionData
    public let processingTimeMs: Int?
}

// MARK: - Audio Translation Event Data

public struct TranslatedAudioInfo: Codable, Sendable {
    public let id: String
    public let targetLanguage: String
    public let url: String
    public let transcription: String
    public let durationMs: Int
    public let format: String
    public let cloned: Bool
    public let quality: Double
    public let voiceModelId: String?
    public let ttsModel: String
    public let segments: [TranscriptionSegment]?
}

public struct AudioTranslationEvent: Codable, Sendable {
    public let messageId: String
    public let attachmentId: String
    public let conversationId: String
    public let language: String
    public let translatedAudio: TranslatedAudioInfo
    public let processingTimeMs: Int?
}

// MARK: - Translation / Audio / Transcription Failure Events

public struct TranslationFailedEvent: Codable, Sendable {
    public let messageId: String
    public let conversationId: String
    public let error: String
    public let taskId: String?
}

public struct AudioTranslationFailedEvent: Codable, Sendable {
    public let messageId: String
    public let attachmentId: String
    public let conversationId: String
    public let error: String
    public let errorCode: String?
    public let taskId: String?
}

public struct TranscriptionFailedEvent: Codable, Sendable {
    public let messageId: String
    public let attachmentId: String
    public let conversationId: String
    public let error: String
    public let errorCode: String?
    public let taskId: String?
}

public struct ReadStatusSummary: Decodable, Sendable {
    public let totalMembers: Int
    public let deliveredCount: Int
    public let readCount: Int
}

public struct ReadStatusUpdateEvent: Decodable, Sendable {
    public let conversationId: String
    public let participantId: String
    /// `User.id` of the actor, or `nil` when the actor is an ANONYMOUS
    /// participant — they have no `User` row, so `participantId` is their only
    /// identity. Expected on the automatic delivery receipt of a share-link
    /// conversation, where anonymous participants are the dominant population.
    /// Consumers comparing this against the current user (multi-device read
    /// cursor sync) need no change: `nil` matches nobody, which is correct.
    public let userId: String?
    public let type: String
    public let updatedAt: Date
    public let summary: ReadStatusSummary
    /// Read frontier of the ACTOR at broadcast time. Lets the actor's OTHER
    /// devices sync their own read cursor (multi-device read sync). `nil` from
    /// a pre-rollout gateway or when the actor has no cursor yet. A recipient
    /// who is not the actor MUST ignore it. Read receipts are monotone, so a
    /// client applies it only when strictly newer than its local cursor.
    ///
    /// The actor is `userId ?? participantId`, in that order. `userId` alone is
    /// `nil` for a share-link guest, whose devices could then never recognise
    /// themselves; `participantId` is non-nil for the whole population and
    /// shared by every device of one identity. Same rule that names the
    /// personal room. This client has no accountless session, so it matches on
    /// `userId` only — the second branch stays unused here, and
    /// `ConversationStoreSocketBridge` is correct as written.
    ///
    /// **Delivered ONLY in the copy addressed to the actor.** This field and
    /// `unreadCount` describe a person, not the conversation — how far behind
    /// they are on this thread, and when they last caught up. The gateway
    /// therefore emits a `read` TWICE: one copy without them to the
    /// conversation fan-out, one complete copy to the actor's personal room
    /// (`user:<userId ?? participantId>`), which the fan-out excludes so no
    /// socket receives both. Nothing changes for this client: a device of the
    /// actor still joins that room at authentication and still receives the
    /// pair. A device that is NOT the actor now simply never sees the values
    /// its `event.userId == me` gate was already discarding.
    public let lastReadAt: Date?
    /// Server-authoritative unread count for the ACTOR after the action.
    /// Same `userId ?? participantId` scoping as `lastReadAt`, and the same
    /// addressing scope: the actor's copy, never the fan-out. `nil` from a
    /// pre-rollout gateway.
    public let unreadCount: Int?

    public init(
        conversationId: String,
        participantId: String,
        userId: String?,
        type: String,
        updatedAt: Date,
        summary: ReadStatusSummary,
        lastReadAt: Date? = nil,
        unreadCount: Int? = nil
    ) {
        self.conversationId = conversationId
        self.participantId = participantId
        self.userId = userId
        self.type = type
        self.updatedAt = updatedAt
        self.summary = summary
        self.lastReadAt = lastReadAt
        self.unreadCount = unreadCount
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

/// Tri-état du Prisme Linguistique de la ligne de liste, porté par
/// `conversation:updated`.
///
/// `Optional` ne suffit pas : il confond « la clé était ABSENTE du payload »
/// (une mise à jour de métadonnées — renommage, avatar — qui ne parle pas du
/// dernier message) et « la clé valait `null` » (le serveur DIT que la carte
/// est périmée). Les deux demandent des actions opposées.
///
/// C'est exactement ce qu'une ÉDITION produit : le gateway remet
/// `Message.translations` à null dans la même écriture que le nouveau contenu,
/// tout en gardant le MÊME `lastMessageId`. Aucune heuristique client ne peut
/// trancher ce cas — « vider quand l'id change » le laisse passer, et vider
/// inconditionnellement effacerait la carte que `message:new` vient
/// d'installer sur le chemin d'envoi. Seul ce `null` REÇU le peut.
public enum LastMessagePreviewTranslations: Sendable, Hashable {
    /// Clé absente : la carte du cache n'est pas concernée par cet événement.
    case unchanged
    /// Clé présente : la carte du cache est REMPLACÉE par celle-ci — vide
    /// comprise, et c'est tout l'intérêt.
    case replaced([String: String])
}

/// Tri-état de l'IDENTITÉ du dernier message de la ligne de liste, portée par
/// `conversation:updated`.
///
/// Même raison d'être que `LastMessagePreviewTranslations`, appliquée au champ
/// qui NOMME le message : `Optional` confond « la clé était ABSENTE » (un
/// renommage, un changement d'avatar — cet événement ne parle pas du dernier
/// message) et « la clé valait `null` » (le serveur DIT que ce lecteur n'a plus
/// AUCUN message visible ici).
///
/// Le second cas n'est pas théorique : un lecteur qui masque pour lui-même —
/// suppression pour soi, purge d'historique — le dernier message qui lui restait
/// vide sa propre vue sans rien changer pour les autres.
/// `emitConversationPreviewUpdate` lui sert alors un payload dont TOUT le groupe
/// d'aperçu vaut `null`. Lu à travers des `Optional`, ce payload ne dit rien du
/// tout : chaque `if let` le jette, et la ligne de liste continue d'afficher
/// l'aperçu de ce que le lecteur vient de masquer — définitivement, puisque plus
/// rien ne bougera dans cette conversation.
public enum LastMessageIdentity: Sendable, Hashable {
    /// Clé absente : cet événement ne parle pas du dernier message.
    case unchanged
    /// Clé présente. `nil` = plus AUCUN message visible pour ce lecteur.
    case replaced(String?)
}

public struct ConversationUpdatedEvent: Decodable, Sendable {
    public let conversationId: String
    public let title: String?
    public let description: String?
    public let avatar: String?
    public let banner: String?
    public let defaultWriteRole: String?
    public let isAnnouncementChannel: Bool?
    public let slowModeSeconds: Int?
    public let autoTranslateEnabled: Bool?
    /// New as of the conversation-list bump-to-top work: the gateway emits
    /// this on every message broadcast (handlers/MessageHandler.ts) so the
    /// client can re-sort the conversation list in real time without a
    /// delta sync round-trip. Optional for retro-compatibility with
    /// pre-existing CONVERSATION_UPDATED payloads (rename, avatar change,
    /// etc.) that don't advance lastMessageAt.
    public let lastMessageAt: Date?
    /// Le message que cette ligne de liste doit désormais désigner. Tri-état —
    /// voir `LastMessageIdentity` : `.unchanged` (clé absente) et
    /// `.replaced(nil)` (« plus aucun message visible ici ») demandent des
    /// actions opposées, et `String?` les confondait.
    ///
    /// Renseigné par le chemin message-driven (`MessageHandler.ts`) pour que le
    /// client mette à jour l'aperçu sans requête séparée, et par
    /// `emitConversationPreviewUpdate` sur les recalculs.
    public let lastMessage: LastMessageIdentity
    public let lastMessagePreview: String?
    /// Prisme de la ligne de liste, résolu par le gateway POUR CE destinataire.
    /// Sans lui, une édition laissait la ligne afficher le texte D'AVANT : le
    /// résolveur PRÉFÈRE la traduction hydratée par `GET /conversations` à
    /// `lastMessagePreview`, et rien sur le fil ne disait qu'elle était périmée.
    public let lastMessageTranslations: LastMessagePreviewTranslations
    public let lastMessageOriginalLanguage: String?
    /// Position du dernier message, hissée par le chemin message-driven
    /// (`MessageHandler.ts`) et par `emitConversationPreviewUpdate`. Un message
    /// position-seule a un `lastMessagePreview` vide — c'est ce champ qui
    /// permet à la ligne d'aperçu de composer son libellé.
    public let location: SharedPlace?
    public let senderId: String?
    /// Optional because the gateway's message-driven CONVERSATION_UPDATED
    /// payload (handlers/MessageHandler.ts on every new message) only
    /// carries `{ conversationId, lastMessageAt, lastMessageId,
    /// lastMessagePreview, senderId, updatedAt }` — no `updatedBy`. Decoding
    /// it as required would silently fail with `keyNotFound` on every
    /// inbound message, which is the entire signal that drives bumpToTop.
    /// Metadata-driven updates (rename, avatar change, etc.) keep emitting
    /// `updatedBy` and continue to populate this field.
    public let updatedBy: SocketEventUser?
    public let updatedAt: String
    /// `true` quand le serveur a RECALCULÉ l'aperçu depuis l'état courant de sa
    /// base, par opposition à une poussée du message qu'on vient d'écrire.
    ///
    /// C'est la seule chose qui autorise le groupe d'aperçu à RECULER dans le
    /// temps. `ConversationStore.merging` tient ce groupe pour monotone — un
    /// `lastMessageAt` plus ancien y désigne un message périmé — parce que du
    /// seul contenu, une diffusion arrivée dans le désordre et un recalcul
    /// autoritatif sont indiscernables : les deux reculent, les deux nomment un
    /// autre message. Supprimer le dernier message pour tous, ou masquer son
    /// propre dernier message visible, produit pourtant un aperçu légitimement
    /// PLUS ANCIEN.
    ///
    /// Absent des payloads message-driven, et absent de tout gateway antérieur
    /// à ce champ : `false` par défaut conserve alors exactement l'ancienne
    /// règle.
    public let previewRecalculated: Bool

    private enum CodingKeys: String, CodingKey {
        case conversationId, title, description, avatar, banner
        case defaultWriteRole, isAnnouncementChannel, slowModeSeconds, autoTranslateEnabled
        case lastMessageAt, lastMessageId, lastMessagePreview, senderId, updatedBy, updatedAt
        case location
        case lastMessageTranslations, lastMessageOriginalLanguage
        case previewRecalculated
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        conversationId = try container.decode(String.self, forKey: .conversationId)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        avatar = try container.decodeIfPresent(String.self, forKey: .avatar)
        banner = try container.decodeIfPresent(String.self, forKey: .banner)
        defaultWriteRole = try container.decodeIfPresent(String.self, forKey: .defaultWriteRole)
        isAnnouncementChannel = try container.decodeIfPresent(Bool.self, forKey: .isAnnouncementChannel)
        slowModeSeconds = try container.decodeIfPresent(Int.self, forKey: .slowModeSeconds)
        autoTranslateEnabled = try container.decodeIfPresent(Bool.self, forKey: .autoTranslateEnabled)
        lastMessageAt = try container.decodeIfPresent(Date.self, forKey: .lastMessageAt)
        // `contains`, comme pour la carte du Prisme juste en dessous et pour la
        // même raison : c'est la PRÉSENCE de la clé qui sépare « cet événement
        // ne parle pas du dernier message » de « il n'y en a plus aucun ».
        if container.contains(.lastMessageId) {
            lastMessage = .replaced(try container.decodeIfPresent(String.self, forKey: .lastMessageId))
        } else {
            lastMessage = .unchanged
        }
        lastMessagePreview = try container.decodeIfPresent(String.self, forKey: .lastMessagePreview)
        // `contains` et non `decodeIfPresent` : c'est la PRÉSENCE de la clé qui
        // distingue « cet événement ne parle pas d'aperçu » de « la carte est
        // périmée ». `decodeIfPresent` rend `nil` dans les deux cas et perdrait
        // précisément le signal que le serveur envoie.
        if container.contains(.lastMessageTranslations) {
            let map = try container.decodeIfPresent([String: String].self, forKey: .lastMessageTranslations)
            lastMessageTranslations = .replaced(map ?? [:])
        } else {
            lastMessageTranslations = .unchanged
        }
        lastMessageOriginalLanguage = try container.decodeIfPresent(String.self, forKey: .lastMessageOriginalLanguage)
        location = try container.decodeIfPresent(SharedPlace.self, forKey: .location)
        senderId = try container.decodeIfPresent(String.self, forKey: .senderId)
        updatedBy = try container.decodeIfPresent(SocketEventUser.self, forKey: .updatedBy)
        updatedAt = try container.decode(String.self, forKey: .updatedAt)
        previewRecalculated = try container.decodeIfPresent(Bool.self, forKey: .previewRecalculated) ?? false
    }

    public init(
        conversationId: String,
        title: String? = nil,
        description: String? = nil,
        avatar: String? = nil,
        banner: String? = nil,
        defaultWriteRole: String? = nil,
        isAnnouncementChannel: Bool? = nil,
        slowModeSeconds: Int? = nil,
        autoTranslateEnabled: Bool? = nil,
        lastMessageAt: Date? = nil,
        lastMessage: LastMessageIdentity = .unchanged,
        lastMessagePreview: String? = nil,
        lastMessageTranslations: LastMessagePreviewTranslations = .unchanged,
        lastMessageOriginalLanguage: String? = nil,
        location: SharedPlace? = nil,
        senderId: String? = nil,
        updatedBy: SocketEventUser? = nil,
        updatedAt: String,
        previewRecalculated: Bool = false
    ) {
        self.conversationId = conversationId
        self.title = title
        self.description = description
        self.avatar = avatar
        self.banner = banner
        self.defaultWriteRole = defaultWriteRole
        self.isAnnouncementChannel = isAnnouncementChannel
        self.slowModeSeconds = slowModeSeconds
        self.autoTranslateEnabled = autoTranslateEnabled
        self.lastMessageAt = lastMessageAt
        self.lastMessage = lastMessage
        self.lastMessagePreview = lastMessagePreview
        self.lastMessageTranslations = lastMessageTranslations
        self.lastMessageOriginalLanguage = lastMessageOriginalLanguage
        self.location = location
        self.senderId = senderId
        self.updatedBy = updatedBy
        self.updatedAt = updatedAt
        self.previewRecalculated = previewRecalculated
    }

    /// L'id porté, `nil` quand la clé était absente OU nulle.
    ///
    /// Réservé aux appelants pour qui les deux se valent — typiquement la
    /// construction d'une facette décrivant un message NEUF, chemin qu'un
    /// vidage n'atteint jamais (il n'avance aucun horodatage). Partout où le
    /// vidage compte, c'est `lastMessage` qu'il faut lire.
    public var lastMessageIdValue: String? {
        guard case .replaced(let id) = lastMessage else { return nil }
        return id
    }
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

public struct MessageConsumedEvent: Decodable, Sendable {
    public let messageId: String
    public let conversationId: String
    public let userId: String
    public let viewOnceCount: Int
    public let maxViewOnceCount: Int
    public let isFullyConsumed: Bool
}

// MARK: - Call Signaling Event Data

public struct SocketIceServer: Decodable, Sendable {
    public let urls: IceServerURLs
    public let username: String?
    public let credential: String?

    public enum IceServerURLs: Decodable, Sendable {
        case single(String)
        case multiple([String])

        public init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let str = try? container.decode(String.self) {
                self = .single(str)
            } else {
                self = .multiple(try container.decode([String].self))
            }
        }

        public var asArray: [String] {
            switch self {
            case .single(let url): return [url]
            case .multiple(let urls): return urls
            }
        }
    }
}

public struct CallIceServersRefreshedData: Decodable, Sendable {
    public let callId: String
    public let iceServers: [SocketIceServer]
    public let ttl: Int
}

public struct CallOfferData: Decodable, Sendable {
    public let callId: String
    public let conversationId: String
    /// Architecture mode (`"p2p"` or `"sfu"`). NOT the media type — see `type`.
    public let mode: String?
    /// Media type (`"audio"` or `"video"`). Drives CallKit `hasVideo`.
    /// Optional for backwards compatibility with older gateway builds that
    /// did not include this field; absence is treated as audio call.
    public let type: String?
    public let initiator: CallInitiatorInfo
    public let iceServers: [SocketIceServer]?
    /// Audit P1-26 — initial participant list emitted by the gateway in
    /// `call:initiated`. Optional for backwards compat with older builds.
    /// Lets the iOS UI show all participants during the ringing phase
    /// rather than waiting for `call:participant-joined` events.
    public let participants: [CallParticipantInfo]?

    public struct CallInitiatorInfo: Decodable, Sendable {
        public let userId: String
        public let username: String
        public let displayName: String?
        public let avatar: String?
    }

    public struct CallParticipantInfo: Decodable, Sendable {
        public let id: String
        public let userId: String?
        public let role: String?
        public let isAudioEnabled: Bool?
        public let isVideoEnabled: Bool?
        public let username: String?
        public let displayName: String?
        public let avatar: String?
    }
}

public struct CallAnswerData: Decodable, Sendable {
    public let callId: String
    public let signal: CallSignalPayload
}

public struct CallSignalPayload: Decodable, Sendable {
    public let type: String
    public let sdp: String?
    public let candidate: String?
    public let sdpMLineIndex: Int?
    public let sdpMid: String?
    public let from: String?
    public let to: String?
    /// §3.5 — negotiation epoch. Monotonic per peer; the receiver drops any
    /// SDP/ICE whose generation is older than the highest already seen, so
    /// offers/candidates from a churned socket become inert. Optional for
    /// backward compatibility (absent ⇒ generation 0).
    public let negotiationId: Int?
}

public struct CallICECandidateData: Decodable, Sendable {
    public let callId: String
    public let signal: CallSignalPayload
}

public struct CallEndData: Decodable, Sendable {
    public let callId: String
    public let duration: Int?
    public let endedBy: String?
    /// Audit P1-24 — gateway emits `reason: CallEndReason` (`"missed"`,
    /// `"rejected"`, `"completed"`, `"connectionLost"`, `"failed"`,
    /// `"declined"`, `"answeredElsewhere"`). Without surfacing it on iOS,
    /// every remote-end was indistinguishable and CallKit reported every
    /// case as `.remoteEnded` — wrong for missed/declined/answeredElsewhere
    /// (Recents UX) and for analytics.
    public let reason: String?
}

/// Audit P1-25 — `call:missed` event payload. Gateway emits this on
/// ringing-timeout to the callee's user-room sockets (in addition to
/// `call:ended`). The dedicated event lets the iOS UI raise a missed-call
/// banner without inferring it from `endedBy != self`.
public struct CallMissedData: Decodable, Sendable {
    public let callId: String
    public let conversationId: String
    public let callerId: String
    public let callerName: String?
}

/// Audit P1-27 — `call:already-answered` event payload. Emitted by the
/// gateway to the joining user's OTHER sockets when one of their devices
/// answers a call, so the rest can dismiss CallKit + ringing UI.
public struct CallAlreadyAnsweredData: Decodable, Sendable {
    public let callId: String
}

public struct CallParticipantData: Decodable, Sendable {
    public let callId: String
    public let participantId: String?
    public let userId: String?
    public let mode: String?
    public let iceServers: [SocketIceServer]?
}

public struct CallMediaToggleData: Decodable, Sendable {
    public let callId: String
    public let participantId: String?
    public let mediaType: String
    public let enabled: Bool
}

public struct CallErrorData: Decodable, Sendable {
    public let code: String?
    public let message: String?
    /// The call this error pertains to, when the gateway knows it. Consumers with
    /// an active call MUST ignore any error whose `callId` is present and does not
    /// match their current call — errors for a different call must never affect a
    /// healthy, unrelated one. Absent for errors that occur before a call context
    /// exists (e.g. auth failures) or from emit sites not yet call-scoped server-side.
    public let callId: String?
}

public struct CallQualityAlertData: Decodable, Sendable {
    public let callId: String
    public let participantId: String
    public let metric: String
    public let value: Double
    public let threshold: Double
}

/// Received when the remote peer starts or stops screen-capturing the call.
/// The gateway relays `call:screen-capture-alert` to the OTHER participant
/// only (socket.to(room)) — every event we receive reflects the remote peer.
public struct CallScreenCaptureAlertData: Decodable, Sendable {
    public let callId: String
    public let participantId: String
    public let isCapturing: Bool
}

/// Received when the gateway force-removes the current user from an active call.
/// The gateway emits `call:force-leave` to the user's personal room so every
/// device they have connected receives the event and tears down the call.
public struct CallForcedLeaveData: Decodable, Sendable {
    public let callId: String
    public let reason: String?
}

public struct CallTranscriptionSegmentPayload: Sendable {
    /// Stable journal id (UUID minted at capture) — the cross-transport merge
    /// key: the same segment can reach a peer over the WebRTC data channel
    /// AND the server relay; receivers dedup/enrich by this id.
    public let id: String
    public let text: String
    public let speakerId: String
    public let startMs: Int
    public let endMs: Int
    public let isFinal: Bool
    public let confidence: Double
    /// Automatic tag of the language this segment was transcribed in — feeds
    /// the journal badge today and the live-translate + TTS pipeline next.
    public let language: String
    /// Wall-clock capture time (epoch ms) — the journal ordering key,
    /// rendered as `displayName (heure): message` on every side.
    public let capturedAtMs: Int

    public init(
        id: String, text: String, speakerId: String, startMs: Int, endMs: Int,
        isFinal: Bool, confidence: Double, language: String, capturedAtMs: Int
    ) {
        self.id = id
        self.text = text
        self.speakerId = speakerId
        self.startMs = startMs
        self.endMs = endMs
        self.isFinal = isFinal
        self.confidence = confidence
        self.language = language
        self.capturedAtMs = capturedAtMs
    }
}

/// Event: call:translated-segment (Server → Client). Mirrors
/// `CallTranslatedSegmentEvent` in `packages/shared/types/video-call.ts`.
/// `translatedText` is omitted when ZMQ translation is disabled/unavailable —
/// consumers fall back to displaying `text`.
public struct CallTranslatedSegmentData: Decodable, Sendable {
    public let callId: String
    public let segment: Segment

    public struct Segment: Decodable, Sendable {
        /// Cross-transport merge key (absent from legacy gateways/peers).
        public let id: String?
        public let text: String
        public let translatedText: String?
        public let speakerId: String
        /// Server-stamped display name of the speaker (anti-spoof: resolved
        /// by the gateway from the authenticated participant, same principle
        /// as `speakerId`). Receivers still prefer their local roster name.
        public let speakerDisplayName: String?
        public let startMs: Int
        public let endMs: Int
        public let isFinal: Bool
        public let sourceLanguage: String
        public let targetLanguage: String
        public let confidence: Double
        /// Wall-clock capture time (epoch ms) — journal ordering key.
        public let capturedAtMs: Int?
    }
}

/// Event: call:transcription-active (Server -> Client). Mirrors
/// `CallTranscriptionActiveBroadcast` in `packages/shared/types/video-call.ts`.
/// `speakerId` est estampillé côté gateway (anti-usurpation). Signal de
/// présence : jamais gâté par la visibilité du panneau du récepteur — c'est
/// l'invitation à l'ouvrir.
public struct CallTranscriptionActiveData: Decodable, Sendable {
    public let callId: String
    public let speakerId: String
    public let active: Bool
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

// MARK: - Notification Socket Event Data

public struct SocketNotificationEvent: Decodable, Sendable {
    public let id: String
    public let userId: String
    public let type: String
    public let title: String?
    public let content: String
    public let priority: String?
    public let isRead: Bool?

    // Gateway sends nested objects — decoded into typed structs
    public let actor: SocketNotificationActor?
    public let context: SocketNotificationContext?
    public let metadata: SocketNotificationMetadata?

    /// SyncEngine A5 — numéro de séquence monotone per-user tamponné par le
    /// gateway (`emitWithSeq`, A2.1) sous la clé JSON `_seq`. `nil` sur un
    /// gateway antérieur (backward-compat). Consommé par `SyncSeqState` pour
    /// la détection de gap EXACTE au reconnect.
    public let seq: Int64?

    private enum CodingKeys: String, CodingKey {
        case id, userId, type, title, content, priority, isRead
        case actor, context, metadata
        case seq = "_seq"
    }

    // Computed accessors: resolve from nested structs (gateway format)
    public var senderUsername: String? { actor?.username }
    public var senderDisplayName: String? { actor?.displayName }
    public var senderAvatar: String? { actor?.avatar }
    public var senderId: String? { actor?.id }
    public var conversationId: String? { context?.conversationId }
    public var messageId: String? { context?.messageId }
    public var postId: String? { context?.postId ?? metadata?.postId }
    public var commentId: String? { context?.commentId ?? metadata?.commentId }
    public var parentCommentId: String? { context?.parentCommentId ?? metadata?.parentCommentId }
    /// Discriminant d'entité : `postType` fait autorité, `contentType` sert de
    /// repli (famille `friend_new_*`). Le NOM du type de notification n'est
    /// JAMAIS un discriminant — `story_thread_reply` est émis pour n'importe
    /// quel contenu commenté, réel inclus.
    public var postType: String? {
        let explicit = metadata?.postType
        return explicit?.isEmpty == false ? explicit : metadata?.contentType
    }
    public var messagePreview: String? { metadata?.commentPreview }
    public var conversationTitle: String? { context?.conversationTitle }
    public var conversationAvatar: String? { context?.conversationAvatar }
    public var conversationType: String? { context?.conversationType }
    public var isDirect: Bool { context?.conversationType == "direct" }
    public var attachments: SocketNotificationAttachments? { metadata?.attachments }

    public var attachmentLabel: String? {
        guard let att = metadata?.attachments, let count = att.count, count > 0 else { return nil }
        if count > 1 { return "\u{1F4CE} \(count) fichiers" }
        switch att.firstType {
        case "image": return "\u{1F4F7} Photo"
        case "video": return "\u{1F3AC} Vid\u{00E9}o"
        case "audio": return "\u{1F3B5} Audio"
        case "document": return "\u{1F4C4} Document"
        default: return "\u{1F4CE} Fichier"
        }
    }

    public var notificationType: MeeshyNotificationType {
        MeeshyNotificationType(rawValue: type) ?? .system
    }
}

public struct SocketNotificationActor: Decodable, Sendable {
    public let id: String?
    public let username: String?
    public let displayName: String?
    public let avatar: String?
}

public struct SocketNotificationContext: Decodable, Sendable {
    public let conversationId: String?
    public let conversationTitle: String?
    /// Avatar (image URL) of the conversation/group. Used by the in-app toast
    /// as a fallback when the sender has no personal avatar (group messages).
    public let conversationAvatar: String?
    public let conversationType: String?
    public let messageId: String?
    public let postId: String?
    public let commentId: String?
    public let parentCommentId: String?
    public let friendRequestId: String?
}

public struct SocketNotificationMetadata: Decodable, Sendable {
    public let postId: String?
    public let commentId: String?
    public let parentCommentId: String?
    public let postType: String?
    /// Discriminant d'entité de la famille `friend_new_*`, que la gateway a
    /// historiquement émis SOUS CE NOM au lieu de `postType`. Lu en repli pour
    /// que le nouveau réel d'un ami n'atterrisse pas sur le détail de post plat.
    public let contentType: String?
    public let commentPreview: String?
    public let emoji: String?
    public let attachments: SocketNotificationAttachments?
}

public struct SocketNotificationAttachments: Decodable, Sendable {
    public let count: Int?
    public let firstType: String?
    public let firstFilename: String?
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

// MARK: - Connection State

public enum ConnectionState: Equatable, Sendable {
    case connected
    case connecting
    case reconnecting(attempt: Int)
    case disconnected
}

// MARK: - Protocol

public protocol MessageSocketProviding: Sendable {
    func emitCallJoinWithAck(callId: String) async -> Bool
    var callScreenCaptureAlert: PassthroughSubject<CallScreenCaptureAlertData, Never> { get }
    /// Fired when the gateway force-removes the current user from the call.
    /// The client must tear down the call immediately (no user confirmation needed).
    var callForcedLeave: PassthroughSubject<CallForcedLeaveData, Never> { get }
    var callTranslatedSegmentReceived: PassthroughSubject<CallTranslatedSegmentData, Never> { get }
    /// Signal de présence transcription : un pair a activé/fermé son panneau
    /// (`call:transcription-active`, estampillé côté gateway) — pilote
    /// l'indicateur d'invitation sur l'icône captions.
    var callTranscriptionActiveReceived: PassthroughSubject<CallTranscriptionActiveData, Never> { get }
    var messageReceived: PassthroughSubject<APIMessage, Never> { get }
    var messageEdited: PassthroughSubject<APIMessage, Never> { get }
    var messageDeleted: PassthroughSubject<MessageDeletedEvent, Never> { get }
    /// `message:hidden-for-me` — le canal de visibilité PERSONNELLE. Dans le
    /// protocole parce que le consommateur (`ConversationSocketHandler`) ne
    /// détient qu'un `MessageSocketProviding`.
    var messageHiddenForMe: PassthroughSubject<MessageHiddenForMeEvent, Never> { get }
    /// `message:restored-for-me` — le canal jumeau, en sens inverse. Dans le
    /// protocole pour la même raison que son jumeau : le consommateur
    /// (`ConversationSocketHandler`) ne détient qu'un `MessageSocketProviding`.
    var messageRestoredForMe: PassthroughSubject<MessageRestoredForMeEvent, Never> { get }
    var messagePinned: PassthroughSubject<MessagePinnedEvent, Never> { get }
    var messageUnpinned: PassthroughSubject<MessageUnpinnedEvent, Never> { get }
    var reactionAdded: PassthroughSubject<ReactionUpdateEvent, Never> { get }
    var reactionRemoved: PassthroughSubject<ReactionUpdateEvent, Never> { get }
    var attachmentReactionAdded: PassthroughSubject<AttachmentReactionUpdateEvent, Never> { get }
    var attachmentReactionRemoved: PassthroughSubject<AttachmentReactionUpdateEvent, Never> { get }
    var typingStarted: PassthroughSubject<TypingEvent, Never> { get }
    var typingStopped: PassthroughSubject<TypingEvent, Never> { get }
    var unreadUpdated: PassthroughSubject<UnreadUpdateEvent, Never> { get }
    var userStatusChanged: PassthroughSubject<UserStatusEvent, Never> { get }
    /// Bulk snapshot émis par le gateway après l'auth socket. Le client doit ingérer
    /// chaque entrée comme un `user:status` individuel pour seed son store de présence
    /// sans attendre une transition d'état spontanée.
    var presenceSnapshotReceived: PassthroughSubject<PresenceSnapshotEvent, Never> { get }
    var readStatusUpdated: PassthroughSubject<ReadStatusUpdateEvent, Never> { get }
    var attachmentStatusUpdated: PassthroughSubject<AttachmentStatusUpdatedEvent, Never> { get }
    /// `message:attachment-updated` — delta émis par le gateway après un
    /// enrichissement async (transcription Whisper, traduction audio NLLB+TTS).
    /// Le subscriber remplace l'attachment dans son store atomiquement.
    var attachmentUpdated: PassthroughSubject<AttachmentUpdatedEvent, Never> { get }
    var conversationJoined: PassthroughSubject<ConversationParticipationEvent, Never> { get }
    var conversationJoinError: PassthroughSubject<ConversationJoinErrorEvent, Never> { get }
    var conversationLeft: PassthroughSubject<ConversationParticipationEvent, Never> { get }
    var participantRoleUpdated: PassthroughSubject<ParticipantRoleUpdatedEvent, Never> { get }
    var participantRightsUpdated: PassthroughSubject<ParticipantRightsUpdatedEvent, Never> { get }
    var conversationUpdated: PassthroughSubject<ConversationUpdatedEvent, Never> { get }
    /// `user:updated` — profil public d'un CONTACT. Dans le protocole parce que
    /// `ConversationSyncEngine` ne détient qu'un `MessageSocketProviding`.
    var userUpdated: PassthroughSubject<UserUpdatedEvent, Never> { get }
    /// `conversation:participant-joined` — l'adhésion d'un tiers, distincte de
    /// `conversationJoined` (ack de room, cf. `ParticipantJoinedEvent`).
    var participantJoined: PassthroughSubject<ParticipantJoinedEvent, Never> { get }
    var participantSelfLeft: PassthroughSubject<ParticipantLeftEvent, Never> { get }
    var participantBanned: PassthroughSubject<ParticipantBannedEvent, Never> { get }
    var participantUnbanned: PassthroughSubject<ParticipantUnbannedEvent, Never> { get }
    var conversationClosed: PassthroughSubject<ConversationClosedEvent, Never> { get }
    /// `conversation:deleted` — the conversation is gone server-side. Exposed on
    /// the protocol (not just the concrete manager) so the disk-cache writer can
    /// subscribe: routed only to the in-memory `ConversationStore`, a deletion
    /// received while offline came back from the dead on the next cold start.
    var conversationDeleted: PassthroughSubject<ConversationDeletedSocketEvent, Never> { get }
    var userPreferencesUpdated: PassthroughSubject<UserPreferencesUpdatedEvent, Never> { get }
    /// Conversation-scope variant of `user:preferences-updated` (versioned).
    /// Routed separately from `userPreferencesUpdated` (category scope) so the
    /// `ConversationStore` bridge can apply it with version semantics.
    var userPreferencesConversationUpdated: PassthroughSubject<UserPreferencesConversationUpdatedSocketEvent, Never> { get }
    var conversationStatsReceived: PassthroughSubject<ConversationStatsEvent, Never> { get }
    var messageConsumed: PassthroughSubject<MessageConsumedEvent, Never> { get }
    var liveLocationStarted: PassthroughSubject<LiveLocationStartedEvent, Never> { get }
    var liveLocationUpdated: PassthroughSubject<LiveLocationUpdatedEvent, Never> { get }
    var liveLocationStopped: PassthroughSubject<LiveLocationStoppedEvent, Never> { get }
    var translationReceived: PassthroughSubject<TranslationEvent, Never> { get }
    var transcriptionReady: PassthroughSubject<TranscriptionReadyEvent, Never> { get }
    var audioTranslationReady: PassthroughSubject<AudioTranslationEvent, Never> { get }
    var audioTranslationProgressive: PassthroughSubject<AudioTranslationEvent, Never> { get }
    var audioTranslationCompleted: PassthroughSubject<AudioTranslationEvent, Never> { get }
    var translationFailed: PassthroughSubject<TranslationFailedEvent, Never> { get }
    var audioTranslationFailed: PassthroughSubject<AudioTranslationFailedEvent, Never> { get }
    var transcriptionFailed: PassthroughSubject<TranscriptionFailedEvent, Never> { get }
    var didReconnect: PassthroughSubject<Void, Never> { get }
    /// Fires after each heartbeat round-trip with the measured RTT in milliseconds.
    /// Subscribers can use this to display connection quality indicators.
    var connectionRTT: PassthroughSubject<Double, Never> { get }
    var notificationReceived: PassthroughSubject<SocketNotificationEvent, Never> { get }
    /// Fired when the gateway emits SERVER_EVENTS.CONVERSATION_NEW (a fresh
    /// conversation was created — the user is now a participant). Replaces
    /// the previous overload of `notification:new` with type-string
    /// discrimination. Carries the canonical conversation id so the list
    /// view-model can fetch the enriched payload via getById and prepend
    /// the row in real time. The legacy `notification:new` event is still
    /// emitted in parallel by the gateway for ~3 months to support older
    /// clients during rollout.
    var conversationNew: PassthroughSubject<ConversationNewEvent, Never> { get }
    var notificationRead: PassthroughSubject<NotificationReadEvent, Never> { get }
    var notificationDeleted: PassthroughSubject<NotificationDeletedEvent, Never> { get }
    var notificationCounts: PassthroughSubject<NotificationCountsEvent, Never> { get }
    var callOfferReceived: PassthroughSubject<CallOfferData, Never> { get }
    var callSignalOfferReceived: PassthroughSubject<CallAnswerData, Never> { get }
    var callAnswerReceived: PassthroughSubject<CallAnswerData, Never> { get }
    var callICECandidateReceived: PassthroughSubject<CallICECandidateData, Never> { get }
    var callEnded: PassthroughSubject<CallEndData, Never> { get }
    /// Audit P1-25 — dedicated `call:missed` event publisher (in addition to
    /// `callEnded` which is emitted in parallel for backwards-compat).
    var callMissed: PassthroughSubject<CallMissedData, Never> { get }
    /// Audit P1-27 — `call:already-answered` publisher used by the user's
    /// other devices to dismiss their ringing UI when one device answers.
    var callAlreadyAnswered: PassthroughSubject<CallAlreadyAnsweredData, Never> { get }
    var callParticipantJoined: PassthroughSubject<CallParticipantData, Never> { get }
    var callParticipantLeft: PassthroughSubject<CallParticipantData, Never> { get }
    var callMediaToggled: PassthroughSubject<CallMediaToggleData, Never> { get }
    var callError: PassthroughSubject<CallErrorData, Never> { get }
    var callIceServersRefreshed: PassthroughSubject<CallIceServersRefreshedData, Never> { get }
    var callQualityAlert: PassthroughSubject<CallQualityAlertData, Never> { get }
    var reactionSynced: PassthroughSubject<ReactionSyncEvent, Never> { get }
    var mentionCreated: PassthroughSubject<MentionCreatedEvent, Never> { get }
    var isConnected: Bool { get }
    var connectionState: ConnectionState { get }
    var activeConversationId: String? { get set }
    func connect()
    func connectAnonymous(sessionToken: String)
    func disconnect()
    func joinConversation(_ conversationId: String)
    func leaveConversation(_ conversationId: String)
    func emitTypingStart(conversationId: String)
    func emitTypingStop(conversationId: String)
    func requestTranslation(messageId: String, targetLanguage: String)
    func emitLiveLocationStart(payload: LiveLocationStartPayload)
    func emitLiveLocationUpdate(payload: LiveLocationUpdatePayload)
    func emitLiveLocationStop(conversationId: String)
    func sendWithAttachments(conversationId: String, content: String?, attachmentIds: [String], replyToId: String?, storyReplyToId: String?, originalLanguage: String?, isEncrypted: Bool, clientMessageId: String?)
    /// `location` fait partie de l'exigence : une valeur par défaut sur
    /// l'implémentation concrète ne satisfait PAS une exigence de protocole en
    /// Swift. Le shim de compatibilité source (sans `location`) vit dans
    /// l'extension « Protocol Default-Arg Convenience » ci-dessous.
    func sendViaSocketFallback(conversationId: String, content: String?, attachmentIds: [String], replyToId: String?, storyReplyToId: String?, originalLanguage: String?, isEncrypted: Bool, clientMessageId: String, location: SharedPlace?) async -> MessageSocketManager.SendMessageAck?
    func emitCallInitiate(conversationId: String, isVideo: Bool) async throws -> MessageSocketManager.CallInitiateAck
    func emitCallJoin(callId: String)
    func emitCallLeave(callId: String)
    func emitAppForeground(_ foreground: Bool)
    func addAttachmentReaction(attachmentId: String, messageId: String, emoji: String)
    func removeAttachmentReaction(attachmentId: String, messageId: String, emoji: String)
    func emitCallSignal(callId: String, type: String, payload: [String: Any])
    func emitCallSignalWithAck(callId: String, type: String, payload: [String: Any]) async -> Bool
    func emitCallToggleAudio(callId: String, enabled: Bool)
    func emitCallToggleVideo(callId: String, enabled: Bool)
    func emitCallEnd(callId: String)
    func emitCallEndWithAck(callId: String) async -> Bool
    func emitCallHeartbeat(callId: String)
    func emitCallQualityReport(callId: String, level: String, rtt: Double, packetLoss: Double, bytesSent: Int, bytesReceived: Int)
    func emitCallReconnecting(callId: String, participantId: String, attempt: Int)
    func emitCallReconnected(callId: String, participantId: String)
    func emitRequestIceServers(callId: String)
    func emitCallBackgrounded(callId: String, participantId: String)
    func emitCallForegrounded(callId: String, participantId: String)
    func emitCallScreenCaptureDetected(callId: String, participantId: String, isCapturing: Bool)
    func emitCallAnalytics(callId: String, payload: [String: Any])
    func emitCallTranscriptionSegment(callId: String, segment: CallTranscriptionSegmentPayload)
    func emitCallTranscriptionActive(callId: String, active: Bool)
}

// MARK: - Protocol Default-Arg Convenience

/// Default-arg shims for source-compatibility with pre-Phase-4 call sites
/// that do not yet pass `clientMessageId`. Protocol requirements cannot have
/// default parameter values directly, so the convenience overload lives in
/// an extension. Phase 4 call sites SHOULD pass an explicit `clientMessageId`
/// so the optimistic row, the ACK echo, and the `message:new` broadcast can
/// be reconciled by the same end-to-end identifier.
public extension MessageSocketProviding {
    /// Default no-op so existing conformers (test mocks) need not implement the
    /// quality-report emit added for call data/quality persistence.
    func emitCallQualityReport(
        callId: String, level: String, rtt: Double, packetLoss: Double,
        bytesSent: Int, bytesReceived: Int
    ) {}

    /// Shim that adds BWE passthrough; mocks can keep the old signature.
    func emitCallQualityReport(
        callId: String, level: String, rtt: Double, packetLoss: Double,
        bytesSent: Int, bytesReceived: Int, availableOutgoingBitrateBps: Int
    ) {
        emitCallQualityReport(callId: callId, level: level, rtt: rtt, packetLoss: packetLoss,
                              bytesSent: bytesSent, bytesReceived: bytesReceived)
    }

    /// Shim that adds audio jitter passthrough; mocks can keep the old signatures.
    func emitCallQualityReport(
        callId: String, level: String, rtt: Double, packetLoss: Double,
        bytesSent: Int, bytesReceived: Int, availableOutgoingBitrateBps: Int, jitterMs: Double
    ) {
        emitCallQualityReport(callId: callId, level: level, rtt: rtt, packetLoss: packetLoss,
                              bytesSent: bytesSent, bytesReceived: bytesReceived,
                              availableOutgoingBitrateBps: availableOutgoingBitrateBps)
    }

    func emitCallReconnecting(callId: String, participantId: String, attempt: Int) {}
    func emitCallReconnected(callId: String, participantId: String) {}
    func emitCallJoinWithAck(callId: String) async -> Bool { false }
    func emitRequestIceServers(callId: String) {}
    func emitCallBackgrounded(callId: String, participantId: String) {}
    func emitCallForegrounded(callId: String, participantId: String) {}
    func emitCallScreenCaptureDetected(callId: String, participantId: String, isCapturing: Bool) {}
    func emitCallAnalytics(callId: String, payload: [String: Any]) {}
    func emitCallTranscriptionSegment(callId: String, segment: CallTranscriptionSegmentPayload) {}
    func emitCallTranscriptionActive(callId: String, active: Bool) {}

    func sendWithAttachments(
        conversationId: String,
        content: String?,
        attachmentIds: [String],
        replyToId: String?,
        storyReplyToId: String? = nil,
        originalLanguage: String? = nil,
        isEncrypted: Bool = false
    ) {
        sendWithAttachments(
            conversationId: conversationId,
            content: content,
            attachmentIds: attachmentIds,
            replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            originalLanguage: originalLanguage,
            isEncrypted: isEncrypted,
            clientMessageId: nil
        )
    }

    /// Shim de compatibilité source pour les appelants antérieurs au lieu
    /// partagé : même signature qu'avant l'ajout de `location` à l'exigence
    /// de protocole, délègue avec `location: nil`.
    func sendViaSocketFallback(
        conversationId: String,
        content: String?,
        attachmentIds: [String],
        replyToId: String?,
        storyReplyToId: String?,
        originalLanguage: String?,
        isEncrypted: Bool,
        clientMessageId: String
    ) async -> MessageSocketManager.SendMessageAck? {
        await sendViaSocketFallback(
            conversationId: conversationId,
            content: content,
            attachmentIds: attachmentIds,
            replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            originalLanguage: originalLanguage,
            isEncrypted: isEncrypted,
            clientMessageId: clientMessageId,
            location: nil
        )
    }
}

// MARK: - Message Socket Manager

public final class MessageSocketManager: ObservableObject, MessageSocketProviding, @unchecked Sendable {
    public static let shared = MessageSocketManager()

    // Combine publishers — messages
    public let messageReceived = PassthroughSubject<APIMessage, Never>()
    public let messageEdited = PassthroughSubject<APIMessage, Never>()
    public let messageDeleted = PassthroughSubject<MessageDeletedEvent, Never>()
    public let messageHiddenForMe = PassthroughSubject<MessageHiddenForMeEvent, Never>()
    public let messageRestoredForMe = PassthroughSubject<MessageRestoredForMeEvent, Never>()
    public let messagePinned = PassthroughSubject<MessagePinnedEvent, Never>()
    public let messageUnpinned = PassthroughSubject<MessageUnpinnedEvent, Never>()

    // Combine publishers — reactions
    public let reactionAdded = PassthroughSubject<ReactionUpdateEvent, Never>()
    public let reactionRemoved = PassthroughSubject<ReactionUpdateEvent, Never>()
    // BUG2 A' — réactions par-image
    public let attachmentReactionAdded = PassthroughSubject<AttachmentReactionUpdateEvent, Never>()
    public let attachmentReactionRemoved = PassthroughSubject<AttachmentReactionUpdateEvent, Never>()

    // Combine publishers — typing
    public let typingStarted = PassthroughSubject<TypingEvent, Never>()
    public let typingStopped = PassthroughSubject<TypingEvent, Never>()

    // Combine publishers — presence
    public let unreadUpdated = PassthroughSubject<UnreadUpdateEvent, Never>()
    public let userStatusChanged = PassthroughSubject<UserStatusEvent, Never>()
    public let presenceSnapshotReceived = PassthroughSubject<PresenceSnapshotEvent, Never>()

    // Combine publishers — read status
    public let readStatusUpdated = PassthroughSubject<ReadStatusUpdateEvent, Never>()

    // Combine publishers — attachment status
    public let attachmentStatusUpdated = PassthroughSubject<AttachmentStatusUpdatedEvent, Never>()
    public let attachmentUpdated = PassthroughSubject<AttachmentUpdatedEvent, Never>()

    // Combine publishers — conversation participation
    public let conversationJoined = PassthroughSubject<ConversationParticipationEvent, Never>()
    public let conversationJoinError = PassthroughSubject<ConversationJoinErrorEvent, Never>()
    public let conversationLeft = PassthroughSubject<ConversationParticipationEvent, Never>()

    // Combine publishers — participant role
    public let participantRoleUpdated = PassthroughSubject<ParticipantRoleUpdatedEvent, Never>()
    /// Un hôte a modifié les droits d'un visiteur sans compte. Distinct du
    /// rôle : ce que la personne a le droit de FAIRE change, pas son rang.
    public let participantRightsUpdated = PassthroughSubject<ParticipantRightsUpdatedEvent, Never>()

    // Combine publishers — conversation & participant lifecycle
    public let conversationUpdated = PassthroughSubject<ConversationUpdatedEvent, Never>()
    public let participantJoined = PassthroughSubject<ParticipantJoinedEvent, Never>()
    public let participantSelfLeft = PassthroughSubject<ParticipantLeftEvent, Never>()
    public let participantBanned = PassthroughSubject<ParticipantBannedEvent, Never>()
    public let participantUnbanned = PassthroughSubject<ParticipantUnbannedEvent, Never>()
    public let conversationClosed = PassthroughSubject<ConversationClosedEvent, Never>()

    // Combine publishers — user preferences
    public let userPreferencesUpdated = PassthroughSubject<UserPreferencesUpdatedEvent, Never>()
    public let userPreferencesConversationUpdated = PassthroughSubject<UserPreferencesConversationUpdatedSocketEvent, Never>()
    public let userPreferencesReordered = PassthroughSubject<UserPreferencesReorderedSocketEvent, Never>()
    public let conversationDeleted = PassthroughSubject<ConversationDeletedSocketEvent, Never>()

    // Combine publishers — profil public d'un CONTACT
    public let userUpdated = PassthroughSubject<UserUpdatedEvent, Never>()

    // Combine publishers — user conversation categories
    public let categoryCreated = PassthroughSubject<CategorySocketEvent, Never>()
    public let categoryUpdated = PassthroughSubject<CategorySocketEvent, Never>()
    public let categoryDeleted = PassthroughSubject<CategoryDeletedSocketEvent, Never>()
    public let categoriesReordered = PassthroughSubject<CategoriesReorderedSocketEvent, Never>()

    // Combine publishers — conversation stats
    public let conversationStatsReceived = PassthroughSubject<ConversationStatsEvent, Never>()

    // Combine publishers — view-once
    public let messageConsumed = PassthroughSubject<MessageConsumedEvent, Never>()

    // Combine publishers — location sharing
    public let liveLocationStarted = PassthroughSubject<LiveLocationStartedEvent, Never>()
    public let liveLocationUpdated = PassthroughSubject<LiveLocationUpdatedEvent, Never>()
    public let liveLocationStopped = PassthroughSubject<LiveLocationStoppedEvent, Never>()

    // Combine publishers — translation
    public let translationReceived = PassthroughSubject<TranslationEvent, Never>()

    // Combine publishers — transcription & audio
    public let transcriptionReady = PassthroughSubject<TranscriptionReadyEvent, Never>()
    public let audioTranslationReady = PassthroughSubject<AudioTranslationEvent, Never>()
    public let audioTranslationProgressive = PassthroughSubject<AudioTranslationEvent, Never>()
    public let audioTranslationCompleted = PassthroughSubject<AudioTranslationEvent, Never>()
    public let translationFailed = PassthroughSubject<TranslationFailedEvent, Never>()
    public let audioTranslationFailed = PassthroughSubject<AudioTranslationFailedEvent, Never>()
    public let transcriptionFailed = PassthroughSubject<TranscriptionFailedEvent, Never>()

    // Combine publisher — reconnection (fires after successful reconnect)
    public let didReconnect = PassthroughSubject<Void, Never>()

    // Combine publisher — heartbeat RTT (fires after each heartbeat:ack with ms value)
    public let connectionRTT = PassthroughSubject<Double, Never>()

    // Combine publishers — notifications
    public let notificationReceived = PassthroughSubject<SocketNotificationEvent, Never>()
    public let conversationNew = PassthroughSubject<ConversationNewEvent, Never>()
    public let notificationRead = PassthroughSubject<NotificationReadEvent, Never>()
    public let notificationDeleted = PassthroughSubject<NotificationDeletedEvent, Never>()
    public let notificationCounts = PassthroughSubject<NotificationCountsEvent, Never>()
    public let notificationReadBulk = PassthroughSubject<NotificationReadBulkEvent, Never>()
    public let notificationDeletedBulk = PassthroughSubject<NotificationDeletedBulkEvent, Never>()

    // Combine publishers — call signaling
    public let callOfferReceived = PassthroughSubject<CallOfferData, Never>()
    public let callSignalOfferReceived = PassthroughSubject<CallAnswerData, Never>()
    public let callAnswerReceived = PassthroughSubject<CallAnswerData, Never>()
    public let callICECandidateReceived = PassthroughSubject<CallICECandidateData, Never>()
    public let callEnded = PassthroughSubject<CallEndData, Never>()
    public let callMissed = PassthroughSubject<CallMissedData, Never>()
    public let callAlreadyAnswered = PassthroughSubject<CallAlreadyAnsweredData, Never>()
    public let callParticipantJoined = PassthroughSubject<CallParticipantData, Never>()
    /// Last `call:participant-joined` event received, so the initiator's listener
    /// (set up only after the call:initiate ACK) can replay an event that arrived
    /// before it subscribed (callee already in the room). Matched by callId, so a
    /// stale event from a previous call is naturally ignored.
    public private(set) var lastCallParticipantJoined: CallParticipantData?
    public let callParticipantLeft = PassthroughSubject<CallParticipantData, Never>()
    public let callMediaToggled = PassthroughSubject<CallMediaToggleData, Never>()
    public let callError = PassthroughSubject<CallErrorData, Never>()
    public let callIceServersRefreshed = PassthroughSubject<CallIceServersRefreshedData, Never>()
    public let callQualityAlert = PassthroughSubject<CallQualityAlertData, Never>()
    public let callScreenCaptureAlert = PassthroughSubject<CallScreenCaptureAlertData, Never>()
    public let callForcedLeave = PassthroughSubject<CallForcedLeaveData, Never>()
    public let callTranslatedSegmentReceived = PassthroughSubject<CallTranslatedSegmentData, Never>()
    public let callTranscriptionActiveReceived = PassthroughSubject<CallTranscriptionActiveData, Never>()

    // Combine publishers — reactions sync, attachments, mentions
    public let reactionSynced = PassthroughSubject<ReactionSyncEvent, Never>()
    public let mentionCreated = PassthroughSubject<MentionCreatedEvent, Never>()

    @Published public var isConnected = false
    @Published public var connectionState: ConnectionState = .disconnected

    // The currently active (foreground) conversation for priority re-join
    public var activeConversationId: String?

    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private var joinedConversations: Set<String> = []
    private var reconnectAttempt: Int = 0
    private var backoff = SocketReconnectBackoff()
    private var reconnectTask: Task<Void, Never>?
    private var hadPreviousConnection = false
    private var heartbeatTimer: Timer?
    private var lifecycleCancellables = Set<AnyCancellable>()

    // Cached formatters — ISO8601DateFormatter is expensive to allocate.
    // Safe to share: options are set once during init and never mutated after.
    private nonisolated(unsafe) static let isoFormatterWithFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private nonisolated(unsafe) static let isoFormatterBasic: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    deinit {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
    }

    private init() {
        observeNetworkRecovery()
    }

    /// Source unique de vérité réseau : quand `NetworkMonitor` repasse en
    /// ligne, forcer une reconnexion socket immédiate. Évite que la bannière
    /// "Reconnexion..." persiste pendant que Socket.IO attend sa propre
    /// boucle de retry (qui peut tarder après une coupure prolongée — iOS
    /// kille silencieusement la WebSocket en arrière-plan).
    private func observeNetworkRecovery() {
        NetworkMonitor.shared.$isOffline
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.handleNetworkBackOnline()
            }
            .store(in: &lifecycleCancellables)
    }

    private func handleNetworkBackOnline() {
        guard !isConnected else { return }
        guard APIClient.shared.authToken != nil else { return }
        // The network coming back is fresh positive evidence about the LINK, not
        // about the server: a ladder built up by earlier outages must not defer
        // this attempt. (`SocialSocketManager` reconnects immediately on the same
        // signal — resetting here keeps the two policies aligned.)
        backoff.reset()
        scheduleReconnectWithBackoff()
    }

    private func scheduleReconnectWithBackoff() {
        // Only worth retrying while a session still exists. A nil token means the
        // server invalidated us (`requireReauthentication` clears it) and no amount
        // of retrying helps — only a fresh login does. An EXPIRED token is a
        // different story and must keep retrying: that is the post-outage case this
        // ladder exists for.
        guard APIClient.shared.authToken != nil else {
            Logger.socket.info("MessageSocket: no session — not arming a reconnect retry")
            return
        }
        reconnectTask?.cancel()
        let delay = backoff.nextDelay(jitter: SocketReconnectBackoff.randomJitter())
        let attempt = backoff.attempt
        Logger.socket.info("MessageSocket: backoff reconnect attempt=\(attempt) delay=\(delay, format: .fixed(precision: 2))s")
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            await MainActor.run { [weak self] in
                guard let self, !self.isConnected else { return }
                self.forceReconnect()
            }
        }
    }

    // MARK: - JWT Helpers

    private static func isJWTExpired(_ token: String) -> Bool {
        let parts = token.split(separator: ".")
        guard parts.count == 3 else { return true }
        var base64 = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        // Fail-safe : un JWT illisible est traité comme expiré (déclenche un
        // refresh) plutôt que présumé valide.
        guard let data = Data(base64Encoded: base64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let exp = json["exp"] as? TimeInterval else { return true }
        return Date(timeIntervalSince1970: exp).addingTimeInterval(-30) < Date()
    }

    // MARK: - Connection

    public func connect() {
        establishTransport()
    }

    /// The real `connect()`, reporting whether a live transport now exists.
    ///
    /// Every early return below leaves `socket`/`manager` nil. That is harmless
    /// on a cold start, but NOT when reached from `forceReconnect()`: that path
    /// runs `suspendTransport()` first, which destroys Socket.IO's own infinite
    /// retry loop. A `.notArmed` outcome there means the app is left with no
    /// transport and nothing retrying — so the caller has to arm the backoff
    /// ladder. See `forceReconnect()`.
    /// Les en-têtes du handshake — le JWT, et le jeton de session s'il existe.
    ///
    /// Extrait pour être testable : la construction du `SocketManager` ne l'est
    /// pas, et c'est la PRÉSENCE de la seconde clé qui décide si la révocation
    /// d'une session peut atteindre cet appareil.
    /// Le jeton est passé en PARAMÈTRE, jamais lu depuis le singleton ici :
    /// `AuthManager` est isolé `@MainActor`, et cette fonction est appelée
    /// depuis le contexte de transport. La lire ici forcerait un saut d'acteur
    /// dans une construction synchrone — et rendrait la fonction intestable.
    static func handshakeHeaders(token: String, sessionToken: String?) -> [String: String] {
        var headers = ["Authorization": "Bearer \(token)"]
        if let sessionToken, !sessionToken.isEmpty {
            headers["x-session-token"] = sessionToken
        }
        return headers
    }

    @discardableResult
    func establishTransport() -> SocketConnectOutcome {
        // Ne JAMAIS reconstruire le socket tant qu'une connexion existe ou est
        // en cours. Réassigner `manager`/`socket` relâche l'instance courante
        // en plein handshake : la connexion n'aboutit alors jamais et tous les
        // emits échouent avec « Tried emitting when not connected ».
        if let socket, socket.status == .connected || socket.status == .connecting {
            return .armed
        }

        guard let token = APIClient.shared.authToken else {
            Logger.socket.warning("No auth token, skipping connect")
            return .notArmed
        }

        let tokenExpired = Self.isJWTExpired(token)
        if tokenExpired {
            Logger.socket.warning("MessageSocket: JWT expired, triggering refresh instead of connecting")
            Task { @MainActor in
                AuthManager.shared.handleUnauthorized()
            }
            // The refresh is fire-and-forget and gives up silently on a transient
            // network error — very likely right after an outage, which is exactly
            // when we land here. Without a scheduled retry the app would stay dark
            // with a valid session in the keychain.
            return .notArmed
        }

        guard let url = SocketConfig.baseURL else { return .notArmed }

        DispatchQueue.main.async { self.connectionState = .connecting }

        manager = SocketManager(socketURL: url, config: [
            .log(false),
            // CALL-FIX 2026-06-06 — WebSocket transport (polling handshake → auto
            // upgrade to WebSocket). The previous `.forcePolling(true)` (HTTP
            // long-poll ONLY) dropped mid-call: every re-poll under WebRTC CPU load
            // surfaced as "transport close" on the gateway, killing call:initiate /
            // SDP / ICE signaling (call stuck on "connecting"). The old "~35s the WS
            // dropped" was a ping timeout (gateway pingTimeout was 10s) — bumped to
            // 20s server-side, so the persistent WebSocket now holds.
            //
            // P4-1 évalué 2026-08-22 puis ÉCARTÉ : `.forceWebsockets(true)`
            // économiserait 1-2 RTT par connect mais supprime le REPLI polling
            // — contrairement au web (`transports: ['websocket','polling']`,
            // WS d'abord AVEC repli), un réseau qui casse l'upgrade WebSocket
            // (proxy TLS-inspectant, portail captif) perdrait tout temps réel.
            // À reconsidérer seulement avec un repli après N échecs.
            // Le jeton de SESSION voyage AVEC le JWT (#4213).
            //
            // Un socket inscrit s'authentifiait au JWT seul, et le serveur
            // n'avait donc aucun moyen de dire quel socket appartient à quelle
            // session : révoquer une session passait la ligne à
            // `isValid: false` et cet appareil continuait de tout recevoir —
            // `message:new`, `conversation:updated` — indéfiniment, un socket
            // n'étant authentifié qu'une fois, au connect, et jamais revérifié.
            //
            // En EN-TÊTE, comme le JWT et comme les appels REST : le serveur le
            // lit par `extractSessionToken`, qui accepte l'en-tête
            // `x-session-token` aussi bien que `handshake.auth`.
            .extraHeaders(Self.handshakeHeaders(token: token, sessionToken: APIClient.shared.registeredSessionToken)),
            .reconnects(true),
            .reconnectWait(1),
            .reconnectWaitMax(16),
            .reconnectAttempts(-1),
            .sessionDelegate(CertificatePinningDelegate()),
            // BW-IOS-01 — negocie l'extension `permessage-deflate`. Le gateway
            // l'annonce depuis toujours (`perMessageDeflate`, seuil 256 o) mais
            // Starscream ne pose l'en-tete d'extension que si le manager le
            // demande : sans ce drapeau, TOUTES les trames iOS voyageaient non
            // compressees. Un intermediaire qui casserait l'extension fait
            // retomber le handshake sur des trames nues, jamais sur une
            // deconnexion.
            .compress,
        ])

        socket = manager?.defaultSocket
        setupEventHandlers()
        socket?.connect()
        return .armed
    }

    public func connectAnonymous(sessionToken: String) {
        if let socket, socket.status == .connected || socket.status == .connecting {
            return
        }
        disconnect()

        guard let url = SocketConfig.baseURL else { return }

        DispatchQueue.main.async { self.connectionState = .connecting }

        manager = SocketManager(socketURL: url, config: [
            .log(false),
            // CALL-FIX 2026-06-06 — WebSocket transport (voir connect()).
            .extraHeaders(["X-Session-Token": sessionToken]),
            .reconnects(true),
            .reconnectWait(1),
            .reconnectWaitMax(16),
            .reconnectAttempts(-1),
            .sessionDelegate(CertificatePinningDelegate()),
            // BW-IOS-01 — `permessage-deflate` (voir `connect()`).
            .compress,
        ])

        socket = manager?.defaultSocket
        setupEventHandlers()
        socket?.connect()
    }

    /// Transport-only teardown shared by `disconnect()`, `prepareForBackground()`
    /// and `forceReconnect()`. Tears down the live socket + heartbeat (so a stale
    /// `isConnected` flag can never suppress the next reconnect) but DELIBERATELY
    /// preserves the session-level state — `hadPreviousConnection` (so the next
    /// `.connect` reports `wasReconnect == true` and fires `didReconnect`, the
    /// sole trigger for the open conversation's missed-message backfill +
    /// queued-receipt flush) AND `joinedConversations` / `activeConversationId`
    /// (so the `.connect` re-join loop restores the rooms active-first, and
    /// `leaveConversation` / typing accounting stays accurate after resume).
    /// Contrast `disconnect()`, the logout/cold reset, which additionally clears
    /// all of that so the next login is a genuine cold connect with no rooms.
    private func suspendTransport() {
        reconnectTask?.cancel()
        reconnectTask = nil
        stopHeartbeat()
        socket?.disconnect()
        socket = nil
        manager = nil
        isConnected = false
        connectionState = .disconnected
        reconnectAttempt = 0
    }

    public func disconnect() {
        suspendTransport()
        // Logout / cold reset: forget the prior connection AND the joined rooms
        // so the next `.connect` is a cold first connect (no spurious backfill,
        // no stale room re-joins under a different account).
        joinedConversations.removeAll()
        activeConversationId = nil
        hadPreviousConnection = false
    }

    // MARK: - Background lifecycle

    /// Called when the app transitions to `.background`. We stop the
    /// heartbeat timer so it cannot fire into an OS-frozen runtime and we
    /// explicitly tear down the socket so `isConnected` cannot lie to the
    /// resume path. iOS suspension silently kills the WebSocket without
    /// always firing the `disconnect` event — if we trusted
    /// `isConnected == true` on resume, the guard
    /// `if !isConnected { connect() }` would never reconnect and the app
    /// would appear authenticated but receive zero real-time events.
    public func prepareForBackground() {
        // Transport-only teardown: drop the socket so a stale `isConnected`
        // cannot fool the resume path, but KEEP `hadPreviousConnection` so the
        // foreground-resume `.connect` fires `didReconnect` (missed-message
        // backfill + queued read/received-receipt flush).
        suspendTransport()
    }

    /// Called when the app comes back to `.active`. Since
    /// `prepareForBackground()` explicitly tore the socket down, this is
    /// just a plain reconnect — no stale-state decision to make.
    /// Reads the token from `APIClient` (nonisolated mirror of
    /// `AuthManager.authToken`) to keep this hook callable from any context.
    public func resumeFromBackground() {
        guard APIClient.shared.authToken != nil else { return }
        forceReconnect()
    }

    /// CALL-FIX 2026-06-05 — app-injected predicate: "is a call active right now?".
    /// Kept as an opaque closure so the SDK stays call-agnostic (SDK purity rule).
    /// The app wires it to `CallManager.isCallActiveFlag` (a thread-safe nonisolated
    /// flag) at boot. When it returns true, `forceReconnect()` is suppressed so a
    /// token rotation / re-auth never tears down the socket carrying live WebRTC
    /// signaling, which would strand the call on "connecting".
    public var isCallActiveGuard: (@Sendable () -> Bool)?

    /// Whether a backoff retry is currently armed. Test seam: the recovery this
    /// class owes after a rebuild that produced no transport is invisible from
    /// the outside otherwise (no socket, no published state change).
    var hasPendingReconnect: Bool { reconnectTask != nil }

    /// Tear down and rebuild the socket unconditionally. Use this on
    /// foreground resume or after a token refresh so we never depend on
    /// the potentially stale `isConnected` flag. `disconnect()` clears
    /// the flag and nils the underlying socket; `connect()` rebuilds it.
    public func forceReconnect() {
        if isCallActiveGuard?() == true {
            Logger.socket.info("MessageSocket: forceReconnect suppressed — call active (keep signaling socket)")
            // Suppressed, not abandoned. Keeping a HEALTHY signaling socket is the
            // whole point, so nothing to do while it is up — but if it is already
            // down, suppression would otherwise be terminal for the one socket the
            // call depends on. Arm the ladder so the rebuild happens anyway.
            if !isConnected { scheduleReconnectWithBackoff() }
            return
        }
        // Suspend (not full disconnect) so `hadPreviousConnection` survives: this
        // rebuild is a reconnect (resume / network-back / re-auth), and the next
        // `.connect` must fire `didReconnect`.
        suspendTransport()
        if establishTransport() == .notArmed {
            // The teardown above is unconditional but the rebuild is not: no
            // transport was built (missing/expired token, no base URL) and
            // Socket.IO's own retry loop went down with the old socket. The
            // backoff ladder is now the ONLY thing that can bring us back —
            // notably when the post-outage token refresh fails transiently and
            // `handleUnauthorized()` gives up without telling anyone.
            scheduleReconnectWithBackoff()
        }
    }

    /// Connection-handshake bookkeeping, extracted from the `.connect` handler
    /// so the reconnect-vs-cold decision is unit-testable without driving a live
    /// socket. Records that we have now connected, resets the retry counter,
    /// and — when this connection follows a previous one (network blip,
    /// foreground resume, re-auth) — fires `didReconnect` so the app backfills
    /// the open conversation and flushes queued read/received receipts. Returns
    /// whether it was a reconnect for the caller's logging/re-join branch.
    @discardableResult
    func handleConnectionEstablished() -> Bool {
        reconnectTask?.cancel()
        reconnectTask = nil
        let wasReconnect = hadPreviousConnection
        hadPreviousConnection = true
        reconnectAttempt = 0
        backoff.reset()
        if wasReconnect {
            DispatchQueue.main.async { [weak self] in self?.didReconnect.send(()) }
        }
        return wasReconnect
    }

    /// The conversation rooms to (re)join on connect, active-first for fastest
    /// UX. Extracted from the `.connect` handler so the re-join set — preserved
    /// across a background suspend (`suspendTransport`) and only cleared on
    /// logout (`disconnect`) — is unit-testable without a live socket.
    func roomsToRejoinOnConnect() -> [String] {
        var rooms: [String] = []
        if let activeId = activeConversationId, joinedConversations.contains(activeId) {
            rooms.append(activeId)
        }
        for convId in joinedConversations where convId != activeConversationId {
            rooms.append(convId)
        }
        return rooms
    }

    // MARK: - Heartbeat

    private func startHeartbeat() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            // Include clientTime so the gateway can compute round-trip latency
            // and return it in heartbeat:ack for connection quality monitoring.
            let clientTimeMs = Int64(Date().timeIntervalSince1970 * 1000)
            self.safeEmit("heartbeat", ["clientTime": clientTimeMs])
        }
    }

    private func stopHeartbeat() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
    }

    // MARK: - Room Management

    public func joinConversation(_ conversationId: String) {
        guard !joinedConversations.contains(conversationId) else { return }
        // Tracker la room AVANT toute emission : le handler `.connect`
        // (re-join loop) re-emet `conversation:join` pour toutes les rooms
        // de `joinedConversations` une fois le handshake termine.
        joinedConversations.insert(conversationId)
        guard socket?.status == .connected else {
            // Socket pas encore connecte : emettre ici serait perdu et
            // declencherait l'erreur `Tried emitting when not connected`.
            // Le re-join du handler `.connect` prendra le relais.
            return
        }
        socket?.emit("conversation:join", ["conversationId": conversationId])
    }

    public func leaveConversation(_ conversationId: String) {
        guard joinedConversations.contains(conversationId) else { return }
        safeEmit("conversation:leave", ["conversationId": conversationId])
        joinedConversations.remove(conversationId)
    }

    /// Emits only when the socket is actually `.connected`. Fire-and-forget
    /// events (typing, heartbeat, leave) that race a background transition would
    /// otherwise hit "Tried emitting when not connected" as the socket suspends —
    /// the emit is lost either way, so drop it quietly. The re-join loop and the
    /// heartbeat timer resume these on reconnect. NOT for user-critical or
    /// ACK-bearing emits (call signaling / translation buffer via their own paths).
    private func safeEmit(_ event: String, _ payload: [String: Any]) {
        guard socket?.status == .connected else {
            Logger.socket.debug("Skipping \(event, privacy: .public) emit — socket not connected")
            return
        }
        socket?.emit(event, payload)
    }

    // MARK: - Typing Emission

    public func emitTypingStart(conversationId: String) {
        safeEmit("typing:start", ["conversationId": conversationId])
    }

    public func emitTypingStop(conversationId: String) {
        safeEmit("typing:stop", ["conversationId": conversationId])
    }

    // MARK: - Attachment Reactions (BUG2 A')

    /// Pose une réaction sur une pièce jointe (emit direct ; parité offline-queue
    /// différée, cf. spec). Le serveur diffuse `attachment:reaction-added`.
    public func addAttachmentReaction(attachmentId: String, messageId: String, emoji: String) {
        socket?.emit("attachment:reaction-add", ["attachmentId": attachmentId, "messageId": messageId, "emoji": emoji])
    }

    public func removeAttachmentReaction(attachmentId: String, messageId: String, emoji: String) {
        socket?.emit("attachment:reaction-remove", ["attachmentId": attachmentId, "messageId": messageId, "emoji": emoji])
    }

    // MARK: - Translation Request

    /// Buffered user-triggered emits that the socket layer must NOT silently
    /// drop on disconnect. Translation requests are at the top of that list:
    /// the user explicitly tapped a flag to ask for a target-language
    /// rendering, and without buffering the request vanishes the instant the
    /// socket is offline (the user blames the app, retries the same tap,
    /// gets the same nothing). Capped + TTL-bounded so a long disconnect
    /// cannot turn this into a memory leak.
    struct PendingTranslationRequest: Equatable, Sendable {
        let messageId: String
        let targetLanguage: String
        let queuedAt: Date
    }

    private var pendingTranslationRequests: [PendingTranslationRequest] = []
    static let translationBufferMaxSize = 50
    static let translationBufferTTL: TimeInterval = 60

    public func requestTranslation(messageId: String, targetLanguage: String) {
        // U4 — ALWAYS buffer, in addition to emitting when connected. The
        // gateway's `message:translation` completion broadcast is fire-and-forget
        // with no ack/replay, so if the socket drops between this request and the
        // broadcast (a multi-second Whisper/NLLB window), the result is dropped
        // and reconnect never re-asks (syncMissedMessages only re-fetches NEWER
        // messages; flushBufferedTranslationRequests previously replayed only the
        // disconnected buffer). Buffering unconditionally lets the reconnect
        // replay re-ask; the gateway request is idempotent (returns the cached
        // translation) so a redundant replay is harmless, and TTL(60s)+dedup+cap
        // bound the buffer.
        bufferTranslationRequest(
            PendingTranslationRequest(
                messageId: messageId,
                targetLanguage: targetLanguage,
                queuedAt: Date()
            )
        )
        if isConnected {
            socket?.emit("translation:request", ["messageId": messageId, "targetLanguage": targetLanguage])
            Logger.socket.info("Requested translation for \(messageId) -> \(targetLanguage)")
        }
    }

    private func bufferTranslationRequest(_ request: PendingTranslationRequest) {
        // De-dup: if the same (messageId, targetLanguage) is already queued,
        // refresh its timestamp rather than enqueue twice — the user re-tapped.
        pendingTranslationRequests.removeAll {
            $0.messageId == request.messageId && $0.targetLanguage == request.targetLanguage
        }
        pendingTranslationRequests.append(request)
        // Cap from the front: oldest pending requests are the least useful
        // when the user is staring at the screen.
        if pendingTranslationRequests.count > Self.translationBufferMaxSize {
            let dropCount = pendingTranslationRequests.count - Self.translationBufferMaxSize
            pendingTranslationRequests.removeFirst(dropCount)
        }
    }

    /// Flush queued translation requests that are still fresh enough to
    /// matter. Called from the `.connect` handler immediately after
    /// re-joining rooms so the gateway sees a coherent stream
    /// (`conversation:join` first, then late translation asks for those
    /// rooms). Exposed as `internal` so the test bundle can validate the
    /// replay without driving a real socket.
    func flushBufferedTranslationRequests(now: Date = Date()) {
        guard !pendingTranslationRequests.isEmpty else { return }
        let cutoff = now.addingTimeInterval(-Self.translationBufferTTL)
        let toReplay = pendingTranslationRequests.filter { $0.queuedAt >= cutoff }
        pendingTranslationRequests.removeAll()
        for request in toReplay {
            socket?.emit("translation:request", [
                "messageId": request.messageId,
                "targetLanguage": request.targetLanguage
            ])
        }
    }

    #if DEBUG
    var debug_pendingTranslationRequests: [PendingTranslationRequest] {
        pendingTranslationRequests
    }
    #endif

    // MARK: - Location Emission

    /// Emits `payload` as a Socket.IO dictionary.
    ///
    /// A failed conversion used to abort the emission silently: the user shared
    /// a location and nothing ever left the device, with no error anywhere.
    private func emitEncodable<P: Encodable>(_ payload: P, event: String) {
        do {
            let data = try JSONEncoder().encode(payload)
            guard let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                Logger.socket.error("\(event, privacy: .public) not emitted — payload is not a JSON object")
                return
            }
            socket?.emit(event, dict)
        } catch {
            Logger.socket.error("\(event, privacy: .public) not emitted — payload encode failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    public func emitLiveLocationStart(payload: LiveLocationStartPayload) {
        emitEncodable(payload, event: "location:live-start")
    }

    public func emitLiveLocationUpdate(payload: LiveLocationUpdatePayload) {
        emitEncodable(payload, event: "location:live-update")
    }

    public func emitLiveLocationStop(conversationId: String) {
        socket?.emit("location:live-stop", ["conversationId": conversationId])
    }

    // MARK: - Send With Attachments

    /// ACK returned by the gateway after `message:send` / `message:send-with-attachments`.
    /// Phase 4 (spec §6.2) requires `_sendResponse()` to echo back the same
    /// `clientMessageId` the client supplied in the request so the local
    /// outbox/optimistic layer can match the row without scraping the
    /// `message:new` broadcast. `clientMessageId` is optional on the wire
    /// during the rollout window — older gateway builds drop the field.
    /// `createdAt` carries the authoritative server timestamp so the WS-first
    /// send path can stamp the optimistic row without waiting for the
    /// `message:new` broadcast; it is `nil` against older gateway builds.
    public struct SendMessageAck: Sendable {
        public let messageId: String
        public let clientMessageId: String?
        public let createdAt: Date?

        public init(messageId: String, clientMessageId: String?, createdAt: Date? = nil) {
            self.messageId = messageId
            self.clientMessageId = clientMessageId
            self.createdAt = createdAt
        }
    }

    /// Parses the ISO-8601 `createdAt` echoed in a send ACK, tolerating both
    /// the fractional-seconds and basic forms. Returns `nil` on any mismatch
    /// so the caller can fall back to the local send time.
    private static func parseAckDate(_ value: Any?) -> Date? {
        guard let string = value as? String, !string.isEmpty else { return nil }
        return isoFormatterWithFractional.date(from: string)
            ?? isoFormatterBasic.date(from: string)
    }

    private func buildAttachmentPayload(
        conversationId: String, content: String?, attachmentIds: [String],
        replyToId: String?, storyReplyToId: String? = nil, originalLanguage: String?, isEncrypted: Bool,
        clientMessageId: String, location: SharedPlace? = nil
    ) -> [String: Any] {
        var payload: [String: Any] = [
            "conversationId": conversationId,
            "content": content ?? "",
            "attachmentIds": attachmentIds,
            "isEncrypted": isEncrypted,
            "clientMessageId": clientMessageId
        ]
        if let replyToId { payload["replyToId"] = replyToId }
        if let storyReplyToId { payload["storyReplyToId"] = storyReplyToId }
        if let originalLanguage { payload["originalLanguage"] = originalLanguage }
        if let location { payload["location"] = MessageSocketManager.locationSocketPayload(location) }
        return payload
    }

    /// Sérialise un `SharedPlace` dans la forme dictionnaire que le gateway
    /// valide (`parseSharedPlace` — coordonnées obligatoires, textes
    /// optionnels). Les champs nil sont omis plutôt qu'envoyés en `NSNull`.
    static func locationSocketPayload(_ place: SharedPlace) -> [String: Any] {
        var dict: [String: Any] = [
            "latitude": place.latitude,
            "longitude": place.longitude
        ]
        if let name = place.name { dict["name"] = name }
        if let address = place.address { dict["address"] = address }
        if let category = place.category { dict["category"] = category }
        return dict
    }

    public func sendWithAttachments(
        conversationId: String,
        content: String?,
        attachmentIds: [String],
        replyToId: String?,
        storyReplyToId: String? = nil,
        originalLanguage: String? = nil,
        isEncrypted: Bool = false,
        clientMessageId: String? = nil
    ) {
        let cid = clientMessageId ?? ClientMessageId.generate()
        let payload = buildAttachmentPayload(
            conversationId: conversationId, content: content, attachmentIds: attachmentIds,
            replyToId: replyToId, storyReplyToId: storyReplyToId, originalLanguage: originalLanguage, isEncrypted: isEncrypted,
            clientMessageId: cid
        )
        socket?.emit("message:send-with-attachments", payload)
    }

    /// Emits `message:send-with-attachments` and awaits the gateway ACK.
    /// Returns the full `SendMessageAck` (server `messageId` + the echoed
    /// `clientMessageId` from the request) so callers can reconcile the
    /// optimistic row by `clientMessageId` rather than waiting for the
    /// targeted `message:new` broadcast. Returns `nil` on timeout / no socket
    /// / server error.
    public func sendWithAttachmentsAsync(
        conversationId: String,
        content: String?,
        attachmentIds: [String],
        replyToId: String?,
        storyReplyToId: String? = nil,
        originalLanguage: String? = nil,
        isEncrypted: Bool = false,
        clientMessageId: String? = nil,
        location: SharedPlace? = nil
    ) async -> SendMessageAck? {
        guard let socket else { return nil }
        let cid = clientMessageId ?? ClientMessageId.generate()
        let payload = buildAttachmentPayload(
            conversationId: conversationId, content: content, attachmentIds: attachmentIds,
            replyToId: replyToId, storyReplyToId: storyReplyToId, originalLanguage: originalLanguage, isEncrypted: isEncrypted,
            clientMessageId: cid, location: location
        )
        return await withCheckedContinuation { continuation in
            // 10s (was 30s): the gateway acks as soon as the message row is
            // created — attachments were already uploaded separately, so a
            // healthy ack lands in well under 2s. Holding the optimistic
            // bubble in `.sending` for 30s only prolonged the clock icon; on
            // timeout the caller falls through to the outbox retry loop,
            // which remains the durable safety net. Matches `sendAsync`'s
            // 10s default on the text path.
            socket.emitWithAck("message:send-with-attachments", payload).timingOut(after: 10) { items in
                if let response = items.first as? [String: Any],
                   let success = response["success"] as? Bool, success,
                   let data = response["data"] as? [String: Any],
                   let messageId = data["messageId"] as? String {
                    let ackCid = data["clientMessageId"] as? String ?? cid
                    continuation.resume(returning: SendMessageAck(
                        messageId: messageId,
                        clientMessageId: ackCid,
                        createdAt: MessageSocketManager.parseAckDate(data["createdAt"])
                    ))
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    // MARK: - Send Text (WebSocket-first)

    /// Emits a plain-text `message:send` over the open Socket.IO connection and
    /// awaits the gateway ACK. This is the WebSocket-first send path used for
    /// regular text messages — parity with reactions / comments / status, which
    /// already travel over the socket. Carries the full message effect set
    /// (`isBlurred`, `expiresAt` for ephemeral, `effectFlags` bitfield,
    /// `isViewOnce` / `maxViewOnceCount`) at parity with the REST route.
    ///
    /// Returns the `SendMessageAck` (server `messageId`, echoed
    /// `clientMessageId`, server `createdAt`) on success, or `nil` on timeout /
    /// no socket / server error so the caller can fall back to the REST send.
    ///
    /// NOT for E2EE payloads or attachments — the `message:send` event does not
    /// transport those; the caller routes them through REST or
    /// `sendWithAttachments`.
    public func sendAsync(
        conversationId: String,
        content: String?,
        originalLanguage: String? = nil,
        replyToId: String? = nil,
        storyReplyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil,
        messageType: String? = nil,
        isBlurred: Bool? = nil,
        expiresAt: Date? = nil,
        effectFlags: UInt32? = nil,
        isViewOnce: Bool? = nil,
        maxViewOnceCount: Int? = nil,
        clientMessageId: String? = nil,
        location: SharedPlace? = nil,
        timeoutSeconds: Double = 10
    ) async -> SendMessageAck? {
        guard let socket else { return nil }
        let cid = clientMessageId ?? ClientMessageId.generate()
        var payload: [String: Any] = [
            "conversationId": conversationId,
            "content": content ?? "",
            "clientMessageId": cid
        ]
        if let originalLanguage { payload["originalLanguage"] = originalLanguage }
        if let messageType { payload["messageType"] = messageType }
        if let replyToId { payload["replyToId"] = replyToId }
        if let storyReplyToId { payload["storyReplyToId"] = storyReplyToId }
        if let forwardedFromId { payload["forwardedFromId"] = forwardedFromId }
        if let forwardedFromConversationId { payload["forwardedFromConversationId"] = forwardedFromConversationId }
        if let isBlurred { payload["isBlurred"] = isBlurred }
        if let expiresAt { payload["expiresAt"] = MessageSocketManager.isoFormatterWithFractional.string(from: expiresAt) }
        if let effectFlags { payload["effectFlags"] = Int(effectFlags) }
        if let isViewOnce { payload["isViewOnce"] = isViewOnce }
        if let maxViewOnceCount { payload["maxViewOnceCount"] = maxViewOnceCount }
        // Lieu partagé — même clé `location` que le corps REST ; le handler
        // socket la valide via `parseSharedPlace` (MessageHandler.ts).
        if let location { payload["location"] = MessageSocketManager.locationSocketPayload(location) }
        return await withCheckedContinuation { continuation in
            socket.emitWithAck("message:send", payload).timingOut(after: timeoutSeconds) { items in
                if let response = items.first as? [String: Any],
                   let success = response["success"] as? Bool, success,
                   let data = response["data"] as? [String: Any],
                   let messageId = data["messageId"] as? String {
                    let ackCid = data["clientMessageId"] as? String ?? cid
                    continuation.resume(returning: SendMessageAck(
                        messageId: messageId,
                        clientMessageId: ackCid,
                        createdAt: MessageSocketManager.parseAckDate(data["createdAt"])
                    ))
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    /// Chemin de repli socket pour `ConversationViewModel.sendMessage`, appelé
    /// quand le POST REST a échoué. Réémet le message sur le socket avec le
    /// MÊME `clientMessageId` : le dedup gateway `(conversationId, clientMessageId)`
    /// garantit l'absence de doublon si l'outbox rejoue le REST plus tard.
    ///
    /// Route vers `message:send-with-attachments` (média) ou `message:send`
    /// (texte). Un texte chiffré E2EE renvoie `nil` — l'event `message:send` ne
    /// transporte pas le chiffrement, on ne réémet pas un payload en clair ;
    /// ces messages restent sur le retry REST de l'outbox.
    public func sendViaSocketFallback(
        conversationId: String,
        content: String?,
        attachmentIds: [String],
        replyToId: String?,
        storyReplyToId: String?,
        originalLanguage: String?,
        isEncrypted: Bool,
        clientMessageId: String,
        location: SharedPlace? = nil
    ) async -> SendMessageAck? {
        if attachmentIds.isEmpty {
            if isEncrypted { return nil }
            return await sendAsync(
                conversationId: conversationId,
                content: content,
                originalLanguage: originalLanguage,
                replyToId: replyToId,
                storyReplyToId: storyReplyToId,
                clientMessageId: clientMessageId,
                location: location
            )
        }
        return await sendWithAttachmentsAsync(
            conversationId: conversationId,
            content: content,
            attachmentIds: attachmentIds,
            replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            originalLanguage: originalLanguage,
            isEncrypted: isEncrypted,
            clientMessageId: clientMessageId,
            location: location
        )
    }

    // MARK: - Call Signaling Emission

    public enum CallInitiateError: Error, Sendable, LocalizedError {
        case noSocket
        case timeout
        case serverError(String)
        case malformedResponse

        // Conformance LocalizedError pour que les logs d'app et les UI surfaces
        // exposent la cause réelle au lieu du fallback Swift "error N" peu
        // discriminant (N étant l'index de case bridgé en NSError._code, qui
        // peut différer entre les builds quand on ajoute/réordonne des cases).
        public var errorDescription: String? {
            switch self {
            case .noSocket:
                return "noSocket — MessageSocket non connecté lors de l'émission de call:initiate (vérifier login, connexion réseau, état du gateway)"
            case .timeout:
                return "timeout — Le gateway n'a pas répondu à call:initiate sous 10s (vérifier gateway up, latence réseau)"
            case .serverError(let message):
                return "serverError — Gateway a rejeté call:initiate: \(message)"
            case .malformedResponse:
                return "malformedResponse — La réponse ACK de call:initiate ne contient pas data.callId ou iceServers"
            }
        }
    }

    public struct CallInitiateAck: Sendable {
        public let callId: String
        public let mode: String?
        public let iceServers: [SocketIceServer]
        public let ttl: Int?

        public init(callId: String, mode: String?, iceServers: [SocketIceServer], ttl: Int? = nil) {
            self.callId = callId
            self.mode = mode
            self.iceServers = iceServers
            self.ttl = ttl
        }
    }

    /// Emits `call:initiate` and awaits the gateway ACK that returns the real
    /// MongoDB callId, mode and per-user ICE servers (TURN credentials).
    /// The caller MUST configure WebRTC with these ICE servers BEFORE building
    /// any SDP offer — otherwise NAT-symmetric peers can never connect.
    public func emitCallInitiate(conversationId: String, isVideo: Bool) async throws -> CallInitiateAck {
        guard let socket else { throw CallInitiateError.noSocket }
        let payload: [String: Any] = [
            "conversationId": conversationId,
            "type": isVideo ? "video" : "audio"
        ]
        return try await withCheckedThrowingContinuation { continuation in
            var resumed = false
            socket.emitWithAck("call:initiate", payload).timingOut(after: 10) { items in
                guard !resumed else { return }
                resumed = true

                guard let response = items.first as? [String: Any] else {
                    continuation.resume(throwing: CallInitiateError.timeout)
                    return
                }
                guard let success = response["success"] as? Bool, success,
                      let data = response["data"] as? [String: Any],
                      let callId = data["callId"] as? String else {
                    let message = (response["error"] as? [String: Any])?["message"] as? String
                        ?? (response["error"] as? String)
                        ?? "unknown error"
                    continuation.resume(throwing: CallInitiateError.serverError(message))
                    return
                }

                let mode = data["mode"] as? String
                let rawServers = data["iceServers"] as? [[String: Any]] ?? []

                let servers: [SocketIceServer]
                do {
                    let serversData = try JSONSerialization.data(withJSONObject: rawServers)
                    servers = try JSONDecoder().decode([SocketIceServer].self, from: serversData)
                } catch {
                    // Sans serveurs ICE, l'appel ne peut pas s'établir : la
                    // cause exacte doit être exploitable.
                    Logger.socket.error("call ICE servers undecodable, call cannot be established: \(error.localizedDescription, privacy: .public)")
                    continuation.resume(throwing: CallInitiateError.malformedResponse)
                    return
                }

                let ttl = data["ttl"] as? Int
                continuation.resume(returning: CallInitiateAck(callId: callId, mode: mode, iceServers: servers, ttl: ttl))
            }
        }
    }

    public func emitCallJoin(callId: String) {
        socket?.emit("call:join", ["callId": callId])
    }

    /// Detailed outcome of an ACK-aware `call:join` — mirrors the gateway's
    /// `CallJoinAck` shape (`packages/shared/types/video-call.ts`) instead of
    /// collapsing it to a bare `Bool`. `endReason` carries the RAW server
    /// string (Prisma `CallSession.endReason`, populated only when
    /// `errorCode == "CALL_ENDED"`) — the SDK stays pure and does not map it;
    /// the app layer maps it via `CallEndReasonMapper`, same convention
    /// already used for `call:ended`/`call:missed`.
    public struct CallJoinAckResult: Sendable {
        public let joined: Bool
        public let errorCode: String?
        public let endReason: String?

        public init(joined: Bool, errorCode: String? = nil, endReason: String? = nil) {
            self.joined = joined
            self.errorCode = errorCode
            self.endReason = endReason
        }
    }

    /// ACK-aware join: emits `call:join` and awaits gateway confirmation (6 s
    /// timeout), returning the full ack (success + error detail) rather than
    /// just success. Use this on socket reconnect before sending room-scoped
    /// events (call:request-ice-servers, call:toggle-video) — the gateway
    /// guards those with `socket.rooms.has(ROOMS.call(callId))` which is only
    /// true after the async joinCall() DB work completes and socket.join()
    /// runs. Also lets a reconnect distinguish "the call already ended
    /// server-side while we were disconnected" (`errorCode == "CALL_ENDED"`)
    /// from a plain ACK timeout — see Vague 162.
    public func emitCallJoinWithAckDetailed(callId: String) async -> CallJoinAckResult {
        guard let socket else { return CallJoinAckResult(joined: false) }
        let payload: [String: Any] = ["callId": callId]
        return await withCheckedContinuation { continuation in
            var resumed = false
            // 6s (was 3s): the gateway only sends the success ACK AFTER
            // `joinCall` (Prisma transaction → 'connecting', TURN credential
            // generation, participant enrichment, C8 same-user socket eviction
            // via fetchSockets). Under load that work can exceed 3s, so a
            // slow-but-successful join was falsely reported `NOT ACKed`, firing
            // a redundant retry that burned the caller's ring budget → `missed`.
            // Still well under the 45s ring / 30s connect budget, even with the
            // one retry in joinCallRoomReliably.
            socket.emitWithAck("call:join", payload).timingOut(after: 6) { items in
                guard !resumed else { return }
                resumed = true
                let response = items.first as? [String: Any]
                let success = response?["success"] as? Bool ?? false
                let error = response?["error"] as? [String: Any]
                let errorCode = error?["code"] as? String
                let endReason = error?["endReason"] as? String
                continuation.resume(returning: CallJoinAckResult(
                    joined: success, errorCode: errorCode, endReason: endReason
                ))
            }
        }
    }

    /// Boolean-only convenience over `emitCallJoinWithAckDetailed` — kept for
    /// callers (e.g. the incoming-call cold-start join) that only care whether
    /// the room join succeeded, not why it didn't.
    public func emitCallJoinWithAck(callId: String) async -> Bool {
        await emitCallJoinWithAckDetailed(callId: callId).joined
    }

    public func emitCallLeave(callId: String) {
        socket?.emit("call:leave", ["callId": callId])
    }

    public func emitRequestIceServers(callId: String) {
        socket?.emit("call:request-ice-servers", ["callId": callId])
    }

    /// Informs the gateway the app entered background while a call is active.
    /// The gateway uses this to switch ringing delivery to VoIP push and extend
    /// its heartbeat tolerance window.
    public func emitCallBackgrounded(callId: String, participantId: String) {
        socket?.emit("call:backgrounded", ["callId": callId, "participantId": participantId])
    }

    /// Informs the gateway the app returned to foreground during an active call.
    /// Resets the heartbeat tolerance window and re-enables socket-based ringing.
    public func emitCallForegrounded(callId: String, participantId: String) {
        socket?.emit("call:foregrounded", ["callId": callId, "participantId": participantId])
    }

    /// Notifies the gateway (and, by relay, other participants) that the local
    /// screen capture state changed. Other participants receive
    /// `call:screen-capture-alert` so they can display a warning.
    public func emitCallScreenCaptureDetected(callId: String, participantId: String, isCapturing: Bool) {
        socket?.emit("call:screen-capture-detected", [
            "callId": callId,
            "participantId": participantId,
            "isCapturing": isCapturing
        ])
    }

    /// Emits a `call:analytics` event with aggregated call metrics at session end.
    /// Fire-and-forget — the gateway persists the summary for observability dashboards.
    public func emitCallAnalytics(callId: String, payload: [String: Any]) {
        var data = payload
        data["callId"] = callId
        socket?.emit("call:analytics", data)
    }

    /// Reports whether the app is in the FOREGROUND so the gateway can decide,
    /// per incoming call, between socket delivery (in-app banner) and a VoIP push
    /// (CallKit). A backgrounded iOS app keeps a live socket for ~45s but is
    /// suspended and can't ring from a socket event — without this signal the
    /// gateway thought it was reachable and never sent the VoIP push, so calls
    /// never rang when the app wasn't foreground. Emit on scenePhase transitions
    /// (and on connect) while the socket is still alive (`.inactive` fires before
    /// suspension).
    /// Last app foreground/background state declared by the app, replayed on every
    /// (re)connect (see the `.connect` handler). Defaults to `true` because the
    /// socket only ever connects while the app is foreground (iOS suspends it in
    /// background), so a fresh connection is foreground by definition.
    private var lastAppForeground = true

    public func emitAppForeground(_ foreground: Bool) {
        lastAppForeground = foreground
        socket?.emit("presence:app-state", ["foreground": foreground])
    }

    /// Émet `call:force-leave` pour la conversation donnée. Le gateway
    /// nettoie alors toute trace d'appel actif où l'utilisateur courant
    /// était participant (CallParticipant.leftAt = null) sans nécessiter
    /// le callId — utile en pré-flight avant `call:initiate` pour purger
    /// les zombies laissés par un crash, un kill app, ou un test antérieur
    /// dont le cleanup gateway n'a pas tourné. Idempotent : no-op si pas
    /// de zombie côté DB.
    public func emitCallForceLeave(conversationId: String) {
        socket?.emit("call:force-leave", ["conversationId": conversationId])
    }

    public func emitCallSignal(callId: String, type: String, payload: [String: Any]) {
        var signal: [String: Any] = ["type": type]
        for (key, value) in payload { signal[key] = value }
        socket?.emit("call:signal", ["callId": callId, "signal": signal])
    }

    /// PERF-004: Emit a `call:signal` and await the gateway ACK with a 3s
    /// timeout. Returns `true` once the gateway confirms the signal was
    /// relayed to the peer, `false` on timeout / no socket / server error.
    /// Used for the SDP answer path so CXAnswerCallAction.fulfill() only
    /// runs after the answer is on the wire — without this, CallKit would
    /// race the WebRTC signaling and the audio engine could start before
    /// the peer has received the answer.
    public func emitCallSignalWithAck(callId: String, type: String, payload: [String: Any]) async -> Bool {
        guard let socket else { return false }
        var signal: [String: Any] = ["type": type]
        for (key, value) in payload { signal[key] = value }
        return await withCheckedContinuation { continuation in
            var resumed = false
            socket.emitWithAck("call:signal", ["callId": callId, "signal": signal]).timingOut(after: 3) { items in
                guard !resumed else { return }
                resumed = true
                if let response = items.first as? [String: Any],
                   let success = response["success"] as? Bool {
                    continuation.resume(returning: success)
                } else if items.isEmpty {
                    continuation.resume(returning: false)
                } else {
                    continuation.resume(returning: false)
                }
            }
        }
    }

    public func emitCallToggleAudio(callId: String, enabled: Bool) {
        socket?.emit("call:toggle-audio", ["callId": callId, "enabled": enabled])
    }

    public func emitCallToggleVideo(callId: String, enabled: Bool) {
        socket?.emit("call:toggle-video", ["callId": callId, "enabled": enabled])
    }

    public func emitCallEnd(callId: String) {
        socket?.emit("call:end", ["callId": callId])
    }

    /// Refus explicite : `call:end` avec `reason: "rejected"`. Sans la raison,
    /// le gateway résout tout end pré-décroché en `missed` — fausse
    /// notification « appel manqué » chez le callee qui vient de refuser, et
    /// le refus tombe dans le filtre « manqués » du journal. Parité Android
    /// `emitEnd(callId, reason)` / web `handleRejectCall`.
    public func emitCallReject(callId: String) {
        socket?.emit("call:end", ["callId": callId, "reason": "rejected"])
    }

    /// Variante avec ACK du refus (parité `emitCallEndWithAck`, 2026-08-11) :
    /// émet `call:end {reason:"rejected"}` et attend confirmation du gateway
    /// (max 3s). Sans elle, un socket vu « connecté » au moment du refus
    /// pouvait perdre l'emit en vol — un blip qui s'auto-répare avant que
    /// `connectionState` n'observe la coupure — laissant l'appelant sonner
    /// jusqu'au timeout serveur pendant que le gateway résout `missed` au
    /// lieu de `rejected` (le mislabel que l'arc reject 2026-07-12 fermait
    /// déjà sur tous les autres chemins de refus).
    public func emitCallRejectWithAck(callId: String) async -> Bool {
        guard let socket else { return false }
        return await withCheckedContinuation { continuation in
            var resumed = false
            socket.emitWithAck("call:end", ["callId": callId, "reason": "rejected"]).timingOut(after: 3) { items in
                guard !resumed else { return }
                resumed = true
                if let response = items.first as? [String: Any],
                   let success = response["success"] as? Bool {
                    continuation.resume(returning: success)
                } else {
                    continuation.resume(returning: false)
                }
            }
        }
    }

    /// Variante avec ACK : émet `call:end` et attend confirmation du gateway
    /// (max 3s). Le gateway accepte et broadcast `call:ended` à tous les
    /// participants. Sans ACK le client ne sait pas si le peer a été notifié
    /// — symptôme : l'appelé reste bloqué en `.connecting` ou `.connected`
    /// alors que l'appelant a raccroché. Utiliser cette variante quand le
    /// client a un cycle de vie immédiat (raccrocher = vouloir confirmation
    /// avant de fermer le socket / quitter l'écran).
    public func emitCallEndWithAck(callId: String) async -> Bool {
        guard let socket else { return false }
        return await withCheckedContinuation { continuation in
            var resumed = false
            socket.emitWithAck("call:end", ["callId": callId]).timingOut(after: 3) { items in
                guard !resumed else { return }
                resumed = true
                if let response = items.first as? [String: Any],
                   let success = response["success"] as? Bool {
                    continuation.resume(returning: success)
                } else {
                    continuation.resume(returning: false)
                }
            }
        }
    }

    public func emitCallHeartbeat(callId: String) {
        socket?.emit("call:heartbeat", ["callId": callId])
    }

    /// Emits a final (isFinal=true only — callers must not send partials)
    /// local transcription segment. The gateway relays it, translated per
    /// listener's `systemLanguage`, as `call:translated-segment`.
    /// Signale aux autres participants que ce device vient d'activer
    /// (`active: true`) ou de fermer (`active: false`) son panneau de
    /// transcription — le gateway estampille l'émetteur et rediffuse à la
    /// room pour l'indicateur d'invitation. Fire-and-forget.
    public func emitCallTranscriptionActive(callId: String, active: Bool) {
        socket?.emit("call:transcription-active", [
            "callId": callId,
            "active": active
        ])
    }

    public func emitCallTranscriptionSegment(callId: String, segment: CallTranscriptionSegmentPayload) {
        socket?.emit("call:transcription-segment", [
            "callId": callId,
            "segment": [
                "id": segment.id,
                "text": segment.text,
                "speakerId": segment.speakerId,
                "startMs": segment.startMs,
                "endMs": segment.endMs,
                "isFinal": segment.isFinal,
                "confidence": segment.confidence,
                "language": segment.language,
                "capturedAtMs": segment.capturedAtMs
            ]
        ])
    }

    /// Report periodic call quality + cumulative data usage to the gateway. The
    /// last report before teardown carries the call totals, which the gateway
    /// persists on the CallSession so the call-summary message can surface
    /// "data spent · network quality". Fire-and-forget. `bytesSent`/`bytesReceived`
    /// are cumulative WebRTC counters; `level` is excellent|good|fair|poor.
    public func emitCallQualityReport(
        callId: String, level: String, rtt: Double, packetLoss: Double,
        bytesSent: Int, bytesReceived: Int, availableOutgoingBitrateBps: Int = 0,
        jitterMs: Double = 0
    ) {
        var stats: [String: Any] = [
            "level": level,
            "rtt": rtt,
            "packetLoss": packetLoss,
            "bytesSent": bytesSent,
            "bytesReceived": bytesReceived
        ]
        if availableOutgoingBitrateBps > 0 {
            stats["availableOutgoingBitrateBps"] = availableOutgoingBitrateBps
        }
        if jitterMs > 0 {
            stats["jitterMs"] = jitterMs
        }
        socket?.emit("call:quality-report", ["callId": callId, "stats": stats])
    }

    /// Notify the gateway that a local ICE restart is in progress (e.g. network
    /// handoff or connectivity loss). Fire-and-forget. The gateway updates the
    /// call DB status to `reconnecting` and suppresses premature cleanup.
    public func emitCallReconnecting(callId: String, participantId: String, attempt: Int) {
        socket?.emit("call:reconnecting", [
            "callId": callId,
            "participantId": participantId,
            "attempt": attempt
        ])
    }

    /// Notify the gateway that the ICE restart completed successfully and the
    /// call is active again. Fire-and-forget. Resets call DB status to `active`.
    public func emitCallReconnected(callId: String, participantId: String) {
        socket?.emit("call:reconnected", [
            "callId": callId,
            "participantId": participantId
        ])
    }

    // MARK: - Event Handlers

    private func setupEventHandlers() {
        guard let socket else { return }

        socket.on(clientEvent: .connect) { [weak self] _, _ in
            guard let self else { return }
            let wasReconnect = self.handleConnectionEstablished()

            DispatchQueue.main.async {
                self.isConnected = true
                self.connectionState = .connected
            }

            self.startHeartbeat()

            // CALL-FIX 2026-06-06 — replay the app foreground/background state on
            // every (re)connect so the gateway always knows whether to deliver
            // incoming calls via the in-app socket banner (foreground) or a VoIP
            // push / CallKit (background). The first connect fires before the app's
            // scenePhase emit lands, so without this replay the gateway would treat
            // a foreground app as unknown and push CallKit for the first call.
            self.socket?.emit("presence:app-state", ["foreground": self.lastAppForeground])

            // CALL-FIX 2026-06-06 — ask the gateway to replay any in-progress
            // (ringing) call so a user who comes online / opens the app mid-ring
            // sees the incoming banner immediately, instead of missing the call
            // that started while they were offline/backgrounded.
            self.socket?.emit("call:check-active")

            // Re-join all tracked conversations (active-first for fastest UX).
            for convId in self.roomsToRejoinOnConnect() {
                self.socket?.emit("conversation:join", ["conversationId": convId])
            }

            // Replay user-triggered translation requests that arrived during
            // the disconnect window. The gateway will route them to whichever
            // conversation rooms we just re-joined.
            self.flushBufferedTranslationRequests()

            if wasReconnect {
                Logger.socket.info("MessageSocket reconnected — re-joined \(self.joinedConversations.count) room(s)")
            } else {
                Logger.socket.info("MessageSocket connected")
            }
        }

        socket.on(clientEvent: .disconnect) { [weak self] _, _ in
            guard let self else { return }
            self.stopHeartbeat()
            DispatchQueue.main.async {
                self.isConnected = false
                if self.hadPreviousConnection {
                    self.connectionState = .reconnecting(attempt: 0)
                } else {
                    self.connectionState = .disconnected
                }
            }
            Logger.socket.info("MessageSocket disconnected")
        }

        socket.on(clientEvent: .reconnectAttempt) { [weak self] _, _ in
            guard let self else { return }
            self.reconnectAttempt += 1
            let attempt = self.reconnectAttempt
            DispatchQueue.main.async {
                self.connectionState = .reconnecting(attempt: attempt)
            }
            Logger.socket.info("MessageSocket reconnect attempt \(attempt)")
        }

        socket.on(clientEvent: .error) { data, _ in
            // Log but NEVER force a logout from a socket error. Loose string
            // matching on error payloads produced false positives that kicked
            // the user out on transient failures. Socket.IO's built-in
            // reconnect loop will retry; the APIClient 401 path (which calls
            // `AuthManager.handleUnauthorized`) is the only place that can
            // trigger a silent token refresh, and even that preserves the
            // session on failure.
            Logger.socket.error("MessageSocket error: \(data)")
        }

        // --- Heartbeat ACK — measure RTT ---
        socket.on("heartbeat:ack") { [weak self] data, _ in
            guard let self else { return }
            guard let payload = data.first as? [String: Any],
                  let serverTimeStr = payload["serverTime"] as? String else { return }
            // Compute RTT from latencyHintMs when available (server computed it from
            // clientTime we sent). Fall back to wall-clock if the field is absent.
            let rtt: Double
            if let hint = payload["latencyHintMs"] as? Double {
                rtt = hint * 2 // hint is one-way; double for round-trip
            } else {
                // No server-computed hint: approximate from current wall time vs serverTime.
                let isoFormatter = ISO8601DateFormatter()
                isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                if let serverDate = isoFormatter.date(from: serverTimeStr) {
                    rtt = abs(Date().timeIntervalSince(serverDate)) * 1000 // ms
                } else {
                    return
                }
            }
            Logger.socket.debug("heartbeat:ack RTT=\(rtt, format: .fixed(precision: 1))ms serverTime=\(serverTimeStr, privacy: .public)")
            self.connectionRTT.send(rtt)
        }

        // --- Message events ---

        socket.on("message:new") { [weak self] data, _ in
            guard let self else { return }
            // Phase A real-time instrumentation — log the socket arrival
            // BEFORE decoding so we capture the gateway → device delivery
            // latency cleanly (decoding is observable separately if needed).
            let recvAt = Date()
            let firstId = (data.first as? [String: Any])?["id"] as? String
            let firstCmid = (data.first as? [String: Any])?["clientMessageId"] as? String
            Logger.socket.info("perf:ios.notif.socket.message-new receivedAt=\(recvAt.timeIntervalSince1970, privacy: .public) serverId=\(firstId ?? "nil", privacy: .public) clientMessageId=\(firstCmid ?? "nil", privacy: .public)")
            self.decode(APIMessage.self, from: data) { [weak self] msg in
                self?.messageReceived.send(msg)
            }
        }

        socket.on("message:edited") { [weak self] data, _ in
            guard let self else { return }
            self.decode(APIMessage.self, from: data) { [weak self] msg in
                self?.messageEdited.send(msg)
            }
        }

        socket.on("message:deleted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageDeletedEvent.self, from: data) { [weak self] event in
                self?.messageDeleted.send(event)
            }
        }

        // Le canal de visibilité PERSONNELLE. La room est celle de
        // l'UTILISATEUR, pas du socket : l'appareil qui a émis la requête reçoit
        // l'événement lui aussi, et le retrait y est idempotent (il a déjà
        // retiré la bulle en optimiste).
        socket.on("message:hidden-for-me") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageHiddenForMeEvent.self, from: data) { [weak self] event in
                self?.messageHiddenForMe.send(event)
            }
        }

        // Le retour en vue. Même room (celle de l'UTILISATEUR), donc l'appareil
        // qui a émis la requête le reçoit aussi — et c'est sans conséquence : la
        // relecture qu'il déclenche est idempotente.
        socket.on("message:restored-for-me") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageRestoredForMeEvent.self, from: data) { [weak self] event in
                self?.messageRestoredForMe.send(event)
            }
        }

        socket.on("message:pinned") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessagePinnedEvent.self, from: data) { [weak self] event in
                self?.messagePinned.send(event)
            }
        }

        socket.on("message:unpinned") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageUnpinnedEvent.self, from: data) { [weak self] event in
                self?.messageUnpinned.send(event)
            }
        }

        // --- Reaction events ---

        // NOTE (Fix E5 — v1 limitation): realtime reaction events for messages NOT
        // currently held in the active conversation cache are silently dropped here.
        // When the user opens that conversation later, the server-persisted
        // `reactionSummary` on the Message document is the authoritative source of
        // truth and will reflect all reactions. Adding a dedicated reactions cache
        // store was evaluated (approach A) but deferred — the cross-conversation
        // realtime delta is low-value for v1 and the implementation cost is high.
        socket.on("reaction:added") { [weak self] data, _ in
            guard let self else { return }
            let recvAt = Date()
            let firstMsgId = (data.first as? [String: Any])?["messageId"] as? String
            let firstEmoji = (data.first as? [String: Any])?["emoji"] as? String
            Logger.socket.info("perf:ios.notif.socket.reaction-added receivedAt=\(recvAt.timeIntervalSince1970, privacy: .public) messageId=\(firstMsgId ?? "nil", privacy: .public) emoji=\(firstEmoji ?? "nil", privacy: .public)")
            self.decode(ReactionUpdateEvent.self, from: data) { [weak self] event in
                self?.reactionAdded.send(event)
            }
        }

        socket.on("reaction:removed") { [weak self] data, _ in
            guard let self else { return }
            let recvAt = Date()
            let firstMsgId = (data.first as? [String: Any])?["messageId"] as? String
            Logger.socket.info("perf:ios.notif.socket.reaction-removed receivedAt=\(recvAt.timeIntervalSince1970, privacy: .public) messageId=\(firstMsgId ?? "nil", privacy: .public)")
            self.decode(ReactionUpdateEvent.self, from: data) { [weak self] event in
                self?.reactionRemoved.send(event)
            }
        }

        // BUG2 A' — réactions par-image
        socket.on("attachment:reaction-added") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AttachmentReactionUpdateEvent.self, from: data) { [weak self] event in
                self?.attachmentReactionAdded.send(event)
            }
        }

        socket.on("attachment:reaction-removed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AttachmentReactionUpdateEvent.self, from: data) { [weak self] event in
                self?.attachmentReactionRemoved.send(event)
            }
        }

        // --- Typing events ---

        socket.on("typing:start") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TypingEvent.self, from: data) { [weak self] event in
                self?.typingStarted.send(event)
            }
        }

        socket.on("typing:stop") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TypingEvent.self, from: data) { [weak self] event in
                self?.typingStopped.send(event)
            }
        }

        // --- Unread events ---

        socket.on("conversation:unread-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(UnreadUpdateEvent.self, from: data) { [weak self] event in
                self?.unreadUpdated.send(event)
            }
        }

        // --- User status events ---

        socket.on("user:status") { [weak self] data, _ in
            guard let self else { return }
            self.decode(UserStatusEvent.self, from: data) { [weak self] event in
                self?.userStatusChanged.send(event)
            }
        }

        // --- Presence snapshot (emitted by gateway right after auth) ---
        // Le gateway envoie un seul payload `{ users: [...] }` rassemblant tous
        // les contacts du nouvel arrivant avec leur statut runtime. Le client
        // doit hydrater son store en bulk plutôt que d'attendre des transitions
        // d'état spontanées. Voir gateway `_emitPresenceSnapshot`.
        socket.on("presence:snapshot") { [weak self] data, _ in
            guard let self else { return }
            self.decode(PresenceSnapshotEvent.self, from: data) { [weak self] event in
                self?.presenceSnapshotReceived.send(event)
            }
        }

        // --- Translation events ---

        socket.on("message:translation") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TranslationEvent.self, from: data) { [weak self] event in
                self?.translationReceived.send(event)
            }
        }

        // --- Transcription events ---

        socket.on("audio:transcription-ready") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TranscriptionReadyEvent.self, from: data) { [weak self] event in
                self?.transcriptionReady.send(event)
            }
        }

        // --- Audio translation events ---

        socket.on("audio:translation-ready") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AudioTranslationEvent.self, from: data) { [weak self] event in
                self?.audioTranslationReady.send(event)
            }
        }

        socket.on("audio:translations-progressive") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AudioTranslationEvent.self, from: data) { [weak self] event in
                self?.audioTranslationProgressive.send(event)
            }
        }

        socket.on("audio:translations-completed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AudioTranslationEvent.self, from: data) { [weak self] event in
                self?.audioTranslationCompleted.send(event)
            }
        }

        // --- Translation / audio / transcription failure events ---

        socket.on("translation:failed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TranslationFailedEvent.self, from: data) { [weak self] event in
                self?.translationFailed.send(event)
            }
        }

        socket.on("audio:translation-failed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AudioTranslationFailedEvent.self, from: data) { [weak self] event in
                self?.audioTranslationFailed.send(event)
            }
        }

        socket.on("audio:transcription-failed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TranscriptionFailedEvent.self, from: data) { [weak self] event in
                self?.transcriptionFailed.send(event)
            }
        }

        socket.on("auth:token-expired") { _, _ in
            Logger.socket.info("MessageSocket: auth token expired — triggering refresh")
            Task { @MainActor in
                AuthManager.shared.handleUnauthorized()
            }
        }

        // Le serveur a REVOQUE la session (mot de passe change, revocation de
        // tous les appareils, action admin) puis coupe la socket. Surtout PAS
        // `handleUnauthorized()` comme la ligne au-dessus : son
        // `refreshSession(force:)` obtiendrait un JWT neuf — `/auth/refresh` ne
        // verifie pas que la session existe encore — et re-armerait pour 24 h
        // la session qu'on vient de revoquer. La charge (`code`/`message`/
        // `reason`) n'est pas decodee : aucune surface iOS ne l'affiche.
        socket.on("auth:session-revoked") { _, _ in
            Logger.socket.warning("MessageSocket: session revoked — forcing re-authentication")
            Task { @MainActor in
                AuthManager.shared.handleSessionRevoked()
            }
        }

        // --- Read status events ---

        socket.on("read-status:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ReadStatusUpdateEvent.self, from: data) { [weak self] event in
                self?.readStatusUpdated.send(event)
            }
        }

        socket.on("attachment-status:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AttachmentStatusUpdatedEvent.self, from: data) { [weak self] event in
                self?.attachmentStatusUpdated.send(event)
            }
        }

        socket.on("message:attachment-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AttachmentUpdatedEvent.self, from: data) { [weak self] event in
                self?.attachmentUpdated.send(event)
            }
        }

        socket.on("message:consumed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageConsumedEvent.self, from: data) { [weak self] event in
                self?.messageConsumed.send(event)
            }
        }

        // --- Conversation participation events ---

        socket.on("conversation:joined") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationParticipationEvent.self, from: data) { [weak self] event in
                self?.conversationJoined.send(event)
            }
        }

        socket.on("conversation:join-error") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationJoinErrorEvent.self, from: data) { [weak self] event in
                self?.conversationJoinError.send(event)
            }
        }

        socket.on("conversation:left") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationParticipationEvent.self, from: data) { [weak self] event in
                self?.conversationLeft.send(event)
            }
        }

        // --- Participant role events ---

        socket.on("participant:role-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ParticipantRoleUpdatedEvent.self, from: data) { [weak self] event in
                self?.participantRoleUpdated.send(event)
            }
        }

        socket.on("participant:rights-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ParticipantRightsUpdatedEvent.self, from: data) { [weak self] event in
                self?.participantRightsUpdated.send(event)
            }
        }

        socket.on("conversation:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationUpdatedEvent.self, from: data) { [weak self] event in
                self?.conversationUpdated.send(event)
            }
        }

        socket.on("conversation:participant-joined") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ParticipantJoinedEvent.self, from: data) { [weak self] event in
                self?.participantJoined.send(event)
            }
        }

        socket.on("conversation:participant-left") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ParticipantLeftEvent.self, from: data) { [weak self] event in
                self?.participantSelfLeft.send(event)
            }
        }

        socket.on("conversation:participant-banned") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ParticipantBannedEvent.self, from: data) { [weak self] event in
                self?.participantBanned.send(event)
            }
        }

        socket.on("conversation:participant-unbanned") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ParticipantUnbannedEvent.self, from: data) { [weak self] event in
                self?.participantUnbanned.send(event)
            }
        }

        socket.on("conversation:closed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationClosedEvent.self, from: data) { [weak self] event in
                self?.conversationClosed.send(event)
            }
        }

        socket.on("user:preferences-updated") { [weak self] data, _ in
            guard let self else { return }
            // One event name, two payload scopes (the gateway emits a union):
            //   conversation scope: { userId, conversationId, version, reset, preferences }
            //   category scope:     { userId, category }
            // Discriminate on `conversationId` so each lands on the right
            // publisher — the conversation scope feeds the versioned
            // `ConversationStore` path, the category scope the legacy flat path.
            if let dict = data.first as? [String: Any], dict["conversationId"] is String {
                self.decode(UserPreferencesConversationUpdatedSocketEvent.self, from: data) { [weak self] event in
                    self?.userPreferencesConversationUpdated.send(event)
                }
            } else {
                self.decode(UserPreferencesUpdatedEvent.self, from: data) { [weak self] event in
                    self?.userPreferencesUpdated.send(event)
                }
            }
        }

        socket.on("user:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(UserUpdatedEvent.self, from: data) { [weak self] event in
                self?.userUpdated.send(event)
            }
        }

        socket.on("user:preferences-reordered") { [weak self] data, _ in
            guard let self else { return }
            self.decode(UserPreferencesReorderedSocketEvent.self, from: data) { [weak self] event in
                self?.userPreferencesReordered.send(event)
            }
        }

        socket.on("conversation:deleted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationDeletedSocketEvent.self, from: data) { [weak self] event in
                self?.conversationDeleted.send(event)
            }
        }

        socket.on("category:created") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CategorySocketEvent.self, from: data) { [weak self] event in
                self?.categoryCreated.send(event)
            }
        }

        socket.on("category:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CategorySocketEvent.self, from: data) { [weak self] event in
                self?.categoryUpdated.send(event)
            }
        }

        socket.on("category:deleted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CategoryDeletedSocketEvent.self, from: data) { [weak self] event in
                self?.categoryDeleted.send(event)
            }
        }

        socket.on("categories:reordered") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CategoriesReorderedSocketEvent.self, from: data) { [weak self] event in
                self?.categoriesReordered.send(event)
            }
        }

        socket.on("conversation:stats") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationStatsEvent.self, from: data) { [weak self] event in
                self?.conversationStatsReceived.send(event)
            }
        }

        // --- Location events ---

        socket.on("location:live-started") { [weak self] data, _ in
            guard let self else { return }
            self.decode(LiveLocationStartedEvent.self, from: data) { [weak self] event in
                self?.liveLocationStarted.send(event)
            }
        }

        socket.on("location:live-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(LiveLocationUpdatedEvent.self, from: data) { [weak self] event in
                self?.liveLocationUpdated.send(event)
            }
        }

        socket.on("location:live-stopped") { [weak self] data, _ in
            guard let self else { return }
            self.decode(LiveLocationStoppedEvent.self, from: data) { [weak self] event in
                self?.liveLocationStopped.send(event)
            }
        }

        // --- Conversation discovery events ---

        socket.on("conversation:new") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationNewEvent.self, from: data) { [weak self] event in
                self?.conversationNew.send(event)
            }
        }

        // --- Notification events ---

        socket.on("notification:new") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketNotificationEvent.self, from: data) { [weak self] event in
                // SyncEngine A5 — observe le `_seq` per-user (pilote). Le gap
                // détecté est tracké ; le déclenchement d'une resync sur gap
                // est câblé en A5.2. `observe(nil)` (gateway antérieur) = no-op.
                Task { await SyncSeqTracker.shared.observe(event.seq) }
                self?.notificationReceived.send(event)
            }
        }

        // Intentionally NOT listening for the legacy `"notification"` event
        // here. The gateway only emits `notification:new` (see
        // `NotificationService.createNotification` → `SERVER_EVENTS.NOTIFICATION_NEW`).
        // Keeping a parallel `"notification"` listener that funneled into
        // the same `notificationReceived` subject was a latent
        // double-delivery vector — if any future gateway change emitted
        // both, every notification would arrive twice on iOS and surface
        // duplicate toasts. Single channel keeps the contract obvious.

        socket.on("notification:read") { [weak self] data, _ in
            guard let self else { return }
            self.decode(NotificationReadEvent.self, from: data) { [weak self] event in
                self?.notificationRead.send(event)
            }
        }

        socket.on("notification:deleted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(NotificationDeletedEvent.self, from: data) { [weak self] event in
                self?.notificationDeleted.send(event)
            }
        }

        socket.on("notification:counts") { [weak self] data, _ in
            guard let self else { return }
            self.decode(NotificationCountsEvent.self, from: data) { [weak self] event in
                self?.notificationCounts.send(event)
            }
        }

        socket.on("notification:read-bulk") { [weak self] data, _ in
            guard let self else { return }
            self.decode(NotificationReadBulkEvent.self, from: data) { [weak self] event in
                self?.notificationReadBulk.send(event)
            }
        }

        socket.on("notification:deleted-bulk") { [weak self] data, _ in
            guard let self else { return }
            self.decode(NotificationDeletedBulkEvent.self, from: data) { [weak self] event in
                self?.notificationDeletedBulk.send(event)
            }
        }

        // --- Friend request lifecycle events ---

        socket.on("friend-request:cancelled") { [weak self] data, _ in
            guard let self else { return }
            self.decode(FriendRequestCancelledEvent.self, from: data) { event in
                Task { await MessageSocketManager.applyFriendRequestWithdrawal(otherUserId: event.cancelledBy) }
            }
        }

        socket.on("friend-request:rejected") { [weak self] data, _ in
            guard let self else { return }
            self.decode(FriendRequestRejectedEvent.self, from: data) { event in
                Task { await MessageSocketManager.applyFriendRequestRejection(rejecterId: event.rejecterId) }
            }
        }

        // --- Mention events ---

        socket.on("mention:created") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MentionCreatedEvent.self, from: data) { [weak self] event in
                self?.mentionCreated.send(event)
            }
        }

        // --- Call signaling events ---

        socket.on("call:initiated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallOfferData.self, from: data) { [weak self] event in
                self?.callOfferReceived.send(event)
            }
        }

        socket.on("call:signal") { [weak self] data, _ in
            guard let self else { return }
            guard let first = data.first as? [String: Any],
                  let signalDict = first["signal"] as? [String: Any],
                  let signalType = signalDict["type"] as? String else { return }

            switch signalType {
            case "offer":
                self.decode(CallAnswerData.self, from: data) { [weak self] event in
                    self?.callSignalOfferReceived.send(event)
                }
            case "answer":
                self.decode(CallAnswerData.self, from: data) { [weak self] event in
                    self?.callAnswerReceived.send(event)
                }
            case "ice-candidate":
                self.decode(CallICECandidateData.self, from: data) { [weak self] event in
                    self?.callICECandidateReceived.send(event)
                }
            default:
                Logger.socket.info("Unknown call signal type: \(signalType)")
            }
        }

        socket.on("call:ended") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallEndData.self, from: data) { [weak self] event in
                // Le replay (matché par callId) est inerte une fois l'appel
                // fini ; on libère quand même l'événement bufferisé pour ne
                // pas retenir le dernier payload participant à vie.
                self?.lastCallParticipantJoined = nil
                self?.callEnded.send(event)
            }
        }

        // Audit P1-25 — register the dedicated `call:missed` listener.
        // Gateway emits this event in addition to `call:ended` when the
        // ringing timeout fires and the callee never answered, so the iOS
        // UI can surface a missed-call state explicitly instead of having
        // to infer it from `endedBy != self`.
        socket.on("call:missed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallMissedData.self, from: data) { [weak self] event in
                self?.callMissed.send(event)
            }
        }

        // Audit P1-27 — `call:already-answered` fires on the user's OTHER
        // sockets when one of their devices joins the call. We surface this
        // so the receiving devices can dismiss their ringing CallKit card
        // with .answeredElsewhere instead of staying frozen indefinitely.
        socket.on("call:already-answered") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallAlreadyAnsweredData.self, from: data) { [weak self] event in
                self?.callAlreadyAnswered.send(event)
            }
        }

        socket.on("call:participant-joined") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallParticipantData.self, from: data) { [weak self] event in
                guard let self else { return }
                // CALL-FIX 2026-06-06 — buffer the last event. The initiator sets up
                // its `callParticipantJoined` listener only AFTER the call:initiate
                // ACK; if the callee was already in the call room (socket churn /
                // re-join / rapid retry) the gateway emits participant-joined BEFORE
                // the listener subscribes, and a PassthroughSubject doesn't replay →
                // the offer is never created → 45s ring timeout. The listener replays
                // this buffered value by callId.
                self.lastCallParticipantJoined = event
                self.callParticipantJoined.send(event)
            }
        }

        socket.on("call:participant-left") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallParticipantData.self, from: data) { [weak self] event in
                self?.callParticipantLeft.send(event)
            }
        }

        socket.on("call:media-toggled") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallMediaToggleData.self, from: data) { [weak self] event in
                self?.callMediaToggled.send(event)
            }
        }

        socket.on("call:error") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallErrorData.self, from: data) { [weak self] event in
                self?.callError.send(event)
            }
        }

        socket.on("call:ice-servers-refreshed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallIceServersRefreshedData.self, from: data) { [weak self] event in
                self?.callIceServersRefreshed.send(event)
            }
        }

        socket.on("call:quality-alert") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallQualityAlertData.self, from: data) { [weak self] event in
                self?.callQualityAlert.send(event)
            }
        }

        socket.on("call:screen-capture-alert") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallScreenCaptureAlertData.self, from: data) { [weak self] event in
                self?.callScreenCaptureAlert.send(event)
            }
        }

        socket.on("call:force-leave") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallForcedLeaveData.self, from: data) { [weak self] event in
                self?.callForcedLeave.send(event)
            }
        }

        socket.on("call:translated-segment") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallTranslatedSegmentData.self, from: data) { [weak self] event in
                self?.callTranslatedSegmentReceived.send(event)
            }
        }

        socket.on("call:transcription-active") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallTranscriptionActiveData.self, from: data) { [weak self] event in
                self?.callTranscriptionActiveReceived.send(event)
            }
        }

    }

    // MARK: - Friend request lifecycle

    /// `friend-request:cancelled` ne porte que `{friendRequestId, cancelledBy}`
    /// et ne dit PAS de quel cote se trouve le lecteur — l'evenement part a
    /// l'user-room de l'AUTRE partie, donc `cancelledBy` est l'interlocuteur,
    /// que la demande ait ete emise ou recue. On retire dans les DEUX sens :
    /// chacune des deux methodes est un no-op quand la cle est absente.
    ///
    /// Muter `FriendshipCache` ne repeint PAS l'ecran Demandes : ses lignes
    /// viennent de GRDB (`PersistenceKeys.receivedRequests` / `sentRequests`),
    /// qui resterait `.fresh` avec la ligne retiree. D'ou l'invalidation
    /// EXPLICITE — `notifyChange()` ne fait qu'incrementer `version`.
    static func applyFriendRequestWithdrawal(otherUserId: String) async {
        FriendshipCache.shared.didCancelRequest(to: otherUserId)
        FriendshipCache.shared.didRejectRequest(from: otherUserId)
        await FriendshipCache.shared.invalidatePersistedFriendCaches()
    }

    /// `friend-request:rejected` arrive chez l'EXPEDITEUR d'origine : sa demande
    /// vit dans `_sentPending`, que `didCancelRequest(to:)` vide.
    /// `didRejectRequest(from:)` viderait `_receivedPending` — mauvaise
    /// direction, no-op garanti.
    static func applyFriendRequestRejection(rejecterId: String) async {
        FriendshipCache.shared.didCancelRequest(to: rejecterId)
        await FriendshipCache.shared.invalidatePersistedFriendCaches()
    }

    // MARK: - Decode Helper

    /// Shared, pre-configured decoder. Used ONLY on `decodeQueue` (serial), so a
    /// single reused instance is race-free and avoids allocating a decoder plus
    /// wiring its date strategy on every realtime event.
    private static let socketDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            if let date = MessageSocketManager.isoFormatterWithFractional.date(from: dateStr) { return date }
            if let date = MessageSocketManager.isoFormatterBasic.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateStr)")
        }
        return decoder
    }()

    /// Serial so payloads decode in arrival order, off the main thread.
    private static let decodeQueue = DispatchQueue(label: "me.meeshy.socket.decode", qos: .userInitiated)

    private nonisolated func decode<T: Decodable & Sendable>(_ type: T.Type, from data: [Any], handler: @escaping @Sendable (T) -> Void) {
        guard let first = data.first else {
            Logger.socket.error("decode DROP type=\(String(describing: type), privacy: .public) reason=empty-payload")
            return
        }

        // Socket.IO's handle queue defaults to MAIN, so doing the JSONDecoder work
        // inline parsed every realtime event (message / reaction / receipt …) on
        // the main thread — visible CPU on busy conversations. Serialise the dict
        // here (cheap), then decode off-main on a serial queue that preserves
        // arrival order; the handler still lands on main.
        let jsonData: Data
        if let dict = first as? [String: Any] {
            do {
                jsonData = try JSONSerialization.data(withJSONObject: dict)
            } catch {
                Logger.socket.error("decode DROP type=\(String(describing: type), privacy: .public) reason=reserialize-failed: \(error.localizedDescription, privacy: .public)")
                return
            }
        } else if let str = first as? String {
            jsonData = Data(str.utf8)
        } else {
            Logger.socket.error("decode DROP type=\(String(describing: type), privacy: .public) reason=unexpected-payload-shape")
            return
        }

        // Capture only the (Sendable) key names so a decode failure can still log
        // them off-main, without retaining the non-Sendable payload dictionary.
        let payloadKeys: [String] = (first as? [String: Any]).map { Array($0.keys) } ?? []

        Self.decodeQueue.async {
            do {
                let decoded = try Self.socketDecoder.decode(type, from: jsonData)
                DispatchQueue.main.async { handler(decoded) }
            } catch {
                if payloadKeys.isEmpty {
                    Logger.socket.error("decode FAILED type=\(String(describing: type)): \(error)")
                } else {
                    let keys = payloadKeys.sorted().joined(separator: ", ")
                    Logger.socket.error("decode FAILED type=\(String(describing: type)): \(error) — keys: [\(keys)]")
                }
            }
        }
    }
}
