import Foundation
import Combine
import os

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

    enum CodingKeys: String, CodingKey {
        case id, tempStoryId, visibility, slidesPayload, repostOfId
        case mediaReferences, createdAt, retryCount, lastError, visibilityUserIds
        case originalLanguage, draftId, mentionsPayload
        case mediaAltPayload, mediaCaptionPayload, allowSoundExtractionPayload, targetTypePayload
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
        mediaAltPayload: [String: String]? = nil,
        mediaCaptionPayload: [String: String]? = nil,
        allowSoundExtractionPayload: Bool? = nil,
        targetTypePayload: String? = nil
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
        self.mediaAltPayload = mediaAltPayload
        self.mediaCaptionPayload = mediaCaptionPayload
        self.allowSoundExtractionPayload = allowSoundExtractionPayload
        self.targetTypePayload = targetTypePayload
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
        self.mediaAltPayload = try container.decodeIfPresent([String: String].self, forKey: .mediaAltPayload)
        // Row écrite avant #4055 : pas de clé, donc `nil` — jamais un échec de
        // décodage, qui perdrait la publication en attente TOUT ENTIÈRE.
        self.mediaCaptionPayload = try container.decodeIfPresent([String: String].self, forKey: .mediaCaptionPayload)
        self.allowSoundExtractionPayload = try container.decodeIfPresent(Bool.self, forKey: .allowSoundExtractionPayload)
        self.targetTypePayload = try container.decodeIfPresent(String.self, forKey: .targetTypePayload)
    }
}

/// Pointer to a local media file backing a slide. The queue validates
/// `localFilePath` exists before each retry; if missing, the item is failed
/// permanently and surfaced via `publishFailed` so the UI can ask the user
/// to retake the lost media.
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

// MARK: - Story Publish Queue

