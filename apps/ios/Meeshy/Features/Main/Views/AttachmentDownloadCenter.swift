import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Media Download Origin

/// **Qui a demandé ce téléchargement** (#8573). Seul un téléchargement
/// `manual` — provoqué par un tap de l'utilisateur — produit un retour
/// haptique ; un téléchargement `automatic` (politique réseau, feed, galerie,
/// préchargement) reste muet, au départ comme à la fin ou à l'échec.
/// Paramètre OBLIGATOIRE à chaque lancement : chaque site DÉCLARE son origine.
enum MediaDownloadOrigin: Equatable, Sendable {
    case manual
    case automatic
}

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

    /// Les retours haptiques qu'un téléchargement MANUEL produit. Injectés
    /// pour qu'un témoin puisse prouver qu'un téléchargement automatique n'en
    /// produit aucun (#7625, #8573) — le défaut en ligne de `HapticFeedback`
    /// ne se mesure pas.
    enum Haptic: Equatable, Sendable {
        case light, success, error
    }

    private let haptics: @MainActor (Haptic) -> Void
    /// L'origine de chaque téléchargement en cours : seule une clé `manual`
    /// vibre à sa fin ou à son échec.
    private var origins: [String: MediaDownloadOrigin] = [:]
    /// Le profil le plus fort demandé pour chaque clé en vol (#11283) : un
    /// préchargement lointain rejoint par une lecture ou un tap ne garde pas
    /// ses restrictions.
    private var requestedProfiles: [String: MediaTransferProfile] = [:]

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
    private let subject = PassthroughSubject<(key: String, event: Event), Never>()
    /// Les passes qui attendent la fin d'une clé (`awaitEnd(of:)`), reprises
    /// par `publish` à la fin — jamais par une relecture à cadence fixe.
    private var endWaiters: [String: [UUID: CheckedContinuation<Event?, Never>]] = [:]

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

    /// Le premier événement de `key` qui satisfait `predicate`, attendu sans
    /// bloquer — `nil` si la tâche qui attend est annulée (#11550).
    ///
    /// Le tri se fait AVANT le passage en `async` : `.values` ne redemande un
    /// élément qu'une fois le précédent consommé, et le sujet sans tampon
    /// jette ce qu'il émet entre-temps — la fin qui suit de près une
    /// progression se perdait, et la case restait floue.
    func firstEvent(for key: String, where predicate: @escaping (Event) -> Bool) async -> Event? {
        for await event in events(for: key).first(where: predicate).values {
            return event
        }
        return nil
    }

    /// **La fin du téléchargement de `key`, signalée** (#9882) — finie,
    /// échouée ou annulée —, `nil` si rien n'est en cours ou si la tâche qui
    /// attend est annulée. L'attente s'inscrit sur le fil principal dans le
    /// même pas que la lecture de l'état : aucune fin ne peut passer entre les
    /// deux, et rien ne relit l'état à cadence fixe.
    @discardableResult
    func awaitEnd(of key: String) async -> Event? {
        guard active[key] != nil, !Task.isCancelled else { return nil }
        let id = UUID()
        return await withTaskCancellationHandler {
            await withCheckedContinuation { (continuation: CheckedContinuation<Event?, Never>) in
                endWaiters[key, default: [:]][id] = continuation
            }
        } onCancel: {
            Task { @MainActor in self.resumeEndWaiter(key: key, id: id, with: nil) }
        }
    }

    /// Le nombre de passes qui attendent la fin de `key`.
    func endWaiterCount(for key: String) -> Int {
        endWaiters[key]?.count ?? 0
    }

    private func resumeEndWaiter(key: String, id: UUID, with event: Event?) {
        guard let continuation = endWaiters[key]?.removeValue(forKey: id) else { return }
        if endWaiters[key]?.isEmpty == true { endWaiters[key] = nil }
        continuation.resume(returning: event)
    }

    /// Point d'émission UNIQUE : met à jour l'état tenu puis diffuse.
    func publish(_ event: Event, for key: String) {
        switch event {
        case .progress(let progress):
            active[key] = progress
        case .finished, .failed, .cancelled:
            active[key] = nil
            tasks[key] = nil
            requestedProfiles[key] = nil
            endWaiters.removeValue(forKey: key)?.values.forEach { $0.resume(returning: event) }
        }
        subject.send((key: key, event: event))
    }

    /// Lance le téléchargement de `urlString` dans le cache typé — ou rejoint
    /// celui qui tourne déjà pour la même clé. Seule l'origine `manual` vibre,
    /// au départ, à la fin et à l'échec (#8573).
    func start(urlString: String, expectedSize: Int64, cacheStore: CacheStoreKind, origin: MediaDownloadOrigin) {
        let key = Self.key(for: urlString)
        guard launch(urlString: urlString, expectedSize: expectedSize, cacheStore: cacheStore) else { return }
        origins[key] = origin
        if origin == .manual { haptics(.light) }
    }

    /// **Précharge `urlString` en SILENCE** (#7625) — le média que l'écran
    /// montrera au geste suivant (le réel qui suit l'actif). Même registre,
    /// même clé, même dédoublonnage que `start` : la surface montée plus tard
    /// REJOINT ce téléchargement, ou le trouve fini. Aucune vibration, ni au
    /// départ ni à la fin : l'utilisateur n'a rien demandé. `profile` choisit la
    /// session réseau (#11283) : un préchargement lointain la veut
    /// discrétionnaire, et hors réseau facturé si le réglage vidéo le demande.
    func prefetch(
        urlString: String,
        expectedSize: Int64,
        cacheStore: CacheStoreKind,
        profile: MediaTransferProfile = .standard
    ) {
        guard launch(urlString: urlString, expectedSize: expectedSize, cacheStore: cacheStore, profile: profile) else {
            return
        }
        origins[Self.key(for: urlString)] = .automatic
    }

    /// `false` quand il n'y a rien à lancer — URL vide, ou clé déjà en cours.
    private func launch(
        urlString: String,
        expectedSize: Int64,
        cacheStore: CacheStoreKind,
        profile: MediaTransferProfile = .standard
    ) -> Bool {
        guard !urlString.isEmpty else { return false }
        let key = Self.key(for: urlString)
        guard tasks[key] == nil else {
            requestedProfiles[key] = requestedProfiles[key].map { $0.merged(with: profile) } ?? profile
            return false
        }
        publish(.progress(DownloadProgress(downloadedBytes: 0, totalBytes: expectedSize)), for: key)
        requestedProfiles[key] = profile
        tasks[key] = Task.detached { [weak self] in
            guard let self else { return }
            await self.run(key: key, urlString: urlString, expectedSize: expectedSize, cacheStore: cacheStore, profile: profile)
        }
        return true
    }

    /// Le profil le plus fort demandé pour `key` en vol, ou `nil`.
    func requestedProfile(for key: String) -> MediaTransferProfile? {
        requestedProfiles[key]
    }

    /// Le profil avec lequel reprendre `key` quand le transfert ouvert avec
    /// `profile` a échoué sur le réseau — `nil` s'il couvrait déjà la demande.
    private func escalatedProfile(for key: String, beyond profile: MediaTransferProfile) -> MediaTransferProfile? {
        guard let requested = requestedProfiles[key], !profile.covers(requested) else { return nil }
        return requested
    }

    /// Annule le téléchargement de `key` — pour TOUTES les surfaces qui le montrent.
    func cancel(key: String) {
        guard tasks[key] != nil else { return }
        tasks[key]?.cancel()
        origins[key] = nil
        publish(.cancelled, for: key)
        haptics(.light)
    }

    /// **Annule EN SILENCE un préchargement devenu inutile** (#9702) — le réel
    /// sorti de la fenêtre du pager. Aucune vibration (l'utilisateur n'a rien
    /// demandé), et jamais un téléchargement qu'un tap a lancé : celui-là
    /// appartient à l'utilisateur.
    func cancelPrefetch(urlString: String) {
        let key = Self.key(for: urlString)
        guard tasks[key] != nil, origins[key] != .manual else { return }
        tasks[key]?.cancel()
        origins[key] = nil
        publish(.cancelled, for: key)
    }

    private func finish(key: String, size: Int64) {
        guard tasks[key] != nil else { return }
        let origin = origins.removeValue(forKey: key)
        publish(.finished(totalBytes: size), for: key)
        if origin == .manual { haptics(.success) }
    }

    private func fail(key: String) {
        guard tasks[key] != nil else { return }
        let origin = origins.removeValue(forKey: key)
        publish(.failed, for: key)
        if origin == .manual { haptics(.error) }
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

    /// Télécharge EN FLUX vers un fichier par le funnel du cache typé (#9863),
    /// publie la progression, et range le média sous la clé canonique résolue.
    ///
    /// Le funnel (`DiskCacheStore.data(for:progress:)`) tient à lui seul ce que
    /// ce centre faisait à la main : dédoublonnage avec tout autre chemin en vol
    /// (préchargement, lecteur), directives de fraîcheur (#9478), fichier de
    /// transit déplacé dans le cache sans relecture. Annuler la tâche de la clé
    /// annule le transfert qu'elle a ouvert.
    private nonisolated func run(
        key resolvedKey: String,
        urlString: String,
        expectedSize: Int64,
        cacheStore: CacheStoreKind,
        profile: MediaTransferProfile
    ) async {
        do {
            guard MeeshyConfig.resolveMediaURL(urlString) != nil else { throw URLError(.badURL) }
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

            let data = try await download(from: store, resolvedKey: resolvedKey, profile: profile)

            if case .image = cacheStore, let image = UIImage(data: data) {
                DiskCacheStore.cacheImageForPreview(image, key: resolvedKey)
            }

            await finish(key: resolvedKey, size: Int64(data.count))
        } catch {
            // Seule l'annulation de CETTE clé (déjà publiée par `cancel`) se
            // tait : un transfert rejoint puis annulé ailleurs (purge) doit
            // sortir en échec, sinon la surface resterait sur « téléchargement ».
            guard !Task.isCancelled else { return }
            await fail(key: resolvedKey)
        }
    }

    /// Le funnel du store, avec le profil demandé. Si le transfert échoue sur
    /// le réseau alors qu'une demande plus forte l'a rejoint entre-temps
    /// (palier proche, tap), il reprend UNE fois avec le profil relevé.
    private nonisolated func download(
        from store: DiskCacheStore,
        resolvedKey: String,
        profile: MediaTransferProfile
    ) async throws -> Data {
        do {
            return try await store.data(for: resolvedKey, profile: profile, progress: progressReporter(for: resolvedKey))
        } catch let error as URLError {
            guard let stronger = await escalatedProfile(for: resolvedKey, beyond: profile) else { throw error }
            return try await store.data(for: resolvedKey, profile: stronger, progress: progressReporter(for: resolvedKey))
        }
    }

    /// La progression arrive cadencée par le téléchargeur (au plus ~10
    /// rapports par seconde), jamais un saut MainActor par paquet.
    private nonisolated func progressReporter(for resolvedKey: String) -> MediaFileDownloader.ProgressHandler {
        { [weak self] written, expected in
            Task { @MainActor in
                self?.report(key: resolvedKey, downloaded: written, total: expected > 0 ? expected : nil)
            }
        }
    }
}

