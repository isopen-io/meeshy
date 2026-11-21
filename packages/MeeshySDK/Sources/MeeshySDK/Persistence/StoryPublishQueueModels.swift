import Foundation

// MARK: - Story Publish Queue Item

/// A pending story publication that survives app restarts and offline
/// periods. Holds a serialized slide payload plus references to the local
/// media files (image/video/audio) so the queue can hash-check that the
/// underlying assets still exist on disk before each retry.
///
/// SOTA audit Pilier 22 — covers the gap that `OfflineQueue` (messaging-only)
/// did not address, ensuring users do not lose composed stories when the
/// network is unavailable at publish time or the app crashes mid-publish.
public struct StoryPublishQueueItem: Codable, Identifiable, Sendable {
    public let id: String
    /// Optimistic id surfaced in the tray/feed while the item waits in the
    /// queue. Reconciled with the server-assigned post id on success.
    public let tempStoryId: String
    public let visibility: String
    /// JSON payload of the [StorySlide] array as produced by the composer.
    /// Decoding is deferred to the publish handler so the queue stays
    /// schema-agnostic if `StorySlide` evolves.
    ///
    /// `internal(set)` : le SEUL mutateur légitime est
    /// `StoryPublishQueue.updateSlidesPayload`. Le champ est devenu variable
    /// pour que le write-ahead parte immédiatement avec les slides BRUTES
    /// (durabilité) et que l'enrichissement thumbHash le rattrape en aval —
    /// jamais pour ouvrir une réécriture arbitraire du payload persisté.
    public internal(set) var slidesPayload: Data
    /// Optional explicit `repostOfId` for stories that are reposts.
    public let repostOfId: String?
    /// References to local media files so we can validate they still exist
    /// before each retry. Files come from `StoryDraftStore.saveMedia` or
    /// from the ephemeral Documents/tmp paths produced by the composer.
    public let mediaReferences: [StoryMediaReference]
    public let createdAt: Date
    public var retryCount: Int
    public var lastError: String?
    /// IDs d'utilisateurs ciblés (ONLY) ou exclus (EXCEPT). Optionnel pour
    /// rester rétro-compatible avec les rows persistés avant ce champ.
    public let visibilityUserIds: [String]?
    /// Langue source (Prisme Linguistique) du contenu de la story. Persistée
    /// pour que le gateway puisse router NLLB-200/TTS au flush et que le reader
    /// résolve le texte/audio dans la langue préférée du viewer. Optionnelle pour
    /// rester rétro-compatible avec les rows persistés avant ce champ (→ `nil`).
    public let originalLanguage: String?
    /// Brouillon (`StoryDraftStore`) dont cette publication est issue. Le
    /// brouillon SURVIT au hand-off (gelé, `pendingPublishAt`) : seul le
    /// SUCCÈS serveur le supprime, l'échec PERMANENT le ramène éditable avec
    /// son erreur. Optionnel pour rester rétro-compatible avec les items
    /// persistés avant ce champ (→ `nil`, chemin de reprise MANUELLE inchangé).
    public let draftId: String?
    /// Les personnes que l'auteur a DÉCLARÉES (badge posé sur le canevas, note
    /// sous le contenu, métadonnée silencieuse), telles que la publication les
    /// enverra.
    ///
    /// Persistées ici parce qu'elles ne vivent NULLE PART ailleurs : le serveur
    /// relit les `@handle` du texte, mais un badge en est exclu par
    /// construction et une note comme un silence n'ont aucun texte. Sans ce
    /// champ, une story mise en file hors-ligne repartait sans référence — elle
    /// affichait la pastille et ne prévenait personne. Optionnel pour rester
    /// rétro-compatible avec les rows persistés avant lui (→ `nil`).
    public let mentionsPayload: [PostMentionInput]?
    /// **Les mentions PAR SLIDE** (#4068).
    ///
    /// > Une mention est attachée à la publication. En Story, une publication
    /// > est une slide ; en Post et en Réel, il n'y en a qu'une.
    ///
    /// `mentionsPayload` ci-dessus est composer-wide, et c'est exactement le
    /// défaut : la boucle d'envoi le semait sur CHAQUE slide, si bien qu'une
    /// NOTE posée en pensant à la première notifiait la personne trois fois et
    /// la faisait apparaître sous trois stories.
    ///
    /// Le champ s'AJOUTE plutôt que de remplacer, et c'est délibéré : des rows
    /// écrites avant ce lot dorment déjà dans la file d'un appareil hors-ligne.
    /// Quand la carte est présente elle PRIME ; sinon on retombe sur
    /// `mentionsPayload`, c'est-à-dire sur l'ancien comportement pour ces
    /// rows-là seulement.
    ///
    /// > Un contrat neuf s'AJOUTE à l'ancien tant que des porteurs de l'ancien
    /// > existent. Remplacer la clé aurait fait échouer le décodage d'une
    /// > publication en attente — et une publication perdue est pire qu'une
    /// > mention répétée.
    public let mentionsBySlidePayload: [String: [PostMentionInput]]?
    /// Le texte alternatif par média saisi par l'auteur, keyé par ID D'ÉLÉMENT
    /// DU COMPOSER — les ids serveur n'existent qu'après l'upload, que le rejeu
    /// refera lui-même. Persisté ici pour la même raison que
    /// `mentionsPayload` : il ne vit nulle part ailleurs (le brouillon ne le
    /// porte pas), donc un rejeu qui ne l'emporterait pas publierait une story
    /// muette pour les lecteurs d'écran. Optionnel — rétro-compatible avec les
    /// rows persistés avant lui (→ `nil`).
    public let mediaAltPayload: [String: String]?
    /// La LÉGENDE par média (#4055), persistée pour EXACTEMENT la raison
    /// écrite ci-dessus — et plus fortement encore : un texte alternatif perdu
    /// publie une story muette pour les lecteurs d'écran, une légende perdue
    /// publie un média que l'auteur croyait avoir légendé, VISIBLEMENT.
    /// Optionnel — les rows écrites avant ce champ se relisent en `nil`.
    public let mediaCaptionPayload: [String: String]?
    /// L'opt-in d'extraction de bande-son, tel que l'auteur l'a tranché. `nil`
    /// = il n'a rien tranché (ou row antérieure au champ) : le défaut serveur
    /// s'applique alors par silence.
    public let allowSoundExtractionPayload: Bool?
    /// Le FORMAT sous lequel l'auteur a demandé la publication (`PostType`
    /// brut). Persisté pour la même raison que les deux champs ci-dessus : il
    /// ne vit nulle part ailleurs — le brouillon ne le porte pas — donc un
    /// rejeu au retour du réseau republierait une story là où l'auteur avait
    /// choisi « Post ». Stocké en chaîne plutôt qu'en enum pour qu'une valeur
    /// inconnue (row écrite par une version future) se relise en repli et non
    /// en échec de décodage de toute la ligne. `nil` = row antérieure au champ
    /// → story, ce qu'elle était.
    public let targetTypePayload: String?
    /// « Publier AUSSI en réel » (#9476) : la story part avec son réel, en UN
    /// geste. Persisté pour la même raison que `targetTypePayload` — un rejeu
    /// au retour du réseau publierait la story seule. `nil` = row antérieure au
    /// champ, ou story seule : rien d'autre ne part.
    public let alsoAsReelPayload: Bool?

