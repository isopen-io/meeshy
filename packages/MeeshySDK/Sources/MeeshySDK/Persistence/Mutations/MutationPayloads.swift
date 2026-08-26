import Foundation

/// Wave 1 Task 3.2 — payload structs for non-message offline mutations.
///
/// Each payload is `Codable & Sendable & Equatable` and embeds
/// `clientMutationId` (the dedup key shared with the gateway `MutationLog`,
/// Task 3.3). One file, many structs, because:
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

/// R6 — payload du kind `.markStoryViewed` : le « vu » d'une story survit à
/// un kill/offline et se rejoue au reconnect. `storyId` sert aussi d'anchor
/// de coalescing (latest-wins par story).
public struct MarkStoryViewedPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let storyId: String

    public init(clientMutationId: String, storyId: String) {
        self.clientMutationId = clientMutationId
        self.storyId = storyId
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

    public init(clientMutationId: String, targetUserId: String) {
        self.clientMutationId = clientMutationId
        self.targetUserId = targetUserId
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

// MARK: - Posts & comments

public struct CreatePostPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let content: String
    public let attachmentIds: [String]
    /// `"public" | "friends" | "community:<id>"` — kept as free-form string to
    /// avoid coupling the offline payload to backend enum churn.
    public let visibility: String
    /// Source language of `content`, forwarded to the gateway so the Prisme
    /// translation pipeline detects the right source. `nil` lets the gateway
    /// auto-detect. Optional so older persisted rows (pre-U1 ST3) decode as nil.
    public let originalLanguage: String?
    /// U1b — local media file paths (stored relative to the pending-media dir,
    /// resolved via `OfflineQueue.absoluteMediaPath(forStored:)`) for an OFFLINE
    /// media post: the dispatcher uploads them via TUS on reconnect, then creates
    /// the post with the resulting ids (+ any already-uploaded `attachmentIds`).
    /// `nil`/empty = text-only or already-uploaded post. Optional so older
    /// persisted rows decode as nil. Mirrors message media durability (S7b/S8).
    public let localMediaPaths: [String]?
    /// Server-side post type (`"POST" | "REEL" | "STATUS" | …`), forwarded to the
    /// gateway so an OFFLINE create lands on the right surface — a video /
    /// multi-image post created offline becomes a `REEL` exactly like the online
    /// path (`ReelComposition.defaultType`), and a mood becomes a `STATUS`.
    /// `nil` = the gateway default (`POST`). Optional so older persisted rows
    /// (pre-reel-offline) decode as nil and keep replaying as plain posts.
    public let type: String?
    /// STATUS/mood emoji (`type == "STATUS"`). Optional + ignored by the gateway
    /// for non-status types. Carried here so a mood survives offline durably via
    /// the same `.createPost` row as posts/reels.
    public let moodEmoji: String?
    /// Already-uploaded audio URL for an audio STATUS. `nil` for text/visual.
    public let audioUrl: String?
    /// Duration (seconds) of `audioUrl`. `nil` when there is no audio.
    public let audioDuration: Int?
    /// Explicit recipient ids for `EXCEPT` / `ONLY` visibility (and audience
    /// scoping for statuses). `nil` for the public/friends default.
    public let visibilityUserIds: [String]?
    /// Task 17 — lieu partagé en attente d'envoi. `nil` pour l'immense
    /// majorité des posts — porté ici pour que le chemin durable (outbox)
    /// transporte la position exactement comme le chemin direct
    /// (`PostService.create`), au lieu de la perdre au flush après un envoi
    /// hors-ligne. Optionnel : un enregistrement persisté avant Task 17
    /// décode toujours sans cette clé.
    public let location: SharedPlace?
    /// Les personnes que l'auteur a nommées SANS les écrire (note sous le
    /// contenu, métadonnée silencieuse). `nil` — et jamais `[]` — quand il n'en
    /// a déclaré aucune : le serveur relit alors le texte lui-même.
    ///
    /// Porté ici pour la même raison que `location` : un post TEXTE, le cas le
    /// plus courant de l'app, ne passe jamais par `PostService.create` mais par
    /// cette file. Une déclaration absente du payload persisté serait perdue au
    /// premier redémarrage — et silencieusement, même en ligne.
    public let mentions: [PostMentionInput]?
    /// Le SECOND opt-in de position (spec du 2026-08-02 §2) : le grain de
    /// découvrabilité géographique DEMANDÉ au serveur, indépendant du badge
    /// gouverné par `location` ci-dessus.
    ///
    /// Porté ici pour la même raison que `location` et `mentions`, et c'est ici
    /// que cela compte le plus : un post TEXTE + lieu — le cas nominal de
    /// cette fonctionnalité — n'emprunte JAMAIS `PostService.create`, il part
    /// par cette file (`FeedViewModel.isDurableTextOnly`). Sans ce champ,
    /// l'utilisateur coche « trouvable à proximité », voit sa publication
    /// partir, et son consentement disparaît au flush — silencieusement, même
    /// en ligne.
    ///
    /// `nil` — le défaut — vaut « non découvrable » : le gateway laisse alors
    /// `geoPoint`/`geoPrecision` nuls. Optionnel aussi pour que toute ligne
    /// persistée avant ce champ continue de décoder.
    ///
    /// Rien ici n'arrondit `location` : la coordonnée est persistée puis
    /// envoyée telle qu'elle a été reçue, le serveur seul quantifie.
    public let discoverabilityPrecision: DiscoverabilityPrecision?
    /// La publication que celle-ci REPARTAGE. **Seul porteur de l'attribution
    /// dans cette charge** : il n'y a pas de `viaUsername` sur le fil, et il
    /// n'y en a jamais eu que le gateway lise — `CreatePostSchema` ne le
    /// déclare pas, et un `z.object()` écarte les clés inconnues en silence. Le
    /// « via @X » qu'un composer affiche est un fait LOCAL d'affichage, jamais
    /// une écriture. Ne pas rouvrir ce champ-là en croyant compléter celui-ci.
    ///
    /// Porté ici parce que le chemin HORS LIGNE de `StatusViewModel.setStatus`
    /// est le seul des deux à ne pas l'avoir : republier un mood sans réseau
    /// publiait un mood ORIGINAL, sans sa source — un contenu attribué à
    /// quelqu'un d'autre par omission. `nil` — le cas immensément majoritaire —
    /// vaut « publication d'origine ». Optionnel aussi pour que toute ligne
    /// persistée avant ce champ continue de décoder.
    public let repostOfId: String?
    /// La transcription faite SUR L'APPAREIL, telle que l'auteur l'a relue
    /// avant d'envoyer. Le gateway la persiste sur le premier `PostMedia` audio
    /// et **évite alors la re-transcription Whisper** (`PostService.createPost`).
    ///
    /// Sans elle ici, un vocal routé par la file durable arrivait sans son
    /// texte : le serveur re-transcrivait, le travail de l'appareil était jeté
    /// en silence, et le résultat pouvait différer de celui qui avait été
    /// affiché. C'est ce qui QUALIFIE un enregistrement, pas ce qui le compose
    /// — et c'est précisément ce genre de champ qu'un lot de convergence laisse
    /// derrière lui.
    ///
    /// Sa graphie est celle du serveur (`duration_ms`, `speaker_id`,
    /// `MobileTranscriptionSchema`) : elle est portée par les `CodingKeys` du
    /// type lui-même, jamais réécrite ici.
    public let mobileTranscription: MobileTranscriptionPayload?
    /// Le type MIME **DÉCLARÉ** de chaque fichier de `localMediaPaths`, aligné
    /// par INDEX sur lui. `nil` (ou un index absent) ⇒ le dispatcher le
    /// re-dérive de l'extension, ce qui est le comportement des lignes écrites
    /// avant ce champ.
    ///
    /// Il existe parce que l'extension NE SUFFIT PAS. La file relocalise les
    /// fichiers « extension préservée pour que le dispatcher en dérive le
    /// MIME » — un contrat qui tient tant que la table des extensions connaît
    /// le conteneur. Un vocal importé depuis Fichiers en `.caf` / `.aiff` /
    /// `.opus` retombait sur `application/octet-stream`, et le gateway ne
    /// reconnaît un média audio qu'à `mimeType.startsWith('audio/')` : le
    /// message partait sans sa transcription embarquée ET sans
    /// re-transcription. Le site d'envoi, LUI, connaissait le MIME depuis le
    /// début — il ne l'emportait simplement pas.
    ///
    /// C'est un champ de QUALIFICATION, pas de composition : il ne dit rien de
    /// ce que la publication CONTIENT, seulement de la façon dont ses octets
    /// doivent être annoncés. Un lot de convergence est exactement ce qui les
    /// laisse derrière.
    public let localMediaMimeTypes: [String]?

    /// Le MIME que ce média a DÉCLARÉ, ou `nil` si la ligne n'en portait pas
    /// (écrite avant ce champ, ou site d'envoi qui n'en connaît aucun).
    ///
    /// Un accès par index sur un tableau parallèle est une lecture hors bornes
    /// en puissance : la lire à UN endroit, ici, vaut mieux que de la répéter
    /// chez chaque consommateur.
    public func declaredMimeType(at index: Int) -> String? {
        guard let mimes = localMediaMimeTypes, mimes.indices.contains(index) else { return nil }
        return mimes[index]
    }

    public init(
        clientMutationId: String,
        content: String,
        attachmentIds: [String],
        visibility: String,
        originalLanguage: String? = nil,
        localMediaPaths: [String]? = nil,
        type: String? = nil,
        moodEmoji: String? = nil,
        audioUrl: String? = nil,
        audioDuration: Int? = nil,
        visibilityUserIds: [String]? = nil,
        location: SharedPlace? = nil,
        mentions: [PostMentionInput]? = nil,
        discoverabilityPrecision: DiscoverabilityPrecision? = nil,
        repostOfId: String? = nil,
        mobileTranscription: MobileTranscriptionPayload? = nil,
        localMediaMimeTypes: [String]? = nil
    ) {
        self.clientMutationId = clientMutationId
        self.content = content
        self.attachmentIds = attachmentIds
        self.visibility = visibility
        self.originalLanguage = originalLanguage
        self.localMediaPaths = localMediaPaths
        self.type = type
        self.moodEmoji = moodEmoji
        self.audioUrl = audioUrl
        self.audioDuration = audioDuration
        self.visibilityUserIds = visibilityUserIds
        self.location = location
        self.mentions = mentions
        self.discoverabilityPrecision = discoverabilityPrecision
        self.repostOfId = repostOfId
        self.mobileTranscription = mobileTranscription
        self.localMediaMimeTypes = localMediaMimeTypes
    }
}

public struct ToggleLikePostPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let postId: String
    /// `true` = like, `false` = unlike. Encoded explicitly (not as presence)
    /// so the offline replay is deterministic regardless of server state.
    public let liked: Bool
    /// Emoji de la réaction, `nil` pour un like simple.
    ///
    /// Une réaction à une story n'a pas de route à elle : elle emprunte
    /// `POST /posts/:id/like`, que le gateway journalise sous le même
    /// `kind: 'toggleLikePost'` qu'un like de post. Un `OutboxKind` dédié
    /// dupliquerait une mutation que le serveur traite déjà comme une seule —
    /// l'emoji est le seul élément qui manquait au voyage.
    ///
    /// Optionnel aussi pour les lignes DÉJÀ en file : encodées avant ce champ,
    /// elles doivent continuer à se décoder, sinon la mise à jour ferait perdre
    /// des mutations en attente.
    public let emoji: String?

    public init(clientMutationId: String, postId: String, liked: Bool, emoji: String? = nil) {
        self.clientMutationId = clientMutationId
        self.postId = postId
        self.liked = liked
        self.emoji = emoji
    }
}

