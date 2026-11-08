import Foundation
import MeeshySDK

// MARK: - toggleLikePost wire body

/// Corps de `POST /posts/:id/like` quand la ligne porte une RÉACTION (story) :
/// `{ emoji }`, la forme que `LikeSchema` lit côté gateway et que le chemin
/// direct émet déjà (`ReactionRequest`, `StoryInteractionService.react`). Un
/// like simple n'a pas d'emoji et garde son corps vide — le gateway retombe
/// alors sur son défaut, exactement comme avant ce champ.
/// `nonisolated` et `internal`, comme `MarkAsReadBody` : le dispatch hérite de
/// l'isolation de son appelant, et le contrat d'encodage se lit depuis
/// `MeeshyTests`.
nonisolated struct ToggleLikePostBody: Encodable {
    let emoji: String

    /// `nil` sans emoji : un like simple ne change pas de forme sur le fil.
    static func encoded(for payload: ToggleLikePostPayload) throws -> Data? {
        try payload.emoji.map { try JSONEncoder().encode(ToggleLikePostBody(emoji: $0)) }
    }
}

// MARK: - createComment wire body

/// Corps de `POST /posts/:postId/comments` — la forme que `CreateCommentSchema`
/// lit côté gateway, et l'ULTIME saut d'un commentaire rejoué depuis la file
/// durable.
///
/// Il vivait NESTÉ dans `dispatchCreateComment`, donc hors d'atteinte de tout
/// témoin : retirer une clé de cet encodeur ne faisait rougir nulle part, et le
/// voyage de la langue d'écriture (#6587) s'arrêtait au dernier mètre sans un
/// seul signal. Hissé au fichier, `nonisolated` et `internal` comme
/// `MarkAsReadBody` et `ToggleLikePostBody` — le dispatch hérite de l'isolation
/// de son appelant, et le contrat d'encodage se lit depuis `MeeshyTests`.
nonisolated struct CreateCommentBody: Encodable {
    let content: String
    let parentId: String?
    /// Lieu partagé — même clé `location` que le chemin direct
    /// (`PostService.addComment`), hissée par le gateway depuis
    /// `metadata.location`.
    let location: SharedPlace?
    let effectFlags: Int?
    /// Langue d'ÉCRITURE déclarée par l'auteur (#6587) — `CreateCommentSchema`
    /// l'accepte côté gateway, et `PostTranslationService.translateComment`
    /// ne retombe sur son heuristique de mots QUE si la clé est absente.
    /// Encodée en `encodeIfPresent` : une ligne gravée avant le champ rejoue
    /// sans la clé, donc sous le repli, exactement comme avant.
    let originalLanguage: String?
    /// **L'ANCRE du média cité** (#6578) — l'ULTIME saut d'une citation rejouée
    /// depuis la file durable. Le serveur attend un OBJET
    /// (`quotedPostMedia: { postMediaId }`) et REFUSE en 400 un média étranger
    /// au post commenté : encoder une chaîne plate ferait échouer l'envoi
    /// entier, pas seulement la citation.
    let quotedPostMediaId: String?
    /// Les médias du commentaire, DÉJÀ téléversés (#9743). `nil` quand il n'en
    /// porte aucun : la clé ne part pas, comme avant le champ.
    var attachmentIds: [String]? = nil
    var mobileTranscription: MobileTranscriptionPayload? = nil

    enum CodingKeys: String, CodingKey {
        case content, parentId, location, effectFlags, originalLanguage, quotedPostMedia
        case attachmentIds, mobileTranscription
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(content, forKey: .content)
        if let parentId { try container.encode(parentId, forKey: .parentId) }
        try container.encodeIfPresent(location, forKey: .location)
        try container.encodeIfPresent(effectFlags, forKey: .effectFlags)
        try container.encodeIfPresent(originalLanguage, forKey: .originalLanguage)
        // `encodeIfPresent` : une ligne gravée avant le champ rejoue SANS la
        // clé, donc exactement comme avant.
        try container.encodeIfPresent(
            quotedPostMediaId.map { CreateCommentRequest.QuotedPostMediaAnchor(postMediaId: $0) },
            forKey: .quotedPostMedia
        )
        try container.encodeIfPresent(attachmentIds, forKey: .attachmentIds)
        try container.encodeIfPresent(mobileTranscription, forKey: .mobileTranscription)
    }

    /// SEUL site qui traduit un `CreateCommentPayload` persisté en octets HTTP.
    static func encoded(for payload: CreateCommentPayload, attachmentIds: [String] = []) throws -> Data {
        try JSONEncoder().encode(CreateCommentBody(
            content: payload.content,
            parentId: payload.parentCommentId,
            location: payload.location,
            effectFlags: payload.effectFlags,
            originalLanguage: payload.originalLanguage,
            quotedPostMediaId: payload.quotedPostMediaId,
            attachmentIds: attachmentIds.isEmpty ? nil : attachmentIds,
            mobileTranscription: attachmentIds.isEmpty ? nil : payload.mobileTranscription
        ))
    }
}