// MARK: - Présence sur l'appareil (règle SYNCHRONE, #10370)

/// **« Ce média est-il déjà sur l'appareil ? » se lit par UNE règle
/// synchrone** (#10370) — un `stat`, sous la clé exacte du cache typé, sans
/// saut d'acteur.
///
/// Les surfaces partaient de `.needsDownload` et ne consultaient le disque
/// qu'au retour d'une tâche asynchrone : un média déjà téléchargé se
/// dessinait d'abord « ↓ », puis basculait. Le badge d'image, lui, ne
/// regardait que l'ORIGINAL alors que la bulle affiche une VARIANTE — la
/// variante sur le disque laissait le badge en place pour toujours. Chaque
/// surface lit désormais cette règle au premier rendu ; la résolution
/// asynchrone garde le dernier mot (elle consulte aussi le cache mémoire).
extension AttachmentDownloadCenter {
    /// Sonde le cache typé de `kind` sous `key` (clé déjà résolue). Pour
    /// l'image, une variante décodée résidente en mémoire compte aussi : la
    /// bulle décode sous une clé dimensionnée, le fichier nu peut manquer
    /// alors que l'image est bel et bien affichée.
    nonisolated static func isInTypedStore(key: String, kind: CacheStoreKind) -> Bool {
        switch kind {
        case .audio:
            return CacheCoordinator.audioLocalFileURL(for: key) != nil
        case .video:
            return CacheCoordinator.videoLocalFileURL(for: key) != nil
        case .image:
            return CacheCoordinator.imageLocalFileURL(for: key) != nil
                || DiskCacheStore.hasAnyCachedImageVariant(for: key)
        }
    }