/// Singleton actor that owns the disk-persisted queue of pending story
/// publications, drives the retry loop, and emits success/failure events
/// to the rest of the app via Combine publishers.
public actor StoryPublishQueue {
    public static let shared = StoryPublishQueue()

    /// Emitted when a pending publication reaches the server and is assigned
    /// a real post id. ViewModels listen to swap their optimistic
    /// `pending_<uuid>` row with the authoritative server row.
    public nonisolated let publishSucceeded = SendablePassthrough<StoryPublishSuccess>()

    /// Emitted when a pending publication fails permanently (max retries,
    /// missing media, unrecoverable error). The UI should surface this to the
    /// user with an explicit "retry" or "delete draft" action.
    public nonisolated let publishFailed = SendablePassthrough<StoryPublishFailure>()

    private static let maxQueueSize = 50
    private static let maxRetries = 5
    /// Exponential backoff schedule (seconds). Index = retryCount before
    /// next attempt. Beyond `maxRetries` the item is failed permanently.
    /// TODO(lot ultérieur) : DÉCLARÉ MAIS JAMAIS LU — il n'existe aucune porte
    /// temporelle entre deux passes, les passes sont déclenchées par
    /// `observeConnection`, `setPublishHandler` et `retryFailedItem`. Le
    /// brancher transformerait le comportement de reprise (fenêtres de
    /// plusieurs heures) : hors périmètre, mais ne pas croire qu'il s'applique.
    private static let retryDelays: [TimeInterval] = [30, 120, 600, 3600, 7200]
    /// Un item fautif ne doit pas geler les suivants ; une panne réseau ne doit
    /// pas brûler le budget de toute la file. La frontière entre les deux est
    /// le nombre d'échecs retryables CONSÉCUTIFS. Sans porte temporelle entre
    /// deux passes (cf. `retryDelays`), un `continue` inconditionnel brûlerait
    /// 1 tentative sur CHAQUE item à chaque passe : 5 flaps réseau suffiraient
    /// à envoyer toute la file en échec permanent.
    private static let maxConsecutiveRetryableFailures = 2
    /// Une passe ne doit jamais retenir `isProcessing` plus de ~7 s : au-delà,
    /// un `enqueue` concurrent attendrait le prochain déclencheur alors que le
    /// réseau va manifestement bien (le jitter inter-items ferait dormir une
    /// file pleine jusqu'à ~35 s). Le reliquat part dans une passe de suivi
    /// immédiate. Le budget compte les items réellement TENTÉS : un item
    /// revendiqué ailleurs est sauté sans délai et ne coûte donc rien — le
    /// compter ferait boucler la passe à vide sur une file de claims.
    private static let maxItemsPerSweep = 10
    private static let queueFileName = "story_publish_queue.json"
    /// Cap on the retry-able failure history (`failedItems`). Local media is
    /// preserved for these items (unlike `items`, which drops media on any
    /// terminal disposition) so the user can retry from `MyStoriesView` —
    /// the cap bounds how much abandoned media can accumulate on disk.
    private static let maxFailedItems = 20
    private static let failedQueueFileName = "story_publish_failed_queue.json"

    private var items: [StoryPublishQueueItem] = []
    /// Items that failed permanently (max retries, missing media, server
    /// rejection). Unlike a plain `processNext()` disposal, these are kept
    /// (with their local media) so the UI can list them and offer a manual
    /// retry — see `failedPendingItems`, `retryFailedItem`, `discardFailedItem`.
    private var failedItems: [StoryPublishQueueItem] = []
    private var isProcessing = false
    private var cancellables = Set<AnyCancellable>()
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "story-publish-queue")

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    /// Publish handler injected by the consuming app. Receives a queue item
    /// and either:
    ///   - returns the server-assigned story id on success
    ///   - throws an `Error` to signal a retryable failure (network, 5xx)
    ///   - throws `StoryPublishUnrecoverableError` to signal a permanent
    ///     failure (4xx, validation) that should NOT be retried
    public var onPublish: ((StoryPublishQueueItem) async throws -> String)?

    /// Registers the publish handler and immediately drains any items that
    /// were restored from disk at init time. Without this trigger there is
    /// a startup window where the connection observer may have fired before
    /// the handler is set, leaving pending items untouched until the next
    /// connectivity flip — which on a stable network may never come, so the
    /// items would sit forever despite being publishable.
    ///
    /// This trigger is fire-and-forget : the caller does not need to await
    /// the drain. processNext is idempotent and gated by `isProcessing` so
    /// double-trigger is safe.
    public func setPublishHandler(_ handler: @escaping @Sendable (StoryPublishQueueItem) async throws -> String) {
        let wasEmpty = items.isEmpty
        onPublish = handler
        if !wasEmpty {
            logger.info("Publish handler registered with \(self.items.count) restored items, draining now")
            Task { await self.processNext() }
        }
    }

    private init() {
        items = Self.loadItemsFromDisk()
        failedItems = Self.loadFailedItemsFromDisk()
        Task { await self.observeConnection() }
    }

    // MARK: - Queue Operations

    /// Enqueues a new pending story publish. Returns the assigned `tempStoryId`
    /// so the caller can show an optimistic row in the UI and reconcile via
    /// `publishSucceeded` once the publish reaches the server.
    @discardableResult
    public func enqueue(_ item: StoryPublishQueueItem) -> String {
        if items.count >= Self.maxQueueSize {
            // Drop the oldest pending item to make room. The dropped item is
            // surfaced as a permanent failure so the user is aware that their
            // long-stale draft was abandoned.
            let dropped = items.removeFirst()
            publishFailed.send(StoryPublishFailure(
                queueId: dropped.id,
                tempStoryId: dropped.tempStoryId,
                reason: .maxRetriesReached,
                draftId: dropped.draftId
            ))
        }
        items.append(item)
        saveToDisk()
        logger.info("Enqueued story publish \(item.id), queue size: \(self.items.count)")
        return item.tempStoryId
    }

    public func dequeue(_ itemId: String) {
        items.removeAll { $0.id == itemId }
        inFlightIds.remove(itemId)
        saveToDisk()
    }

    /// Remplace le payload d'un item DÉJÀ persisté, sans toucher à son identité
    /// (id, tempStoryId, createdAt, retryCount, mediaReferences). Sert au calcul
    /// EN AVAL des thumbHashes : le write-ahead part immédiatement avec les
    /// slides brutes, l'enrichissement le rattrape. No-op si l'id est inconnu
    /// (item déjà drainé/annulé entre-temps) — un kill dans cette fenêtre laisse
    /// une story sans thumbHash, publiée correctement au drain de boot : seul le
    /// placeholder flou du lecteur manque (durabilité > cosmétique).
    public func updateSlidesPayload(_ itemId: String, _ payload: Data) {
        guard let idx = items.firstIndex(where: { $0.id == itemId }) else { return }
        items[idx].slidesPayload = payload
        saveToDisk()
    }

    // MARK: - In-flight marking (E5 write-ahead)

    /// E5 — ids des items REVENDIQUÉS en ce moment par l'un des deux
    /// producteurs : le chemin online de l'UI (write-ahead) ou le balayage de
    /// fond `processNext()`. Ce n'est plus un marqueur « posé par l'UI » mais un
    /// verrou d'exclusion PARTAGÉ — la seule barrière contre la double
    /// publication d'un même item persisté. VOLATILE à dessein : jamais
    /// persisté ; après un kill le marqueur disparaît et l'item redevient
    /// naturellement éligible au drain de boot — la sémantique « inflight
    /// orphelin → pending » sans champ persisté ni migration de format.
    private var inFlightIds: Set<String> = []

    /// Revendication ATOMIQUE : `false` = un autre producteur (drain de fond ou
    /// chemin online) publie déjà cet item. L'appelant DOIT lire ce retour —
    /// c'est la seule barrière contre la double publication.
    @discardableResult
    public func markInFlight(_ itemId: String) -> Bool {
        inFlightIds.insert(itemId).inserted
    }

    public func clearInFlight(_ itemId: String) {
        inFlightIds.remove(itemId)
    }

    public func isInFlight(_ itemId: String) -> Bool {
        inFlightIds.contains(itemId)
    }

    public var pendingItems: [StoryPublishQueueItem] {
        items
    }

    /// Items that failed permanently and are waiting for a manual retry or
    /// discard from the UI (`MyStoriesView`). Their local media is preserved
    /// (unlike `pendingItems`' terminal successes) so a retry can reuse it.
    public var failedPendingItems: [StoryPublishQueueItem] {
        failedItems
    }

    /// Moves a permanently-failed item back into the active retry queue,
    /// resetting its retry budget, and kicks off an immediate drain attempt.
    public func retryFailedItem(_ itemId: String) {
        guard let idx = failedItems.firstIndex(where: { $0.id == itemId }) else { return }
        var item = failedItems.remove(at: idx)
        item.retryCount = 0
        item.lastError = nil
        items.append(item)
        saveToDisk()
        saveFailedItemsToDisk()
        Task { await self.processNext() }
    }

    /// Permanently abandons a failed item : removes it from history and
    /// deletes its local media. The caller is responsible for clearing any
    /// optimistic UI row still referencing the item's `tempStoryId`.
    public func discardFailedItem(_ itemId: String) {
        guard let idx = failedItems.firstIndex(where: { $0.id == itemId }) else { return }
        let item = failedItems.remove(at: idx)
        removeLocalMedia(of: item)
        saveFailedItemsToDisk()
    }

    /// Draft recovery — the most recent queued story that has been stuck
    /// (unpublished) for longer than `olderThan` seconds, so the composer can
    /// pre-fill it as a draft (the "pas envoyé dans la minute → offline" rule).
    /// `items` is append-ordered oldest→newest, so `.last(where:)` is the most
    /// recent match. `nil` when nothing has been stuck long enough.
    public func recoverLastStuckItem(olderThan threshold: TimeInterval) -> StoryPublishQueueItem? {
        let cutoff = Date().addingTimeInterval(-threshold)
        return items.last { $0.createdAt <= cutoff }
    }

    public var count: Int {
        items.count
    }

    public var isEmpty: Bool {
        items.isEmpty
    }

    public func clearAll() {
        // E9/E10 — un clearAll (logout multi-compte) emporte aussi les copies
        // médias locales de chaque item : les stories en attente d'un compte
        // ne doivent laisser ni queue ni fichiers au compte suivant. Ça
        // couvre aussi l'historique des échecs (failedItems), sinon un échec
        // du compte précédent resterait consultable/retryable par le suivant.
        for item in items {
            removeLocalMedia(of: item)
        }
        for item in failedItems {
            removeLocalMedia(of: item)
        }
        items.removeAll()
        failedItems.removeAll()
        inFlightIds.removeAll()
        saveToDisk()
        saveFailedItemsToDisk()
    }

    // MARK: - Processing Loop

    /// Walks the queue and attempts to publish each pending item via the
    /// injected `onPublish` handler. Successful items are removed and the
    /// associated `publishSucceeded` event is emitted. Failed items are
    /// retried according to the exponential backoff schedule, or moved to
    /// permanent failure once the retry budget is exhausted.
    public func processNext() async {
        guard !isProcessing, !items.isEmpty else { return }
        guard let publish = onPublish else {
            logger.warning("No publish handler set, skipping process")
            return
        }

        isProcessing = true
        defer { isProcessing = false }

        logger.info("Processing \(self.items.count) pending story publications")

        var successPayloads: [StoryPublishSuccess] = []
        var failurePayloads: [StoryPublishFailure] = []
        var permanentFailureIds: [String] = []
        var successIds: [String] = []

        // Un item fautif ne gèle plus le balayage (`continue`), mais deux
        // échecs retryables d'affilée signent une panne réseau : on arrête là
        // plutôt que de brûler le budget de retry de toute la file.
        var consecutiveRetryableFailures = 0
        // Vrai quand la passe s'est arrêtée sur le CAP DE TAILLE (et non sur
        // une panne) : le reliquat mérite alors une passe de suivi immédiate.
        var didHitSweepCap = false
        // Items réellement TENTÉS dans cette passe (les sauts n'en sont pas).
        var attemptedInSweep = 0

        for item in items {
            guard attemptedInSweep < Self.maxItemsPerSweep else {
                didHitSweepCap = true
                break
            }
            // E5 — revendication ATOMIQUE : un item déjà détenu par l'autre
            // producteur (upload online write-ahead) n'est pas double-publié.
            // Posée AVANT le contrôle des médias, avec son `defer` juste après,
            // pour qu'aucune sortie d'itération ne laisse l'item revendiqué.
            guard markInFlight(item.id) else { continue }
            defer { clearInFlight(item.id) }
            // Backoff between consecutive retries within the same processing
            // pass — small jitter to avoid thundering-herd on reconnect.
            if attemptedInSweep > 0 {
                let jitter = UInt64(Double.random(in: 200...700) * 1_000_000)
                try? await Task.sleep(nanoseconds: jitter)
            }
            attemptedInSweep += 1

            // Hash-check : every referenced local media must still exist.
            let missing = item.mediaReferences.filter {
                !FileManager.default.fileExists(atPath: $0.localFilePath)
            }
            if !missing.isEmpty {
                permanentFailureIds.append(item.id)
                failurePayloads.append(StoryPublishFailure(
                    queueId: item.id,
                    tempStoryId: item.tempStoryId,
                    reason: .missingLocalMedia(elementIds: missing.map(\.elementId)),
                    draftId: item.draftId
                ))
                consecutiveRetryableFailures = 0
                continue
            }

            do {
                let publishedId = try await publish(item)
                successIds.append(item.id)
                successPayloads.append(StoryPublishSuccess(
                    queueId: item.id,
                    tempStoryId: item.tempStoryId,
                    publishedStoryId: publishedId,
                    draftId: item.draftId
                ))
                consecutiveRetryableFailures = 0
            } catch is StoryPublishUnrecoverableError {
                permanentFailureIds.append(item.id)
                failurePayloads.append(StoryPublishFailure(
                    queueId: item.id,
                    tempStoryId: item.tempStoryId,
                    reason: .unrecoverable(message: "Server rejected the story (validation, expiry, or visibility constraint)"),
                    draftId: item.draftId
                ))
                consecutiveRetryableFailures = 0
            } catch {
                // Échec retryable : on charge le budget de CET item puis on
                // poursuit sur les suivants — ils sont indépendants et
                // potentiellement publiables. Seule une SÉRIE d'échecs
                // (cf. `maxConsecutiveRetryableFailures`) fait conclure à une
                // panne réseau et arrête la passe.
                if let idx = items.firstIndex(where: { $0.id == item.id }) {
                    items[idx].retryCount += 1
                    items[idx].lastError = error.localizedDescription

                    if items[idx].retryCount >= Self.maxRetries {
                        permanentFailureIds.append(item.id)
                        failurePayloads.append(StoryPublishFailure(
                            queueId: item.id,
                            tempStoryId: item.tempStoryId,
                            reason: .maxRetriesReached,
                            draftId: item.draftId
                        ))
                    }
                }
                consecutiveRetryableFailures += 1
                guard consecutiveRetryableFailures < Self.maxConsecutiveRetryableFailures else { break }
                continue
            }
        }

        // Apply the dispositions atomically before notifying observers.
        // E10 — une disposition de SUCCÈS emporte ses copies média locales :
        // sans ce cleanup, chaque publication via la queue laissait son
        // dossier `meeshy_offline_queue/<tempStoryId>/` orphelin sur disque
        // (fuite confirmée it.12). Un échec PERMANENT, en revanche, migre vers
        // `failedItems` SANS supprimer son média — pour permettre un retry
        // manuel depuis `MyStoriesView` (cf. `addToFailedItems`).
        for id in successIds {
            if let item = items.first(where: { $0.id == id }) {
                removeLocalMedia(of: item)
            }
            items.removeAll { $0.id == id }
        }
        for id in permanentFailureIds {
            guard let idx = items.firstIndex(where: { $0.id == id }) else { continue }
            var item = items.remove(at: idx)
            switch failurePayloads.first(where: { $0.queueId == id })?.reason {
            case .missingLocalMedia:
                item.lastError = "Un média local est introuvable"
            case .unrecoverable(let message):
                item.lastError = message
            case .maxRetriesReached, .none:
                break // keep the lastError already set from the final retry attempt
            }
            addToFailedItems(item)
        }
        saveToDisk()

        for payload in successPayloads {
            publishSucceeded.send(payload)
        }
        for payload in failurePayloads {
            publishFailed.send(payload)
        }

        if !successIds.isEmpty || !permanentFailureIds.isEmpty {
            logger.info("Processed: \(successIds.count) succeeded, \(permanentFailureIds.count) permanently failed, \(self.items.count) still pending")
        }

        // Passe de suivi : la précédente s'est arrêtée sur le cap de TAILLE, pas
        // sur une panne. `isProcessing` est relâché par le `defer` avant que
        // cette Task ne s'exécute, donc le reliquat repart aussitôt. Le cap ne
        // se déclenche que si dix items ont été TENTÉS — une passe qui n'a fait
        // que sauter des claims ne se re-programme donc jamais (sinon elle
        // boucherait l'acteur en boucle serrée, sans jitter, jusqu'à ce qu'une
        // revendication se libère).
        if didHitSweepCap, !items.isEmpty {
            Task { await self.processNext() }
        }
    }

    /// Appends a permanently-failed item to the retry-able history, dropping
    /// the oldest entry (and its media) once `maxFailedItems` is exceeded —
    /// same drop-oldest pattern as `enqueue`'s `maxQueueSize` guard.
    private func addToFailedItems(_ item: StoryPublishQueueItem) {
        failedItems.append(item)
        if failedItems.count > Self.maxFailedItems {
            let dropped = failedItems.removeFirst()
            removeLocalMedia(of: dropped)
        }
        saveFailedItemsToDisk()
    }

    /// E10 — supprime les copies média locales d'un item en disposition
    /// terminale puis chaque répertoire parent devenu VIDE (prudent : on ne
    /// touche jamais un dossier qui contient encore autre chose). Best-effort
    /// et agnostique du produit : la queue ne connaît que ses `mediaReferences`.
    private func removeLocalMedia(of item: StoryPublishQueueItem) {
        let fm = FileManager.default
        var parents: Set<URL> = []
        for ref in item.mediaReferences {
            let url = URL(fileURLWithPath: ref.localFilePath)
            FileManager.default.removeItemLogging(at: url, context: "story media cleanup")
            parents.insert(url.deletingLastPathComponent())
        }
        for parent in parents {
            // Répertoire déjà disparu = rien à réclamer.
            guard let contents = try? fm.contentsOfDirectory(atPath: parent.path) else { continue }
            guard contents.isEmpty else { continue }
            FileManager.default.removeItemLogging(atPath: parent.path, context: "story empty media dir")
        }
    }

    // MARK: - Connection Observer

    private func observeConnection() {
        MessageSocketManager.shared.$isConnected
            .removeDuplicates()
            .dropFirst()
            .filter { $0 }
            .receive(on: DispatchQueue.global(qos: .utility))
            .sink { [weak self] _ in
                guard let self else { return }
                Task {
                    // Stabilization delay matches OfflineQueue's pattern.
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    await self.processNext()
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Disk Persistence

    private var queueFileURL: URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let cacheDir = documents.appendingPathComponent("meeshy_cache", isDirectory: true)
        if !FileManager.default.fileExists(atPath: cacheDir.path) {
            do {
                try FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
            } catch {
                Logger(subsystem: "com.meeshy.sdk", category: "story-publish-queue")
                    .error("Cache directory unavailable — the queue file cannot be persisted: \(error.localizedDescription, privacy: .public)")
            }
        }
        return cacheDir.appendingPathComponent(Self.queueFileName)
    }

    private var failedQueueFileURL: URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let cacheDir = documents.appendingPathComponent("meeshy_cache", isDirectory: true)
        if !FileManager.default.fileExists(atPath: cacheDir.path) {
            do {
                try FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
            } catch {
                Logger(subsystem: "com.meeshy.sdk", category: "story-publish-queue")
                    .error("Cache directory unavailable — the queue file cannot be persisted: \(error.localizedDescription, privacy: .public)")
            }
        }
        return cacheDir.appendingPathComponent(Self.failedQueueFileName)
    }

    private func saveToDisk() {
        Self.save(items, to: queueFileURL, encoder: encoder, logger: logger)
    }

    private func saveFailedItemsToDisk() {
        Self.save(failedItems, to: failedQueueFileURL, encoder: encoder, logger: logger)
    }

    private static func save(_ items: [StoryPublishQueueItem], to url: URL, encoder: JSONEncoder, logger: Logger) {
        do {
            let data = try encoder.encode(items)
            try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            logger.error("Failed to save story publish queue file \(url.lastPathComponent): \(error.localizedDescription)")
        }
    }

    private static func loadItemsFromDisk() -> [StoryPublishQueueItem] {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let cacheDir = documents.appendingPathComponent("meeshy_cache", isDirectory: true)
        return loadItems(from: cacheDir.appendingPathComponent(queueFileName))
    }

    private static func loadFailedItemsFromDisk() -> [StoryPublishQueueItem] {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let cacheDir = documents.appendingPathComponent("meeshy_cache", isDirectory: true)
        return loadItems(from: cacheDir.appendingPathComponent(failedQueueFileName))
    }

    private static func loadItems(from url: URL) -> [StoryPublishQueueItem] {
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }

        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode([StoryPublishQueueItem].self, from: data)
        } catch {
            return []
        }
    }
}

