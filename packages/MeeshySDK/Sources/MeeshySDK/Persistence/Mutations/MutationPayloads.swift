import Foundation

/// Wave 1 Task 3.2 — payload structs for non-message offline mutations.
///
/// Each payload is `Codable & Sendable & Equatable` and embeds
/// `clientMutationId` (the dedup key shared with the gateway `MutationLog`,
/// Task 3.3). Few files, many structs (posts & comments live in
/// `PostMutationPayloads.swift`), because:
///   1. They share the same semantic role (offline mutation envelopes).
///   2. They're small (3-8 fields each) — splitting into 15 files would
///      scatter trivial types across the persistence dir.
///   3. The full contract is reviewable in one read alongside the matching
///      `OutboxKind` cases in `OutboxRecord.swift`.
///
/// When the gateway grows a matching DTO per kind (Task 3.5), the wire
/// shape MUST stay aligned with these structs — `JSONEncoder` is canonical.
/// Keep field names camelCase to match the rest of the iOS Codable surface;
/// the gateway-side TS types will use the same shape via `@meeshy/shared`.

// MARK: - Conversations & messages metadata

/// Payload du kind `.markStoryViewed` : le « vu » d'une story survit à
/// un kill/offline et se rejoue au reconnect. `storyId` sert aussi d'anchor
/// de coalescing (latest-wins par story).
///
/// La vue porte l'ENTRÉE du lecteur (provenance, origine d'un
/// listing). Gardées en chaînes BRUTES : une ligne écrite par une version plus
/// récente, avec une valeur que celle-ci ne connaît pas, se décode quand même
/// (la valeur inconnue se lit comme absente) ; une ligne antérieure n'a pas les
/// clés.
public struct MarkStoryViewedPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let storyId: String
    public let provenance: String?
    public let origin: String?

    public init(clientMutationId: String, storyId: String, entry: ContentEntry? = nil) {
        self.clientMutationId = clientMutationId
        self.storyId = storyId
        self.provenance = entry?.provenance.rawValue
        self.origin = entry?.origin?.rawValue
    }

    public var entry: ContentEntry? {
        guard let provenance = provenance.flatMap(ViewProvenance.init(rawValue:)) else { return nil }
        return ContentEntry(provenance: provenance, origin: origin.flatMap(OpenOrigin.init(rawValue:)))
    }
}

/// Les messages flamme-œil qu'un lecteur a vus puis quittés. Les
/// identifiants sont SERVEUR : la passerelle ne consomme que les lignes flamme-œil
/// reçues par l'appelant, un identifiant étranger est ignoré.
public struct ConsumeAfterReadPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let conversationId: String
    public let messageIds: [String]

    public init(clientMutationId: String = ClientMutationId.generate(), conversationId: String, messageIds: [String]) {
        self.clientMutationId = clientMutationId
        self.conversationId = conversationId
        self.messageIds = messageIds
    }
}

public struct MarkAsReadPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let conversationId: String

    /// Identifiants SERVEUR des messages réellement affichés.
    ///
    /// Optionnel à dessein : les enregistrements d'outbox déjà persistés ont été
    /// sérialisés sans ce champ, et le rendre obligatoire casserait leur
    /// décodage après mise à jour de l'app — les lectures en attente seraient
    /// perdues en silence. `nil` signifie « client non informé » et laisse le
    /// serveur sur son repli historique.
    ///
    /// Voir `docs/superpowers/specs/2026-07-24-read-exactness-design.md`.
    public let messageIds: [String]?

    /// Version linguistique affichée pendant que ce lot défilait — la résolution
    /// de la conversation, celle qui vaut par défaut pour chaque bulle.
    ///
    /// Optionnelle pour la même raison que `messageIds` : un enregistrement
    /// d'outbox sérialisé par une version antérieure ne la porte pas, et la
    /// rendre obligatoire perdrait ces lectures au décodage.
    public let language: String?

    /// EXCEPTIONS à `language`, par message. Sans traduction disponible, c'est
    /// l'ORIGINAL qui s'affiche : déclarer tout le lot dans la langue préférée
    /// mentirait là où l'auteur a précisément besoin de savoir.
    public let messageLanguages: [String: String]?

    /// Le lecteur a ATTEINT ce message, le plus récent de la conversation :
    /// il n'a plus de retard. Fait avancer le curseur de non-lus jusque-là,
    /// donc vide le badge côté serveur.
    ///
    /// Distinct de `messageIds`, et volontairement : « quels messages ai-je
    /// affichés » (accusés de lecture, coches bleues — exact, jamais gonflé) et
    /// « ai-je rattrapé mon retard » (badge) sont deux questions différentes.
    /// Descendre au dernier message d'une conversation à deux cents non-lus ne
    /// rend pas les cent quatre-vingt-dix intermédiaires lus ; ça rend bien la
    /// conversation rattrapée. Les gonfler ensemble mentirait à l'expéditeur.
    ///
    /// `nil` = l'appelant ne se prononce pas ; le curseur avance alors sur le
    /// seul préfixe contigu réellement lu.
    public let caughtUpToMessageId: String?

    public init(
        clientMutationId: String,
        conversationId: String,
        messageIds: [String]? = nil,
        language: String? = nil,
        messageLanguages: [String: String]? = nil,
        caughtUpToMessageId: String? = nil
    ) {
        self.clientMutationId = clientMutationId
        self.conversationId = conversationId
        self.messageIds = messageIds
        self.language = language
        self.messageLanguages = (messageLanguages?.isEmpty ?? true) ? nil : messageLanguages
        self.caughtUpToMessageId = caughtUpToMessageId
    }
}