// MARK: - updateProfile wire bodies

/// Wire body for `PATCH /users/me/avatar` — mirrors the online path's
/// `UserService.updateAvatar(url:)` body shape (`updateAvatarSchema` on the
/// gateway: `{ avatar: string }`).
nonisolated struct UpdateProfileAvatarBody: Encodable {
    let avatar: String
}

/// Corps de `POST /conversations/:id/mark-read` — les messages RÉELLEMENT
/// affichés. `MarkReadBodySchema` est `.strict()` côté gateway : toute clé non
/// déclarée rejette la requête ENTIÈRE en 400, ce qui perdrait aussi les
/// lectures légitimes du même lot. D'où un type qui ne porte que `messageIds`.
/// `internal` (et non `private`) pour que son contrat d'encodage soit
/// directement testable depuis `MeeshyTests`.
///
/// Voir `docs/superpowers/specs/2026-07-24-read-exactness-design.md`.
nonisolated struct MarkAsReadBody: Encodable {
    let messageIds: [String]

    /// Version linguistique affichée pendant que le lot défilait.
    var language: String?

    /// EXCEPTIONS à `language`, par message : sans traduction disponible, c'est
    /// l'ORIGINAL qui s'affiche. Restreintes au lot réellement envoyé — le
    /// gateway n'accepte que des identifiants qu'il vient de recevoir, une clé
    /// écartée par le plafond ferait rejeter le corps entier.
    var messageLanguages: [String: String]?

    /// Le lecteur a atteint ce message, le plus récent : le curseur de non-lus
    /// avance jusque-là et le badge tombe à zéro côté serveur. N'élargit PAS
    /// l'ensemble des messages marqués lus — cf. `MarkAsReadPayload`.
    var caughtUpToMessageId: String?

    /// Plafond accepté par le gateway.
    static let limit = 200

    /// Tronque en gardant les PLUS RÉCENTS : ce sont ceux que l'utilisateur
    /// vient de voir, et dépasser la borne ferait rejeter tout le lot.
    static func cap(_ ids: [String]) -> [String] {
        ids.count <= limit ? ids : Array(ids.suffix(limit))
    }

    /// Restreint les exceptions aux identifiants effectivement rapportés.
    static func scopedLanguages(
        _ table: [String: String]?,
        to reported: [String]
    ) -> [String: String]? {
        guard let table, !table.isEmpty else { return nil }
        let allowed = Set(reported)
        let scoped = table.filter { allowed.contains($0.key) }
        return scoped.isEmpty ? nil : scoped
    }
}

/// Wire body for `PATCH /users/me`. Deliberately has NO `avatar` property —
/// the gateway's `updateUserProfileSchema` (packages/shared/utils/validation.ts)
/// is `.strict()` and rejects any key it doesn't declare with a 400 that takes
/// down the WHOLE request, so an `avatar` key here previously blocked
/// displayName/bio from ever saving. `internal` (not `private`) so its
/// encoding contract is directly testable from `MeeshyTests`.
nonisolated struct UpdateProfileFieldsBody: Encodable {
    let displayName: String?
    let bio: String?

    enum CodingKeys: String, CodingKey { case displayName, bio }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        if let displayName { try container.encode(displayName, forKey: .displayName) }
        if let bio { try container.encode(bio, forKey: .bio) }
    }
}

