import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Attachment Download Center (UN téléchargement par média, partagé)

/// **Le registre UNIQUE des téléchargements de médias de l'app** (#7492).
///
/// Chaque surface qui montre un média (tuile de bulle, rangée plate, carrousel,
/// galerie plein écran, widget audio, feed) possédait son propre
/// `AttachmentDownloader` et donc son PROPRE état : une vidéo montrée par deux
/// surfaces avait deux téléchargements indépendants, dont aucun ne voyait
/// l'autre. Un fichier fini par la galerie laissait la bulle sur « télécharger »,
/// et toucher ce bouton re-téléchargeait le fichier entier.
///
/// Le centre tient désormais, par CLÉ DE CACHE (l'URL résolue — la même clé
/// que `DiskCacheStore`), le seul téléchargement en cours et sa progression,
/// et diffuse chaque événement à toutes les surfaces qui observent cette clé :
/// - une clé déjà sur disque se termine SANS réseau (le cache local fait foi) ;
/// - une seconde demande sur une clé en cours la REJOINT au lieu d'en ouvrir
///   une seconde ;
/// - l'annulation, la fin et l'échec valent pour toutes les surfaces à la fois.
///
/// `AttachmentDownloader` n'est plus qu'une FAÇADE par vue sur ce centre.
@MainActor
final class AttachmentDownloadCenter {
    // Même garde que les autres classes MainActor du dépôt (SE-0466, iOS 26.1).
    nonisolated deinit {}

    static let shared = AttachmentDownloadCenter()

    enum CacheStoreKind: Sendable {
        case audio, image, video
    }

    /// Les retours haptiques qu'un téléchargement DEMANDÉ produit. Injectés
    /// pour qu'un témoin puisse prouver qu'un préchargement n'en produit
    /// aucun (#7625) — le défaut en ligne de `HapticFeedback` ne se mesure pas.
    enum Haptic: Equatable, Sendable {
        case light, success, error
    }

    private let haptics: @MainActor (Haptic) -> Void
    /// Les clés lancées par `prefetch` : leur fin et leur échec ne vibrent pas.
    private var silentKeys: Set<String> = []

    init(haptics: @escaping @MainActor (Haptic) -> Void = { AttachmentDownloadCenter.playHaptic($0) }) {
        self.haptics = haptics
    }

    static func playHaptic(_ haptic: Haptic) {
        switch haptic {
        case .light: HapticFeedback.light()
        case .success: HapticFeedback.success()
        case .error: HapticFeedback.error()
        }
    }

    struct DownloadProgress: Equatable, Sendable {
        let downloadedBytes: Int64
        let totalBytes: Int64
    }

    enum Event: Equatable, Sendable {
        case progress(DownloadProgress)
        case finished(totalBytes: Int64)
        case failed
        case cancelled
    }

    private var active: [String: DownloadProgress] = [:]
    private var tasks: [String: Task<Void, Never>] = [:]
    private var byteTasks: [String: Task<Data, Error>] = [:]
    private let subject = PassthroughSubject<(key: String, event: Event), Never>()

    /// La clé d'un média — celle sous laquelle le cache typé le range.
    nonisolated static func key(for urlString: String) -> String {
        MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
    }

    /// Progression du téléchargement EN COURS pour `key`, ou `nil`.
    func progress(for key: String) -> DownloadProgress? {
        active[key]
    }

    /// Les événements d'une seule clé — ce qu'une façade observe.
    func events(for key: String) -> AnyPublisher<Event, Never> {
        subject
            .filter { $0.key == key }
            .map { $0.event }
            .eraseToAnyPublisher()
    }

    /// Point d'émission UNIQUE : met à jour l'état tenu puis diffuse.
    func publish(_ event: Event, for key: String) {
        switch event {
        case .progress(let progress):
            active[key] = progress
        case .finished, .failed, .cancelled:
            active[key] = nil
            tasks[key] = nil
            byteTasks[key] = nil
        }
        subject.send((key: key, event: event))
    }

    /// Lance le téléchargement de `urlString` dans le cache typé — ou rejoint
    /// celui qui tourne déjà pour la même clé.
    func start(urlString: String, expectedSize: Int64, cacheStore: CacheStoreKind) {
        guard launch(urlString: urlString, expectedSize: expectedSize, cacheStore: cacheStore) else { return }
        haptics(.light)
    }