public struct CreateConversationPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    /// One of `"direct" | "group" | "community"` — mirrors `CommonSchemas.conversationType`.
    public let type: String
    public let title: String?
    public let participantIds: [String]

    public init(
        clientMutationId: String,
        type: String,
        title: String?,
        participantIds: [String]
    ) {
        self.clientMutationId = clientMutationId
        self.type = type
        self.title = title
        self.participantIds = participantIds
    }
}

public struct UpdateConversationPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let conversationId: String
    public let title: String?
    public let description: String?
    public let avatarUrl: String?

    public init(
        clientMutationId: String,
        conversationId: String,
        title: String?,
        description: String?,
        avatarUrl: String?
    ) {
        self.clientMutationId = clientMutationId
        self.conversationId = conversationId
        self.title = title
        self.description = description
        self.avatarUrl = avatarUrl
    }
}

// MARK: - Social graph (friends, blocks)

public struct SendFriendRequestPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let targetUserId: String
    /// Le cran visé (#13938) : une ligne gravée avant ce champ se relit sans (`nil` = Ami).
    public let targetLevel: String?

    public init(clientMutationId: String, targetUserId: String, targetLevel: String? = nil) {
        self.clientMutationId = clientMutationId
        self.targetUserId = targetUserId
        self.targetLevel = targetLevel
    }
}

public struct RespondFriendRequestPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let friendRequestId: String
    public let action: Action

    public enum Action: String, Codable, Sendable {
        case accept
        case reject
    }

    public init(clientMutationId: String, friendRequestId: String, action: Action) {
        self.clientMutationId = clientMutationId
        self.friendRequestId = friendRequestId
        self.action = action
    }
}

public struct BlockUserPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let targetUserId: String

    public init(clientMutationId: String, targetUserId: String) {
        self.clientMutationId = clientMutationId
        self.targetUserId = targetUserId
    }
}

public struct UnblockUserPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let targetUserId: String

    public init(clientMutationId: String, targetUserId: String) {
        self.clientMutationId = clientMutationId
        self.targetUserId = targetUserId
    }
}

// MARK: - Self-service: profile + settings

public struct UpdateProfilePayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let displayName: String?
    public let bio: String?
    public let avatarUrl: String?

    public init(
        clientMutationId: String,
        displayName: String?,
        bio: String?,
        avatarUrl: String?
    ) {
        self.clientMutationId = clientMutationId
        self.displayName = displayName
        self.bio = bio
        self.avatarUrl = avatarUrl
    }
}

/// Wave 1 Phase C — the gateway exposes 7 preference categories (privacy,
/// audio, message, notification, video, document, application) at
/// `PUT|PATCH /me/preferences/{category}`. Instead of inflating
/// `OutboxKind` with 7 cases, a single `.updateSettings` row carries the
/// category alongside an opaque `body` JSON blob — the dispatcher routes
/// to the correct path by reading `payload.category`, and the gateway
/// dedup key is `updateSettings:${category}` so two categories with the
/// same cmid would still be distinct mutation log rows.
///
/// `body` is encoded once at enqueue time so we don't need to know the
/// concrete preference struct (PrivacyPreferences, AudioPreferences, …)
/// here — keeps the SDK payload layer category-agnostic.
public struct UpdateSettingsPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    /// One of `"privacy" | "audio" | "message" | "notification" | "video"
    /// | "document" | "application"` — matches the gateway category name.
    public let category: String
    /// JSON-encoded category body (e.g. encoded `PrivacyPreferences`).
    /// Stored as raw `Data` so the SDK doesn't need to know the concrete
    /// preference struct type at this layer.
    public let body: Data

    public init(
        clientMutationId: String,
        category: String,
        body: Data
    ) {
        self.clientMutationId = clientMutationId
        self.category = category
        self.body = body
    }
}

// MARK: - Stories

/// Wraps an existing `StoryOfflineQueueItem` by id so the outbox can adopt
/// story-publish without duplicating the slide-snapshot payload (which lives
/// in `StoryOfflineQueue` JSON file). When the queues merge (Tier C), this
/// shrinks to a pure pointer and the slide payload moves into `OutboxRecord.payload`.
public struct PublishStoryPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let offlineQueueItemId: String

    public init(clientMutationId: String, offlineQueueItemId: String) {
        self.clientMutationId = clientMutationId
        self.offlineQueueItemId = offlineQueueItemId
    }
}