// MARK: - Unrecoverable Error Marker

/// Throw this from the `onPublish` handler to mark a publish failure as
/// permanent (4xx HTTP, validation rejected, story expired) so the queue
/// stops retrying and surfaces the failure to the user via `publishFailed`.
public struct StoryPublishUnrecoverableError: Error, Sendable {
    public let message: String

    public init(_ message: String = "Permanent publish failure") {
        self.message = message
    }
}

// MARK: - Test Helpers (internal)

#if DEBUG
extension StoryPublishQueue {
    /// Replaces the in-memory items wholesale. Used by tests to seed a known
    /// state without round-tripping through the disk persistence layer.
    func _testSetItems(_ items: [StoryPublishQueueItem]) {
        self.items = items
    }

    /// Seeds the failed-items history directly, bypassing `processNext()` and
    /// disk persistence — lets tests exercise `retryFailedItem`/
    /// `discardFailedItem`/the cap without driving a real publish failure.
    func _testSetFailedItems(_ items: [StoryPublishQueueItem]) {
        self.failedItems = items
    }

    /// Clears any publish handler left over by a previous test. The queue is a
    /// singleton actor, so a throwing handler leaked from an earlier test lets
    /// `retryFailedItem`'s fire-and-forget drain re-fail the item concurrently
    /// with the current test's assertions.
    func _testResetPublishHandler() {
        onPublish = nil
    }
}
#endif