    enum CodingKeys: String, CodingKey {
        case id, tempStoryId, visibility, slidesPayload, repostOfId
        case mediaReferences, createdAt, retryCount, lastError, visibilityUserIds
        case originalLanguage, draftId, mentionsPayload, mentionsBySlidePayload
        case mediaAltPayload, mediaCaptionPayload, allowSoundExtractionPayload, targetTypePayload
        case alsoAsReelPayload
    }

    public init(
        visibility: String,
        slidesPayload: Data,
        repostOfId: String? = nil,
        mediaReferences: [StoryMediaReference] = [],
        tempStoryId: String? = nil,
        visibilityUserIds: [String]? = nil,
        originalLanguage: String? = nil,
        draftId: String? = nil,
        mentionsPayload: [PostMentionInput]? = nil,
        mentionsBySlidePayload: [String: [PostMentionInput]]? = nil,
        mediaAltPayload: [String: String]? = nil,
        mediaCaptionPayload: [String: String]? = nil,
        allowSoundExtractionPayload: Bool? = nil,
        targetTypePayload: String? = nil,
        alsoAsReelPayload: Bool? = nil
    ) {
        let queueId = UUID().uuidString
        self.id = queueId
        self.tempStoryId = tempStoryId ?? "pending_\(queueId)"
        self.visibility = visibility
        self.slidesPayload = slidesPayload
        self.repostOfId = repostOfId
        self.mediaReferences = mediaReferences
        self.createdAt = Date()
        self.retryCount = 0
        self.lastError = nil
        self.visibilityUserIds = visibilityUserIds
        self.originalLanguage = originalLanguage
        self.draftId = draftId
        self.mentionsPayload = mentionsPayload
        self.mentionsBySlidePayload = mentionsBySlidePayload
        self.mediaAltPayload = mediaAltPayload
        self.mediaCaptionPayload = mediaCaptionPayload
        self.allowSoundExtractionPayload = allowSoundExtractionPayload
        self.targetTypePayload = targetTypePayload
        self.alsoAsReelPayload = alsoAsReelPayload
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(String.self, forKey: .id)
        self.tempStoryId = try container.decode(String.self, forKey: .tempStoryId)
        self.visibility = try container.decode(String.self, forKey: .visibility)
        self.slidesPayload = try container.decode(Data.self, forKey: .slidesPayload)
        self.repostOfId = try container.decodeIfPresent(String.self, forKey: .repostOfId)
        self.mediaReferences = try container.decodeIfPresent([StoryMediaReference].self, forKey: .mediaReferences) ?? []
        self.createdAt = try container.decode(Date.self, forKey: .createdAt)
        self.retryCount = try container.decodeIfPresent(Int.self, forKey: .retryCount) ?? 0
        self.lastError = try container.decodeIfPresent(String.self, forKey: .lastError)
        self.visibilityUserIds = try container.decodeIfPresent([String].self, forKey: .visibilityUserIds)
        self.originalLanguage = try container.decodeIfPresent(String.self, forKey: .originalLanguage)
        self.draftId = try container.decodeIfPresent(String.self, forKey: .draftId)
        self.mentionsPayload = try container.decodeIfPresent([PostMentionInput].self, forKey: .mentionsPayload)
        // Row écrite avant #4068 : pas de clé, donc `nil` — l'envoi retombe
        // alors sur `mentionsPayload`, l'ancien comportement, plutôt que de
        // perdre la publication au décodage.
        self.mentionsBySlidePayload = try container.decodeIfPresent([String: [PostMentionInput]].self, forKey: .mentionsBySlidePayload)
        self.mediaAltPayload = try container.decodeIfPresent([String: String].self, forKey: .mediaAltPayload)
        // Row écrite avant #4055 : pas de clé, donc `nil` — jamais un échec de
        // décodage, qui perdrait la publication en attente TOUT ENTIÈRE.
        self.mediaCaptionPayload = try container.decodeIfPresent([String: String].self, forKey: .mediaCaptionPayload)
        self.allowSoundExtractionPayload = try container.decodeIfPresent(Bool.self, forKey: .allowSoundExtractionPayload)
        self.targetTypePayload = try container.decodeIfPresent(String.self, forKey: .targetTypePayload)
        self.alsoAsReelPayload = try container.decodeIfPresent(Bool.self, forKey: .alsoAsReelPayload)
    }
}