public struct RepostStoryPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let originalStoryId: String
    /// `nil` = public repost ; non-nil = private repost into a conversation.
    public let targetConversationId: String?

    public init(
        clientMutationId: String,
        originalStoryId: String,
        targetConversationId: String?
    ) {
        self.clientMutationId = clientMutationId
        self.originalStoryId = originalStoryId
        self.targetConversationId = targetConversationId
    }
}

/// Fil rouge du repost (lot 7, tâche 7.5) — payload du kind `.repostPost`,
/// pour `POST /posts/:postId/repost` (repost PUBLIC, sur le fil). Distinct de
/// `RepostStoryPayload` (repost PRIVÉ dans une conversation, `targetConversationId`)
/// et de `CreatePostPayload` (porte 3 — `POST /posts { repostOfId }`, un autre
/// mécanisme serveur, cf. `PostService.repostPost` vs `PostService.createPost`).
public struct RepostPostPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    /// L'id du post/story/status source à reposter.
    public let postId: String
    /// Type CIBLE du repost (`"POST" | "STORY" | "STATUS" | "REEL"`, valeurs
    /// `PostType` côté gateway) — OBLIGATOIRE, jamais optionnel. Loi 5 (« le
    /// repost miroite ; changer de format est l'ancrage », spec
    /// 2026-08-23 §Loi 5) : le format doit être porté explicitement jusqu'au
    /// bout de la file, jamais laissé au repli serveur `?? PostType.POST`.
    /// C'est exactement ce repli qui, pour l'appelant historique sans
    /// `targetType`, transforme une story repartagée en post permanent sans
    /// que personne ne l'ait demandé.
    ///
    /// **Cet appelant historique EXISTE ENCORE** —
    /// `StoryService.repost(storyId:)` (`Services/StoryService.swift`), sans
    /// `targetType`, donc droit sur le repli. Il n'a aucun appelant de
    /// production (seul un test l'invoque) et il décode `[String: String]` là
    /// où la route rend un Post complet, donc il lève même quand le serveur
    /// réussit : mort ET menteur. Son retrait est une DETTE ouverte, pas un
    /// fait accompli — ne pas relire cette ligne comme si elle l'était.
    public let targetType: String
    /// Commentaire de citation (`isQuote == true`). `nil` pour un repost simple.
    public let content: String?
    public let isQuote: Bool
    /// Audience choisie par le reposteur. `nil` ⇒ le serveur hérite de
    /// l'audience de l'original (`PostService.repostPost`).
    public let visibility: String?

    public init(
        clientMutationId: String,
        postId: String,
        targetType: String,
        content: String? = nil,
        isQuote: Bool = false,
        visibility: String? = nil
    ) {
        self.clientMutationId = clientMutationId
        self.postId = postId
        self.targetType = targetType
        self.content = content
        self.isQuote = isQuote
        self.visibility = visibility
    }
}

// MARK: - Consommation d'un attachement

/// Rapport de consommation d'un média, rendu durable.
///
/// Un `try?` inline perdrait sans trace une écoute
/// hors-ligne, en avion ou dans un ascenseur : le
/// rapport passe par l'outbox, comme toute autre écriture.
///
/// ## Pourquoi ce kind ne se coalesce PAS
///
/// `markStoryViewed` se coalesce parce qu'un « vu » est binaire : le rejouer
/// deux fois ne dit rien de plus. Un rapport de consommation, lui, porte des
/// `stretches` DIFFÉRENTS à chaque fois — trois écoutes hors-ligne du même
/// audio sont trois passages distincts sur trois portions distinctes. Écraser
/// le rapport précédent par le suivant détruirait précisément ce que la trace
/// motivée existe pour préserver. Chaque rapport est donc conservé et rejoué
/// dans l'ordre ; le serveur accumule et dédoublonne par identité de segment.
public struct ReportAttachmentStatusPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let attachmentId: String
    /// `listened` | `watched` | `viewed` | `downloaded` — verbe attendu par la
    /// route gateway `POST /attachments/:id/status`.
    public let action: String
    public let playPositionMs: Int
    public let durationMs: Int
    public let complete: Bool
    public let wasZoomed: Bool?
    public let stretches: [PlaybackStretch]?
    /// Version linguistique consommée. `nil` quand le lecteur ne peut pas la
    /// déterminer — mieux vaut ne rien déclarer qu'inventer une langue.
    public let language: String?

    public init(
        clientMutationId: String,
        attachmentId: String,
        action: String,
        playPositionMs: Int,
        durationMs: Int,
        complete: Bool,
        wasZoomed: Bool? = nil,
        stretches: [PlaybackStretch]? = nil,
        language: String? = nil
    ) {
        self.clientMutationId = clientMutationId
        self.attachmentId = attachmentId
        self.action = action
        self.playPositionMs = playPositionMs
        self.durationMs = durationMs
        self.complete = complete
        self.wasZoomed = wasZoomed
        // Un tableau vide ne dirait rien au serveur et ferait voyager une clé
        // pour rien — même règle que `AttachmentStatusBody`.
        self.stretches = (stretches?.isEmpty ?? true) ? nil : stretches
        self.language = language
    }
}