    /// `true` quand `urlString` est sur l'appareil : fichier local `file://`
    /// existant, ou média rangé dans le cache typé sous la MÊME clé que celle
    /// du téléchargement (`key(for:)`) — une clé de stockage brute
    /// (`2025/10/<id>/p.jpg`) se cherche donc sous son URL résolue.
    nonisolated static func isOnDevice(
        urlString: String,
        kind: CacheStoreKind,
        stat: (String, CacheStoreKind) -> Bool = { AttachmentDownloadCenter.isInTypedStore(key: $0, kind: $1) },
        fileExists: (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }
    ) -> Bool {
        guard !urlString.isEmpty else { return false }
        if urlString.hasPrefix("file://") {
            return fileExists(URL(string: urlString)?.path ?? "")
        }
        return stat(key(for: urlString), kind)
    }

    /// La présence d'une PIÈCE JOINTE. Une image est sur l'appareil dès
    /// qu'UNE de ses formes l'est : l'original, la variante que la surface
    /// affiche (`displayedURL`), ou toute variante déclarée.
    nonisolated static func isOnDevice(
        _ attachment: MessageAttachment,
        displayedURL: String? = nil,
        stat: (String, CacheStoreKind) -> Bool = { AttachmentDownloadCenter.isInTypedStore(key: $0, kind: $1) },
        fileExists: (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }
    ) -> Bool {
        switch attachment.type {
        case .image:
            return imageCandidates(attachment, displayedURL: displayedURL).contains { candidate in
                isOnDevice(urlString: candidate, kind: .image, stat: stat, fileExists: fileExists)
            }
        case .audio:
            return isOnDevice(urlString: attachment.fileUrl, kind: .audio, stat: stat, fileExists: fileExists)
        case .video:
            return isOnDevice(urlString: attachment.fileUrl, kind: .video, stat: stat, fileExists: fileExists)
        case .file, .location:
            return false
        }
    }