/// Pointer to a local media file backing a slide. The queue validates
/// `localFilePath` exists before each retry; if missing, the item is failed
/// permanently and surfaced via `publishFailed` so the UI can ask the user
/// to retake the lost media.
/// Ce qu'a fait l'annulation d'une story en attente (#10331).
public enum StoryPendingCancellation: Equatable, Sendable {
    /// Retirée de la file, médias locaux compris : rien ne partira.
    case removed
    /// En train de partir : la file la garde.
    case inFlight
    /// Plus dans la file — partie, ou déjà classée en échec.
    case notFound
}

public struct StoryMediaReference: Codable, Sendable {
    public let elementId: String
    /// "image", "video" or "audio" — kept as a free string for forward
    /// compatibility with future media types.
    public let mediaType: String
    /// Absolute path to the local file on disk.
    public let localFilePath: String

    public init(elementId: String, mediaType: String, localFilePath: String) {
        self.elementId = elementId
        self.mediaType = mediaType
        self.localFilePath = localFilePath
    }

    private enum CodingKeys: String, CodingKey {
        case elementId, mediaType, localFilePath
    }

    /// **Le chemin relu suit le conteneur de l'app** (#14879). Le dossier
    /// `…/Data/Application/<UUID>/` change d'un lancement à l'autre (mise à
    /// jour, réinstallation, simulateur) : un chemin absolu persisté visait
    /// l'ANCIEN conteneur, et le fichier, bien présent, était déclaré
    /// introuvable — la story partait en échec « média local introuvable ».
    /// Le format écrit ne change pas : seul le décodage rebase.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        elementId = try container.decode(String.self, forKey: .elementId)
        mediaType = try container.decode(String.self, forKey: .mediaType)
        localFilePath = Self.rebasing(
            try container.decode(String.self, forKey: .localFilePath),
            ontoHome: NSHomeDirectory()
        )
    }

    /// Réécrit `path` sous `home` quand il vise un AUTRE conteneur d'app ; tout
    /// autre chemin (déjà sous `home`, hors conteneur, `home` hors conteneur)
    /// reste tel quel.
    public static func rebasing(_ path: String, ontoHome home: String) -> String {
        let marker = "/Data/Application/"
        guard !path.hasPrefix(home + "/"),
              home.contains(marker),
              let markerRange = path.range(of: marker) else { return path }
        let afterMarker = path[markerRange.upperBound...]
        guard let containerEnd = afterMarker.firstIndex(of: "/") else { return path }
        return home + afterMarker[containerEnd...]
    }

    /// File extensions (case-insensitive) treated as video containers.
    private static let videoFileExtensions: Set<String> = ["mp4", "mov", "m4v"]

    /// Infers a visual `mediaType` ("video" or "image") from a file path's
    /// extension. The offline-queue converters only know a flat disk path (not
    /// the original media kind), so without this a queued `.mp4` would be
    /// re-tagged as "image" and replay via `UIImage(contentsOfFile:)` → nil →
    /// unrecoverable failure (or the video never uploads). Pure, side-effect
    /// free atom; audio refs are tagged explicitly by callers and never routed
    /// through here.
    ///
    /// CLOSED-SET ASSUMPTION (F4): the extension is lowercased before lookup so
    /// `.MP4`/`.MOV` resolve correctly. The set `{mp4, mov, m4v}` is the single
    /// point deciding offline-replay recoverability; it is sound because every
    /// caller feeds a clean local DISK path — `TimelineViewModel+OfflinePublish`
    /// and `StoryQueueMigrator` pass `URL.path`, which already strips any query
    /// string / fragment — so a URL-shaped path (e.g. `clip.mp4?token=…`) cannot
    /// reach here. Anything outside the set (unknown / empty / dotfile-without-
    /// extension) defaults to "image": images dominate and a mis-tagged image is
    /// harmless, whereas a mis-tagged video fails loudly via the disk-existence /
    /// decode path rather than corrupting silently. Update the set in lockstep if
    /// the composer ever exports a new video container.
    public static func inferVisualMediaType(forPath path: String) -> String {
        let ext = (path as NSString).pathExtension.lowercased()
        return videoFileExtensions.contains(ext) ? "video" : "image"
    }
}