public struct CreateCommentPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let postId: String
    public let parentCommentId: String?
    public let content: String
    /// Lieu partagé en attente d'envoi. `nil` pour l'immense majorité des
    /// commentaires — porté ici pour que le chemin durable (offline queue)
    /// transporte la position exactement comme le chemin direct.
    public let location: SharedPlace?
    /// Effets visuels du commentaire (bitmask) — porté par le chemin durable
    /// pour ne pas être perdu à l'enfilement, comme le chemin direct le porte.
    public let effectFlags: Int?

    public init(
        clientMutationId: String,
        postId: String,
        parentCommentId: String?,
        content: String,
        location: SharedPlace? = nil,
        effectFlags: Int? = nil
    ) {
        self.clientMutationId = clientMutationId
        self.postId = postId
        self.parentCommentId = parentCommentId
        self.content = content
        self.location = location
        self.effectFlags = effectFlags
    }
}

public struct DeleteCommentPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let commentId: String

    public init(clientMutationId: String, commentId: String) {
        self.clientMutationId = clientMutationId
        self.commentId = commentId
    }
}

public struct ToggleLikeCommentPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let commentId: String
    public let liked: Bool

    public init(clientMutationId: String, commentId: String, liked: Bool) {
        self.clientMutationId = clientMutationId
        self.commentId = commentId
        self.liked = liked
    }
}

// MARK: - Consommation d'un attachement

/// Point 7 — rapport de consommation d'un média, rendu durable.
///
/// Les six sites de lecture postaient jusqu'ici en `try?` inline : une écoute
/// hors-ligne, en avion ou dans un ascenseur était perdue sans trace. Le
/// rapport passe désormais par l'outbox, comme toute autre écriture.
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