    /// Les formes d'une image, l'original d'abord puis la variante affichée.
    nonisolated private static func imageCandidates(_ attachment: MessageAttachment, displayedURL: String?) -> [String] {
        let variants = (attachment.imageVariants ?? []).map { $0.url }
        return ([attachment.fileUrl, displayedURL ?? ""] + variants).filter { !$0.isEmpty }
    }
}

// MARK: - Bubble Image Source Law (ce qui est sur l'appareil d'abord)

/// **La source qu'une case d'image AFFICHE** : une forme déjà sur l'appareil
/// passe avant la variante qu'il faudrait encore télécharger.
///
/// La case choisissait la plus petite variante qui couvre sa largeur
/// (`ImageVariantSelector`, bande passante 5.2), alors que le bouton
/// « télécharger » de la bulle rapatrie l'ORIGINAL. Tant que la politique
/// d'auto-téléchargement refusait, la variante restait absente et la photo
/// restait sur son aperçu flou — nette en plein écran, floue dans le fil.
/// L'ordre : la variante élue pour le réseau si elle est déjà là, sinon la
/// plus légère variante DÉJÀ LÀ qui couvre encore la case, sinon l'original
/// s'il est là, sinon la variante élue.
enum BubbleImageSourceLaw {
    nonisolated static func displayedURL(
        variants: [MeeshyImageVariant],
        originalURL: String,
        originalWidth: Int?,
        targetWidthPx: Int,
        isOnDevice: (String) -> Bool
    ) -> String? {
        guard !originalURL.isEmpty else { return nil }
        let networkPick = ImageVariantSelector.bestImageURL(
            variants: variants,
            originalURL: originalURL,
            originalWidth: originalWidth,
            targetWidthPx: targetWidthPx
        )
        if isOnDevice(networkPick) { return networkPick }
        let coveringOnDevice = variants
            .filter { !$0.url.isEmpty && $0.width >= targetWidthPx && $0.url != networkPick }
            .sorted { ($0.width, $0.url) < ($1.width, $1.url) }
            .map(\.url)
            .first(where: isOnDevice)
        if let coveringOnDevice { return coveringOnDevice }
        if originalURL != networkPick, isOnDevice(originalURL) { return originalURL }
        return networkPick
    }

    /// Le critère de production : celui-là même qui lève la politique dans
    /// `ProgressiveCachedImage` — une forme élue « sur l'appareil » se charge
    /// donc sans attendre un geste. Une forme `file://` est une lecture locale.
    nonisolated static func isOnDevice(_ urlString: String) -> Bool {
        urlString.hasPrefix("file://")
            || LocalImagePresence.isOnDevice(resolvedURL: AttachmentDownloadCenter.key(for: urlString))
    }

    /// Seule la FIN d'un téléchargement pose l'original sur l'appareil.
    nonisolated static func marksOriginalLanding(_ event: AttachmentDownloadCenter.Event) -> Bool {
        if case .finished = event { return true }
        return false
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

    func start(attachment: MessageAttachment, origin: MediaDownloadOrigin, onShare: ((URL) -> Void)?) {
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
            cacheStore: store,
            origin: origin
        )
    }

    /// Download a translated audio (HTTPS URL distinct from the original
    /// attachment). The translated audio's file size is not yet exposed by
    /// the backend (spec §7 follow-up) — `fileSize == 0` is tolerated and
    /// the response's Content-Length header is used as the total during DL.
    /// Note: if the network shifts wifi -> cellular while downloading, the
    /// download continues. The policy gates triggering, not continuation
    /// (spec §14.2, consistent with WhatsApp / Telegram).
    func startTranslatedAudio(url: String, fileSize: Int64, origin: MediaDownloadOrigin) {
        startDownloadFlow(urlString: url, expectedSize: fileSize, cacheStore: .audio, origin: origin)
    }

    private func startDownloadFlow(
        urlString: String,
        expectedSize: Int64,
        cacheStore: CacheStoreKind,
        origin: MediaDownloadOrigin
    ) {
        guard !urlString.isEmpty else { return }
        observe(url: urlString)
        guard !isDownloading, !isCached else { return }
        center.start(urlString: urlString, expectedSize: expectedSize, cacheStore: cacheStore, origin: origin)
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