// MARK: - Publish Result Payloads

public struct StoryPublishSuccess: Sendable {
    public let queueId: String
    public let tempStoryId: String
    /// Server-assigned post id for the newly published story.
    public let publishedStoryId: String
    /// Brouillon d'origine de l'item publié — le succès serveur confirmé est
    /// le SEUL événement qui autorise sa suppression. `nil` = item legacy.
    public let draftId: String?

    /// Init public : ces payloads franchissent la frontière de module (les
    /// consommateurs s'y abonnent et doivent pouvoir en fabriquer un pour
    /// exercer leur propre réaction à une disposition de queue).
    public init(queueId: String, tempStoryId: String, publishedStoryId: String,
                draftId: String? = nil) {
        self.queueId = queueId
        self.tempStoryId = tempStoryId
        self.publishedStoryId = publishedStoryId
        self.draftId = draftId
    }
}

public enum StoryPublishFailureReason: Sendable, Equatable {
    /// Retry budget exhausted (max retries reached).
    case maxRetriesReached
    /// One or more local media files referenced by the item have disappeared
    /// from disk. The item is moved to a permanent-failure state and the user
    /// must retake the missing media.
    case missingLocalMedia(elementIds: [String])
    /// The publish handler threw a non-retryable error (4xx HTTP, validation
    /// failure, story expired, etc.). Caller should surface to the user.
    case unrecoverable(message: String)
}

public struct StoryPublishFailure: Sendable {
    public let queueId: String
    public let tempStoryId: String
    public let reason: StoryPublishFailureReason
    /// Brouillon d'origine de l'item échoué — un échec PERMANENT le ramène
    /// éditable, avec son erreur. `nil` = item legacy (reprise manuelle).
    public let draftId: String?

    /// Init public : même raison que `StoryPublishSuccess`.
    public init(queueId: String, tempStoryId: String, reason: StoryPublishFailureReason,
                draftId: String? = nil) {
        self.queueId = queueId
        self.tempStoryId = tempStoryId
        self.reason = reason
        self.draftId = draftId
    }
}

// MARK: - Unrecoverable Error Marker

/// Throw this from the `onPublish` handler to mark a publish failure as
/// permanent (4xx HTTP, validation rejected, story expired) so the queue
/// stops retrying and surfaces the failure to the user via `publishFailed`.
/// La publication n'a PAS été tentée : rien ne peut publier pour l'instant (l'exécuteur de l'app — le
/// `StoryViewModel` racine — est démonté). La file garde l'item SANS consommer son budget de retry et arrête la
/// passe ; la prochaine reprise (reconnexion, retour au premier plan, exécuteur remonté) la relance.
public struct StoryPublishDeferredError: Error, Sendable {
    public init() {}
}

public struct StoryPublishUnrecoverableError: Error, Sendable {
    public let message: String

    public init(_ message: String = "Permanent publish failure") {
        self.message = message
    }
}
