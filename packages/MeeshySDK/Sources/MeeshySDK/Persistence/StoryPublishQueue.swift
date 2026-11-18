import Foundation
import Combine
import os

// MARK: - Story Publish Queue

/// Singleton actor that owns the disk-persisted queue of pending story
/// publications, drives the retry loop, and emits success/failure events
/// to the rest of the app via Combine publishers.
public actor StoryPublishQueue {
    public static let shared = StoryPublishQueue()

    /// La trace qu'un échec `.missingLocalMedia` laisse dans `lastError`.
    /// Persistée telle quelle depuis toujours : l'app la reconnaît pour la
    /// dire dans la langue de l'interface, jamais en l'affichant brute.
    public static let missingLocalMediaError = "Un média local est introuvable"

    /// Emitted when a pending publication reaches the server and is assigned
    /// a real post id. ViewModels listen to swap their optimistic
    /// `pending_<uuid>` row with the authoritative server row.
    public nonisolated let publishSucceeded = SendablePassthrough<StoryPublishSuccess>()

    /// Emitted when a pending publication fails permanently (max retries,
    /// missing media, unrecoverable error). The UI should surface this to the
    /// user with an explicit "retry" or "delete draft" action.
    public nonisolated let publishFailed = SendablePassthrough<StoryPublishFailure>()

    private static let maxQueueSize = 50
    /// Budget seul : aucune porte temporelle entre deux passes, déclenchées par
    /// `observeConnection`, `setPublishHandler` et `retryFailedItem`.
    private static let retryPolicy = RetryPolicy.storyPublish
    /// Un item fautif ne doit pas geler les suivants ; une panne réseau ne doit
    /// pas brûler le budget de toute la file. La frontière entre les deux est
    /// le nombre d'échecs retryables CONSÉCUTIFS. Sans porte temporelle entre
    /// deux passes (cf. `retryPolicy`), un `continue` inconditionnel brûlerait
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
    private static let failedQueueFileName = "story_publish_failed_queue.json"

    private var items: [StoryPublishQueueItem] = []
    /// Items that failed permanently (max retries, missing media, server
    /// rejection). Unlike a plain `processNext()` disposal, these are kept
    /// (with their local media) so the UI can list them and offer a manual
    /// retry — see `failedPendingItems`, `retryFailedItem`, `discardFailedItem`.
    private var failedItems: [StoryPublishQueueItem] = []
    private var isProcessing = false
    private var cancellables = Set<AnyCancellable>()
    private let logger = MeeshyLog.logger(.storyPublishQueue, subsystem: .legacySDK)

    private let encoder: JSONEncoder = {
        let e = MeeshyCoders.encoder(.persistence)
        return e
    }()

    private let decoder: JSONDecoder = {
        let d = MeeshyCoders.decoder(.persistence)
        return d
    }()

    /// Publish handler injected by the consuming app. Receives a queue item
    /// and either:
    ///   - returns the server-assigned story id on success
    ///   - throws an `Error` to signal a retryable failure (network, 5xx)
    ///   - throws `StoryPublishUnrecoverableError` to signal a permanent
    ///     failure (4xx, validation) that should NOT be retried
    public var onPublish: (@concurrent (StoryPublishQueueItem) async throws -> String)?

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
            // #13415 — la plus ancienne cède sa place dans la FILE, jamais sur
            // l'appareil : elle passe dans l'historique des échecs, avec ses
            // médias, où l'auteur la reprend ou la supprime.
            var dropped = items.removeFirst()
            dropped.lastError = "File d'envoi pleine"
            addToFailedItems(dropped)
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

    /// Les items EN ATTENTE que personne ne publie en ce moment (#10331) —
    /// ceux qu'une annulation retirerait.
    public var waitingItems: [StoryPublishQueueItem] {
        items.filter { !inFlightIds.contains($0.id) }
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

    /// Classe un item EN ATTENTE comme échec définitif, sans le rejouer : le
    /// chemin en ligne a reçu un refus que la passerelle rendra à chaque
    /// tentative (#7907). L'item rejoint l'historique d'échecs, médias gardés
    /// pour une reprise manuelle, et `publishFailed` l'annonce comme tout échec
    /// définitif du drain. No-op si l'id n'est plus en attente.
    public func failPermanently(_ itemId: String, message: String) {
        inFlightIds.remove(itemId)
        guard let idx = items.firstIndex(where: { $0.id == itemId }) else { return }
        var item = items.remove(at: idx)
        item.lastError = message
        addToFailedItems(item)
        saveToDisk()
        publishFailed.send(StoryPublishFailure(
            queueId: item.id,
            tempStoryId: item.tempStoryId,
            reason: .unrecoverable(message: message),
            draftId: item.draftId
        ))
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

    /// **Annuler une story EN ATTENTE d'envoi** (#10331) — le geste de
    /// l'auteur, avant que la file ne la publie. Un item revendiqué
    /// (`inFlightIds`) est en train de partir : il n'est pas retiré sous les
    /// pieds de son téléversement, et l'appelant le dit.
    public func cancelPendingItem(_ itemId: String) -> StoryPendingCancellation {
        guard let idx = items.firstIndex(where: { $0.id == itemId }) else { return .notFound }
        guard !inFlightIds.contains(itemId) else { return .inFlight }
        let item = items.remove(at: idx)
        removeLocalMedia(of: item)
        saveToDisk()
        return .removed
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
                guard await cancellableSleep(for: .milliseconds(Int.random(in: 200...700))) else { break }
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
            } catch is StoryPublishDeferredError {
                // Pas un ESSAI : personne pour publier (exécuteur démonté). Aucun budget consommé, et la passe
                // s'arrête — les items suivants n'ont pas plus d'exécuteur que celui-ci.
                logger.info("Story publication deferred — no executor; kept without charging its retry budget")
                break
            } catch {
                // Échec retryable : on charge le budget de CET item puis on
                // poursuit sur les suivants — ils sont indépendants et
                // potentiellement publiables. Seule une SÉRIE d'échecs
                // (cf. `maxConsecutiveRetryableFailures`) fait conclure à une
                // panne réseau et arrête la passe.
                if let idx = items.firstIndex(where: { $0.id == item.id }) {
                    items[idx].retryCount += 1
                    items[idx].lastError = error.localizedDescription

                    if Self.retryPolicy.isExhausted(afterFailures: items[idx].retryCount) {
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
                item.lastError = Self.missingLocalMediaError
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

    /// Appends a permanently-failed item to the retry-able history. #13415 —
    /// no cap: a story the author did not publish leaves the device only by
    /// their gesture (`discardFailedItem`) or a successful retry.
    private func addToFailedItems(_ item: StoryPublishQueueItem) {
        failedItems.append(item)
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
                    guard await cancellableSleep(for: QueueTiming.reconnectSettle) else { return }
                    await self.processNext()
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Disk Persistence

    private var queueFileURL: URL {
        let cacheDir = MeeshyCacheDirectory.ensured { error in
            MeeshyLog.logger(.storyPublishQueue, subsystem: .legacySDK)
                .error("Cache directory unavailable — the queue file cannot be persisted: \(error.localizedDescription, privacy: .public)")
        }
        return cacheDir.appendingPathComponent(Self.queueFileName)
    }

    private var failedQueueFileURL: URL {
        let cacheDir = MeeshyCacheDirectory.ensured { error in
            MeeshyLog.logger(.storyPublishQueue, subsystem: .legacySDK)
                .error("Cache directory unavailable — the queue file cannot be persisted: \(error.localizedDescription, privacy: .public)")
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
        let cacheDir = MeeshyCacheDirectory.url
        return loadItems(from: cacheDir.appendingPathComponent(queueFileName))
    }

    private static func loadFailedItemsFromDisk() -> [StoryPublishQueueItem] {
        let cacheDir = MeeshyCacheDirectory.url
        return loadItems(from: cacheDir.appendingPathComponent(failedQueueFileName))
    }

    private static func loadItems(from url: URL) -> [StoryPublishQueueItem] {
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }

        do {
            let data = try Data(contentsOf: url)
            let decoder = MeeshyCoders.decoder(.persistence)
            return try decoder.decode([StoryPublishQueueItem].self, from: data)
        } catch {
            return []
        }
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