nonisolated struct CreatePostBody: Encodable {
    let content: String?
    let mediaIds: [String]?
    let visibility: String
    let originalLanguage: String?
    /// Post type forwarded to `CreatePostSchema`. Omitted when nil so the
    /// gateway applies its `POST` default — keeps legacy rows (written
    /// before reel-offline carried no `type`) replaying as plain posts.
    let type: String?
    // STATUS/mood fields — only set for `type == "STATUS"` rows; omitted
    // (and ignored by the gateway) otherwise.
    let moodEmoji: String?
    let audioUrl: String?
    let audioDuration: Int?
    let visibilityUserIds: [String]?
    /// Task 17 — même clé top-level `location` que le chemin direct
    /// (`CreatePostRequest`, `PostService.create`) : sans elle ici, la
    /// position survivrait jusqu'au décodage de `CreatePostPayload` mais
    /// serait tout de même jetée en silence à l'ultime saut réseau.
    let location: SharedPlace?
    /// Les références DÉCLARÉES (note, silence) — même clé que le chemin
    /// direct. Sans elle, nommer quelqu'un dans un post TEXTE, le cas le plus
    /// courant de l'app, ne produirait rien : ces posts-là n'empruntent que
    /// ce chemin.
    let mentions: [PostMentionInput]?
    /// Le SECOND opt-in de position — même clé top-level `discoverabilityPrecision`
    /// que le chemin direct (`CreatePostRequest`). Sans elle ICI, le
    /// consentement survivrait jusqu'au décodage de `CreatePostPayload` puis
    /// serait jeté en silence à l'ultime saut réseau : exactement le défaut
    /// que `location` a payé avant lui, et sur le chemin que prend le cas
    /// nominal (post TEXTE + lieu).
    let discoverabilityPrecision: DiscoverabilityPrecision?
    /// La publication REPARTAGÉE — même clé top-level `repostOfId` que le
    /// chemin direct (`CreatePostRequest`). Sans elle ICI, l'attribution
    /// survivrait jusqu'au décodage de `CreatePostPayload` puis serait jetée en
    /// silence à l'ultime saut réseau : le défaut que `location` a payé avant
    /// elle. **Seul porteur de l'attribution** — pas de `viaUsername`, que le
    /// gateway n'a jamais lu.
    let repostOfId: String?
    /// La transcription faite SUR L'APPAREIL. Le gateway la persiste sur le
    /// premier `PostMedia` audio et évite alors la re-transcription Whisper.
    /// Sa graphie (`duration_ms`, `speaker_id`) est portée par les
    /// `CodingKeys` du type lui-même — ne pas la réécrire ici.
    let mobileTranscription: MobileTranscriptionPayload?
    /// **LE CANVAS** — même clé top-level `storyEffects` que le chemin direct
    /// (`CreatePostRequest`, `PostService.createCanvasPost`), et même schéma
    /// gateway (`CreatePostSchema`).
    ///
    /// Sans elle ICI, la scène survivait jusqu'au décodage de
    /// `CreatePostPayload` puis était jetée en silence à l'ultime saut réseau :
    /// exactement le défaut que `location`, `discoverabilityPrecision` et
    /// `repostOfId` ont payé avant elle, sur le chemin que prend **tout** post
    /// du meuble.
    ///
    /// > Trois champs ont déjà été perdus à ce même mètre du fil, et chacun
    /// > porte son commentaire disant pourquoi. Ce type est un INVENTAIRE
    /// > recopié à la main : rien n'y signale un champ absent — ni le
    /// > compilateur, ni le schéma, ni le serveur, qui publie sans lui.
    let storyEffects: StoryEffects?
    /// **Les LÉGENDES par média** — même clé top-level `mediaCaption` que le
    /// chemin direct (`CreatePostRequest`, `PostService.createCanvasPost`).
    /// Clée par `PostMedia.id`, la seule que le gateway reconnaisse : il filtre
    /// le reste sans rien dire.
    let mediaCaption: [String: String]?

    /// Le texte ALTERNATIF par média, keyé `PostMedia.id` — champ distinct de
    /// la légende dans `CreatePostSchema`, et jamais son repli.
    let mediaAlt: [String: String]?

    /// **L'autorisation d'extraction du son** (#3996) — même clé top-level
    /// `allowSoundExtraction` que le chemin direct (`CreatePostRequest`,
    /// `PostService.create`). Sans elle ICI, le choix de l'auteur survivait
    /// jusqu'au décodage de `CreatePostPayload` puis était jeté en silence à
    /// l'ultime saut réseau — exactement le défaut que `storyEffects` a payé
    /// avant lui, sur le chemin que prend tout post/réel du meuble.
    let allowSoundExtraction: Bool?

    /// La publication naît fermée aux commentaires (#16541) — le choix du
    /// composer, relu sur la ligne (`CreatePostPayload`). `nil` omet la clé.
    let commentsDisabled: Bool?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        if let content, !content.isEmpty { try container.encode(content, forKey: .content) }
        if let mediaIds, !mediaIds.isEmpty { try container.encode(mediaIds, forKey: .mediaIds) }
        try container.encode(visibility, forKey: .visibility)
        if let originalLanguage, !originalLanguage.isEmpty { try container.encode(originalLanguage, forKey: .originalLanguage) }
        if let type, !type.isEmpty { try container.encode(type, forKey: .type) }
        if let moodEmoji, !moodEmoji.isEmpty { try container.encode(moodEmoji, forKey: .moodEmoji) }
        if let audioUrl, !audioUrl.isEmpty { try container.encode(audioUrl, forKey: .audioUrl) }
        if let audioDuration { try container.encode(audioDuration, forKey: .audioDuration) }
        if let visibilityUserIds, !visibilityUserIds.isEmpty { try container.encode(visibilityUserIds, forKey: .visibilityUserIds) }
        if let location { try container.encode(location, forKey: .location) }
        // Vide vaut absent à la CRÉATION : il n'existe encore aucune ligne à
        // effacer, et le `[]` du tri-état n'a de sens qu'à l'édition.
        if let mentions, !mentions.isEmpty { try container.encode(mentions, forKey: .mentions) }
        // Encodé seulement quand il existe : le schéma gateway est un
        // `z.enum().optional()`, qui REJETTE un `null` explicite — et
        // l'ABSENCE de la clé vaut « non découvrable ».
        if let discoverabilityPrecision {
            try container.encode(discoverabilityPrecision, forKey: .discoverabilityPrecision)
        }
        // Encodés seulement quand ils existent : un post d'origine n'a pas de
        // source, un post visuel n'a pas de voix — et un `null` explicite est
        // une affirmation là où il n'y en a aucune.
        if let repostOfId, !repostOfId.isEmpty { try container.encode(repostOfId, forKey: .repostOfId) }
        if let mobileTranscription {
            try container.encode(mobileTranscription, forKey: .mobileTranscription)
        }
        // Encodé seulement quand il existe : un post TEXTE n'a pas de scène, et
        // un blob vide affirmerait une scène composée puis effacée.
        if let storyEffects {
            try container.encode(storyEffects, forKey: .storyEffects)
        }
        // Vide vaut absent : une carte vide n'efface rien à la CRÉATION, et le
        // schéma n'attend pas de verdict ici.
        if let mediaCaption, !mediaCaption.isEmpty {
            try container.encode(mediaCaption, forKey: .mediaCaption)
        }
        if let mediaAlt, !mediaAlt.isEmpty {
            try container.encode(mediaAlt, forKey: .mediaAlt)
        }
        // Encodé seulement quand présent : `CreatePostSchema.allowSoundExtraction`
        // est optionnel, et un `null` explicite serait une affirmation
        // (« l'auteur a refusé ») là où il n'a rien décidé.
        if let allowSoundExtraction {
            try container.encode(allowSoundExtraction, forKey: .allowSoundExtraction)
        }
        if let commentsDisabled {
            try container.encode(commentsDisabled, forKey: .commentsDisabled)
        }
    }

    enum CodingKeys: String, CodingKey {
        case content, mediaIds, visibility, originalLanguage, type
        case moodEmoji, audioUrl, audioDuration, visibilityUserIds, location, mentions
        case discoverabilityPrecision, repostOfId, mobileTranscription, storyEffects
        case mediaCaption
        case mediaAlt
        case allowSoundExtraction
        case commentsDisabled
    }
}