    /// **Précharge `urlString` en SILENCE** (#7625) — le média que l'écran
    /// montrera au geste suivant (le réel qui suit l'actif). Même registre,
    /// même clé, même dédoublonnage que `start` : la surface montée plus tard
    /// REJOINT ce téléchargement, ou le trouve fini. Aucune vibration, ni au
    /// départ ni à la fin : l'utilisateur n'a rien demandé.
    func prefetch(urlString: String, expectedSize: Int64, cacheStore: CacheStoreKind) {
        let key = Self.key(for: urlString)
        guard launch(urlString: urlString, expectedSize: expectedSize, cacheStore: cacheStore) else { return }
        silentKeys.insert(key)
    }

    /// `false` quand il n'y a rien à lancer — URL vide, ou clé déjà en cours.
    private func launch(urlString: String, expectedSize: Int64, cacheStore: CacheStoreKind) -> Bool {
        guard !urlString.isEmpty else { return false }
        let key = Self.key(for: urlString)
        guard tasks[key] == nil else { return false }
        publish(.progress(DownloadProgress(downloadedBytes: 0, totalBytes: expectedSize)), for: key)
        tasks[key] = Task.detached { [weak self] in
            guard let self else { return }
            await self.run(key: key, urlString: urlString, expectedSize: expectedSize, cacheStore: cacheStore)
        }
        return true
    }

    /// Annule le téléchargement de `key` — pour TOUTES les surfaces qui le montrent.
    func cancel(key: String) {
        guard tasks[key] != nil else { return }
        byteTasks[key]?.cancel()
        tasks[key]?.cancel()
        silentKeys.remove(key)
        publish(.cancelled, for: key)
        haptics(.light)
    }

    private func registerByteTask(_ task: Task<Data, Error>, for key: String) {
        byteTasks[key] = task
    }

    private func finish(key: String, size: Int64) {
        guard tasks[key] != nil else { return }
        let silent = silentKeys.remove(key) != nil
        publish(.finished(totalBytes: size), for: key)
        if !silent { haptics(.success) }
    }

    private func fail(key: String) {
        guard tasks[key] != nil else { return }
        let silent = silentKeys.remove(key) != nil
        publish(.failed, for: key)
        if !silent { haptics(.error) }
    }

    private func report(key: String, downloaded: Int64? = nil, total: Int64? = nil) {
        guard tasks[key] != nil, let current = active[key] else { return }
        publish(
            .progress(DownloadProgress(
                downloadedBytes: downloaded ?? current.downloadedBytes,
                totalBytes: total ?? current.totalBytes
            )),
            for: key
        )
    }

    /// Streams URLSession.bytes, publie la progression, persiste dans le cache
    /// typé sous la clé canonique résolue.
    private nonisolated func run(
        key resolvedKey: String,
        urlString: String,
        expectedSize: Int64,
        cacheStore: CacheStoreKind
    ) async {
        do {
            guard let url = MeeshyConfig.resolveMediaURL(urlString) else { throw URLError(.badURL) }
            let store: DiskCacheStore
            switch cacheStore {
            case .audio: store = await CacheCoordinator.shared.audio
            case .image: store = await CacheCoordinator.shared.images
            case .video: store = await CacheCoordinator.shared.video
            }

            // Le cache local fait FOI : un média déjà sur disque (téléchargé
            // par une autre surface, un prefetch, une session précédente) se
            // termine sans le moindre octet réseau.
            if await store.isCached(resolvedKey) {
                let size = store.cachedFileURL(for: resolvedKey)
                    .flatMap { try? $0.resourceValues(forKeys: [.fileSizeKey]).fileSize }
                    .map(Int64.init) ?? expectedSize
                await finish(key: resolvedKey, size: size)
                return
            }

            // Piggyback: another path (conversation prefetch, the player
            // warm-up) is ALREADY fetching this media through the store's
            // network funnel. Await that fetch instead of opening a duplicate
            // connection — duplicate concurrent downloads of the same voice
            // note were observed saturating slow cellular links (NSURLError
            // -1001 bursts). Byte-level progress isn't available on this path.
            if let existing = await store.inFlightDownload(for: resolvedKey) {
                let data = try await existing.value
                await finish(key: resolvedKey, size: Int64(data.count))
                return
            }

            // Stream the bytes ourselves (progress UI) and persist into the
            // typed cache INSIDE the task, then register it in the store's
            // funnel so concurrent `data(for:)`/`image(for:)` callers coalesce
            // onto this download.
            let byteTask = Task<Data, Error> { [weak self] in
                let (asyncBytes, response) = try await URLSession.shared.bytes(from: url)

                guard let http = response as? HTTPURLResponse,
                      (200...299).contains(http.statusCode) else {
                    throw URLError(.badServerResponse)
                }

                let expectedLength = http.expectedContentLength
                if expectedLength > 0 {
                    await self?.report(key: resolvedKey, total: expectedLength)
                }

                var data = Data()
                if expectedLength > 0 {
                    data.reserveCapacity(Int(expectedLength))
                }

                var buffer = [UInt8]()
                buffer.reserveCapacity(16384)

                for try await byte in asyncBytes {
                    try Task.checkCancellation()
                    buffer.append(byte)

                    if buffer.count >= 16384 {
                        data.append(contentsOf: buffer)
                        buffer.removeAll(keepingCapacity: true)
                        let current = Int64(data.count)
                        await self?.report(key: resolvedKey, downloaded: current)
                    }
                }

                try Task.checkCancellation()

                if !buffer.isEmpty {
                    data.append(contentsOf: buffer)
                }

                // Seed under the exact key the renderer resolves to — a
                // download must never need to re-fetch on the next render.
                // Persisted before returning so funnel piggybackers observe a
                // warm cache.
                await store.store(data, for: resolvedKey)
                return data
            }
            // registerInFlightDownload returns false when another call
            // registered its own download for this exact key between the
            // piggyback check above and this attempt — a race the initial
            // `inFlightDownload(for:)` read can't close by itself. Honor the
            // Bool: only claim ownership (and the cancel wiring) when we
            // actually won the race; otherwise cancel our now-redundant task
            // and piggyback on the winner.
            let registered = await store.registerInFlightDownload(byteTask, for: resolvedKey)
            let data: Data
            if registered {
                await registerByteTask(byteTask, for: resolvedKey)
                data = try await byteTask.value
            } else {
                byteTask.cancel()
                if let existing = await store.inFlightDownload(for: resolvedKey) {
                    data = try await existing.value
                } else {
                    // The registry entry can self-clear between our failed
                    // `register` and this read (two actor hops). Falling back
                    // to OUR own just-cancelled `byteTask` would throw
                    // `CancellationError`, which the catch below swallows,
                    // stranding the download forever. Read through the store's
                    // own idempotent fetch instead: a cache hit if the winner
                    // already persisted, or a fresh coalesced fetch otherwise.
                    data = try await store.data(for: resolvedKey)
                }
            }

            if case .image = cacheStore, let image = UIImage(data: data) {
                DiskCacheStore.cacheImageForPreview(image, key: resolvedKey)
            }

            await finish(key: resolvedKey, size: Int64(data.count))
        } catch {
            guard !Task.isCancelled, !(error is CancellationError) else { return }
            await fail(key: resolvedKey)
        }
    }
}

// MARK: - Attachment Downloader (façade par vue sur le centre)

/// La vue d'UNE surface sur le téléchargement d'un média. Elle ne télécharge
/// rien elle-même : elle observe la clé de son média dans
/// `AttachmentDownloadCenter` et en recopie l'état — si bien que deux surfaces
/// qui montrent le même média affichent la MÊME progression, finissent
/// ensemble, et qu'un média déjà en cache n'est jamais re-téléchargé (#7492).
@MainActor
final class AttachmentDownloader: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var isCached = false
    @Published var isDownloading = false
    @Published var downloadedBytes: Int64 = 0
    @Published var totalBytes: Int64 = 0
    /// The `urlString` of the in-flight download, or `nil` when idle. One
    /// downloader is shared across all language URLs of an audio bubble, so the
    /// UI must check the in-flight download is for the URL it is rendering — see
    /// `resolvedAvailability`.
    @Published var downloadingURL: String?

    typealias CacheStoreKind = AttachmentDownloadCenter.CacheStoreKind

    private let center: AttachmentDownloadCenter
    private var observedKey: String?
    private var observedURL: String?
    private var subscription: AnyCancellable?

    init(center: AttachmentDownloadCenter = .shared) {
        self.center = center
    }

    var progress: Double {
        guard totalBytes > 0 else { return 0 }
        return min(Double(downloadedBytes) / Double(totalBytes), 1.0)
    }

    /// Pure resolution of the displayed `AudioAvailability` for a SPECIFIC
    /// selected url, given the shared downloader's state. The `.downloading`
    /// state is only surfaced when the in-flight download (`downloadingURL`) is
    /// the `currentURL` being rendered — otherwise switching audio language
    /// mid-download would show the OTHER language's progress on the newly
    /// selected one. Idle/cached/other-url cases fall through to the per-url
    /// resting resolution.
    nonisolated static func resolvedAvailability(
        isDownloading: Bool,
        downloadingURL: String?,
        currentURL: String,
        isCached: Bool,
        progress: Double,
        downloadedBytes: Int64,
        totalBytes: Int64,
        resting: AudioAvailability
    ) -> AudioAvailability {
        if isDownloading, downloadingURL == currentURL {
            return .downloading(progress: progress, downloadedBytes: downloadedBytes, totalBytes: totalBytes)
        }
        if isCached { return .ready }
        return resting
    }

    /// Branche cette façade sur le téléchargement du média — SANS rien lancer.
    /// Un téléchargement déjà en cours ailleurs (autre surface, auto-DL)
    /// s'affiche aussitôt ici, et sa fin fera passer ce média à « prêt ».
    func observe(_ attachment: MessageAttachment) {
        observe(url: attachment.fileUrl)
    }

    /// Même branchement, pour une URL qui n'est pas celle de la pièce jointe
    /// (piste audio traduite).
    func observe(url urlString: String) {
        let key = AttachmentDownloadCenter.key(for: urlString)
        guard key != observedKey else { return }
        observedKey = key
        observedURL = urlString
        isCached = false
        subscription = center.events(for: key)
            .sink { [weak self] event in self?.apply(event, url: urlString) }
        if let progress = center.progress(for: key) {
            apply(.progress(progress), url: urlString)
        } else if isDownloading {
            isDownloading = false
            downloadingURL = nil
            downloadedBytes = 0
        }
    }

    private func apply(_ event: AttachmentDownloadCenter.Event, url: String) {
        switch event {
        case .progress(let progress):
            isDownloading = true
            downloadingURL = url
            downloadedBytes = progress.downloadedBytes
            totalBytes = progress.totalBytes
        case .finished(let total):
            downloadedBytes = total
            totalBytes = total
            isDownloading = false
            downloadingURL = nil
            isCached = true
        case .failed:
            isDownloading = false
            downloadingURL = nil
        case .cancelled:
            isDownloading = false
            downloadingURL = nil
            downloadedBytes = 0
        }
    }

    /// Resolves whether the attachment's media is already available locally.
    /// Routes to the correct typed cache store via `attachment.type` and
    /// short-circuits on `file://` — local optimistic media is, by definition,
    /// already on disk and never needs a download badge. See Sprint 3 RC3.2.
    func checkCache(_ attachment: MessageAttachment) async {
        let urlString = attachment.fileUrl
        observe(url: urlString)
        if urlString.hasPrefix("file://") {
            if FileManager.default.fileExists(atPath: URL(string: urlString)?.path ?? "") {
                isCached = true
            }
            return
        }
        let resolved = AttachmentDownloadCenter.key(for: urlString)
        let cached: Bool
        switch attachment.type {
        case .audio: cached = await CacheCoordinator.shared.audio.isCached(resolved)
        case .video: cached = await CacheCoordinator.shared.video.isCached(resolved)
        case .image: cached = await CacheCoordinator.shared.images.isCached(resolved)
        case .file, .location: cached = false
        }
        if cached { isCached = true }
    }

    func start(attachment: MessageAttachment, onShare: ((URL) -> Void)?) {
        let store: CacheStoreKind
        switch attachment.type {
        case .audio: store = .audio
        case .image: store = .image
        case .video: store = .video
        case .file, .location:
            // No typed cache for file/location — manual download paths handle these.
            return
        }
        startDownloadFlow(
            urlString: attachment.fileUrl,
            expectedSize: Int64(attachment.fileSize),
            cacheStore: store
        )
    }

    /// Download a translated audio (HTTPS URL distinct from the original
    /// attachment). The translated audio's file size is not yet exposed by
    /// the backend (spec §7 follow-up) — `fileSize == 0` is tolerated and
    /// the response's Content-Length header is used as the total during DL.
    /// Note: if the network shifts wifi -> cellular while downloading, the
    /// download continues. The policy gates triggering, not continuation
    /// (spec §14.2, consistent with WhatsApp / Telegram).
    func startTranslatedAudio(url: String, fileSize: Int64) {
        startDownloadFlow(urlString: url, expectedSize: fileSize, cacheStore: .audio)
    }

    private func startDownloadFlow(urlString: String, expectedSize: Int64, cacheStore: CacheStoreKind) {
        guard !urlString.isEmpty else { return }
        observe(url: urlString)
        guard !isDownloading, !isCached else { return }
        center.start(urlString: urlString, expectedSize: expectedSize, cacheStore: cacheStore)
    }

    func cancel() {
        guard let observedKey else { return }
        center.cancel(key: observedKey)
    }

    /// Delegates to the single SDK-wide `formatMediaFileSize` helper (see
    /// `MediaTypes.swift`) so download badges, the audio play-button label
    /// and upload progress all render the exact same string for a given
    /// byte count.
    static func fmt(_ bytes: Int64) -> String {
        formatMediaFileSize(bytes)
    }
}
