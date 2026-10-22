import XCTest
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Sprint 3 RC3.2 — the download badge / `AttachmentDownloader` must resolve
/// local-cache state per media type and never surface a download affordance
/// for media that is already on disk (optimistic `file://` media, or a message
/// still in its optimistic delivery phase).
@MainActor
final class AttachmentDownloaderTests: XCTestCase {

    // MARK: - Factories

    private func makeImageAttachment(fileUrl: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: "att-img-\(UUID().uuidString)",
            mimeType: "image/jpeg",
            fileUrl: fileUrl,
            uploadedBy: "user-test"
        )
    }

    private func makeBadge(
        attachment: MeeshyMessageAttachment,
        deliveryStatus: MeeshyMessage.DeliveryStatus
    ) -> DownloadBadgeView {
        DownloadBadgeView(
            attachment: attachment,
            accentColor: "#6366F1",
            messageDeliveryStatus: deliveryStatus
        )
    }

    // MARK: - checkCache routing

    func test_checkCache_imageAttachment_checksImageStore() async {
        let fileUrl = "https://cdn.example.com/img-\(UUID().uuidString).jpg"
        let key = MeeshyConfig.resolveMediaURL(fileUrl)?.absoluteString ?? fileUrl
        await CacheCoordinator.shared.images.store(Data([0x01, 0x02, 0x03]), for: key)

        let downloader = AttachmentDownloader()
        await downloader.checkCache(makeImageAttachment(fileUrl: fileUrl))

        XCTAssertTrue(downloader.isCached, "An image present in the images store must be reported as cached")

        await CacheCoordinator.shared.images.invalidate(for: key)
    }

    func test_checkCache_localFileAttachment_setsCachedWithoutNetwork() async throws {
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("optimistic-\(UUID().uuidString).jpg")
        try Data([0xFF, 0xD8, 0xFF]).write(to: tempURL)
        defer { try? FileManager.default.removeItem(at: tempURL) }

        let downloader = AttachmentDownloader()
        await downloader.checkCache(makeImageAttachment(fileUrl: tempURL.absoluteString))

        XCTAssertTrue(downloader.isCached, "A local file:// attachment that exists on disk must be reported as cached")
    }

    func test_checkCache_localFileAttachment_missingFile_staysNotCached() async {
        let missingURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("missing-\(UUID().uuidString).jpg")

        let downloader = AttachmentDownloader()
        await downloader.checkCache(makeImageAttachment(fileUrl: missingURL.absoluteString))

        XCTAssertFalse(downloader.isCached, "A file:// attachment whose file is absent must not be reported as cached")
    }

    // MARK: - DownloadBadgeView visibility

    func test_downloadBadge_forSendingMessage_isHidden() {
        let badge = makeBadge(
            attachment: makeImageAttachment(fileUrl: "https://cdn.example.com/photo.jpg"),
            deliveryStatus: .sending
        )
        XCTAssertTrue(badge.hidesForLocalOrOptimisticMedia,
                      "The download badge must be hidden while the carrier message is .sending")
    }

    func test_downloadBadge_forInvisibleMessage_isHidden() {
        let badge = makeBadge(
            attachment: makeImageAttachment(fileUrl: "https://cdn.example.com/photo.jpg"),
            deliveryStatus: .invisible
        )
        XCTAssertTrue(badge.hidesForLocalOrOptimisticMedia,
                      "The download badge must be hidden during the .invisible optimistic phase")
    }

    func test_downloadBadge_forLocalFileAttachment_isHidden() {
        let badge = makeBadge(
            attachment: makeImageAttachment(fileUrl: "file:///var/mobile/tmp/camera_1.jpg"),
            deliveryStatus: .sent
        )
        XCTAssertTrue(badge.hidesForLocalOrOptimisticMedia,
                      "The download badge must be hidden for local file:// media")
    }

    /// #7492 — une vidéo n'a qu'UN composant de téléchargement : le bouton de
    /// son lecteur. Le badge se posait par-dessus la même tuile.
    func test_downloadBadge_forVideo_yieldsToThePlayer() {
        let video = MeeshyMessageAttachment(
            id: "att-vid-\(UUID().uuidString)",
            mimeType: "video/mp4",
            fileUrl: "https://cdn.example.com/clip.mp4",
            uploadedBy: "user-test"
        )
        XCTAssertTrue(makeBadge(attachment: video, deliveryStatus: .sent).yieldsToThePlayer)
        XCTAssertFalse(
            makeBadge(
                attachment: makeImageAttachment(fileUrl: "https://cdn.example.com/photo.jpg"),
                deliveryStatus: .sent
            ).yieldsToThePlayer,
            "l'image n'a pas d'autre affordance de téléchargement : le badge reste le sien"
        )
    }

    func test_downloadBadge_forConfirmedServerMedia_isVisible() {
        let badge = makeBadge(
            attachment: makeImageAttachment(fileUrl: "https://cdn.example.com/photo.jpg"),
            deliveryStatus: .sent
        )
        XCTAssertFalse(badge.hidesForLocalOrOptimisticMedia,
                       "The download badge must remain available for confirmed remote media")
    }

    // MARK: - Byte-size formatting

    /// `AttachmentDownloader.fmt` must delegate to the single SDK-wide
    /// `formatMediaFileSize` helper — locks the fix for the divergent
    /// binary-vs-decimal formatters bug (AudioPlayerView.formatBytes used to
    /// disagree with this one despite a comment claiming parity).
    func test_fmt_delegatesToSharedSDKFileSizeFormatter() {
        XCTAssertEqual(AttachmentDownloader.fmt(870_400), formatMediaFileSize(870_400))
        XCTAssertEqual(AttachmentDownloader.fmt(1_048_576), formatMediaFileSize(1_048_576))
    }

    // MARK: - Téléchargement en flux par le funnel du store (source guard, #9863)

    /// `run` itérait `URLSession.bytes` OCTET PAR OCTET (≈ 30 millions de
    /// tours de boucle et de `checkCancellation` pour une vidéo de 30 Mo) et
    /// accumulait le fichier entier dans un `Data` avant de l'écrire. Il passe
    /// désormais par `DiskCacheStore.data(for:progress:)` — téléchargement vers
    /// un fichier, déplacé dans le cache, dédoublonné avec tout autre chemin en
    /// vol. Garde de source : `run` fait de vraies E/S `URLSession` que cette
    /// suite n'exerce pas (le comportement est prouvé côté SDK par
    /// `DiskCacheStoreStreamedTransferTests`).
    private func downloadCenterSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // apps/ios/
            .appendingPathComponent("Meeshy/Features/Main/Views/AttachmentDownloadCenter.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_run_streamsThroughTheStoreFunnel_neverIteratesBytes() throws {
        let source = try downloadCenterSource()
        XCTAssertFalse(source.contains("asyncBytes"), "le centre ne doit plus itérer les octets d'une réponse")
        XCTAssertFalse(source.contains(".bytes(from:"), "le centre ne doit plus ouvrir URLSession.bytes")
        XCTAssertFalse(source.contains("registerInFlightDownload"), "le dédoublonnage appartient au funnel du store")
        XCTAssertTrue(
            source.contains("store.data(for: resolvedKey, profile: profile, progress:"),
            "le centre télécharge par le funnel en flux du store, qui rapporte la progression"
        )
    }

    /// Un transfert REJOINT puis annulé par un autre (purge) lève
    /// `CancellationError` sans que la tâche du centre soit annulée : avaler
    /// cette erreur laissait la surface sur « téléchargement » à jamais. Seule
    /// l'annulation de la tâche du centre se tait.
    func test_run_foreignCancellation_failsInsteadOfStranding() throws {
        let source = try downloadCenterSource()
        XCTAssertFalse(source.contains("error is CancellationError"))
        XCTAssertTrue(source.contains("guard !Task.isCancelled else { return }\n            await fail(key: resolvedKey)"))
    }
}

/// Feed/Posts auto-download decision — `autoDownload: true` (Feed/Posts surfaces)
/// must force the download regardless of the user's per-network preference, while
/// still never starting a download offline. `autoDownload: false` (conversation
/// bubbles) must delegate entirely to `MediaDownloadPolicyEngine`, preserving the
/// user's WiFi-only / data-saver UX.
@MainActor
final class MediaAutoDownloadDecisionTests: XCTestCase {

    // MARK: - Video resolver

    func test_video_autoDownloadTrue_overridesWifiOnlyPrefOnCellular() {
        let prefs = MediaDownloadPreferences(video: .wifiOnly)
        XCTAssertTrue(
            VideoAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: true, condition: .badCellular, prefs: prefs
            ),
            "Feed/Posts video must auto-download even when the user picked WiFi-only and is on cellular"
        )
    }

    func test_video_autoDownloadTrue_offline_returnsFalse() {
        let prefs = MediaDownloadPreferences(video: .always)
        XCTAssertFalse(
            VideoAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: true, condition: .offline, prefs: prefs
            ),
            "No download must start while offline, even with autoDownload forced"
        )
    }

    /// #9702 — le pager de réels ferme l'auto-démarrage hors de sa fenêtre de
    /// préchargement : sous iOS 16, son `TabView` monte TOUTES les pages, et
    /// chacune téléchargeait son réel entier. Fermé, rien ne part — ni forcé,
    /// ni par la politique réseau.
    func test_video_mayAutoStartFalse_neverStarts_evenForcedOnWifi() {
        let prefs = MediaDownloadPreferences(video: .always)
        XCTAssertFalse(
            VideoAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: true, mayAutoStart: false, condition: .wifi, prefs: prefs
            )
        )
        XCTAssertFalse(
            VideoAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: false, mayAutoStart: false, condition: .wifi, prefs: prefs
            )
        )
    }

    func test_video_autoDownloadFalse_respectsPolicy_wifiOnly_onWifi() {
        let prefs = MediaDownloadPreferences(video: .wifiOnly)
        XCTAssertTrue(
            VideoAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: false, condition: .wifi, prefs: prefs
            )
        )
    }

    func test_video_autoDownloadFalse_respectsPolicy_wifiOnly_onCellular() {
        let prefs = MediaDownloadPreferences(video: .wifiOnly)
        XCTAssertFalse(
            VideoAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: false, condition: .badCellular, prefs: prefs
            ),
            "Conversation video (autoDownload=false) must honour the WiFi-only preference"
        )
    }

    // MARK: - Audio resolver

    func test_audio_autoDownloadTrue_overridesNeverPref() {
        let prefs = MediaDownloadPreferences(audio: .never)
        XCTAssertTrue(
            AudioAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: true, condition: .wifi, prefs: prefs
            ),
            "Feed/Posts audio must auto-download even when the user set audio policy to never"
        )
    }

    func test_audio_autoDownloadTrue_offline_returnsFalse() {
        let prefs = MediaDownloadPreferences(audio: .always)
        XCTAssertFalse(
            AudioAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: true, condition: .offline, prefs: prefs
            )
        )
    }

    func test_audio_autoDownloadFalse_respectsPolicy_neverPref() {
        let prefs = MediaDownloadPreferences(audio: .never)
        XCTAssertFalse(
            AudioAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: false, condition: .wifi, prefs: prefs
            ),
            "Conversation audio (autoDownload=false) must honour the never preference"
        )
    }

    /// The audio resolver must read the per-kind `.audio` policy, never the
    /// `.video` policy (regression guard for a copy-paste of the video helper).
    func test_audio_autoDownloadFalse_usesAudioPolicyNotVideo() {
        let prefs = MediaDownloadPreferences(audio: .always, video: .never)
        XCTAssertTrue(
            AudioAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: false, condition: .badCellular, prefs: prefs
            ),
            "Audio resolver must read the audio policy (.always), independent of the video policy (.never)"
        )
    }

    // MARK: - resolvedAvailability (multi-language audio: gate progress on the selected url)

    func test_resolvedAvailability_downloadingCurrentURL_showsDownloading() {
        let a = AttachmentDownloader.resolvedAvailability(
            isDownloading: true, downloadingURL: "url-A", currentURL: "url-A",
            isCached: false, progress: 0.5, downloadedBytes: 50, totalBytes: 100,
            resting: .needsDownload)
        XCTAssertEqual(a, .downloading(progress: 0.5, downloadedBytes: 50, totalBytes: 100))
    }

    /// The downloader is shared across all language URLs of the bubble. If it is
    /// busy downloading language A but the user switched the selection to language
    /// B, the in-flight progress MUST NOT be shown on B — it falls through to B's
    /// own resting resolution.
    func test_resolvedAvailability_downloadingOtherURL_doesNotLeakProgressToSelected() {
        let a = AttachmentDownloader.resolvedAvailability(
            isDownloading: true, downloadingURL: "url-A", currentURL: "url-B",
            isCached: false, progress: 0.5, downloadedBytes: 50, totalBytes: 100,
            resting: .needsDownload)
        XCTAssertEqual(a, .needsDownload,
                       "a download for another language must not show progress on the selected one")
    }

    func test_resolvedAvailability_cached_returnsReady() {
        let a = AttachmentDownloader.resolvedAvailability(
            isDownloading: false, downloadingURL: nil, currentURL: "url-A",
            isCached: true, progress: 0, downloadedBytes: 0, totalBytes: 0,
            resting: .needsDownload)
        XCTAssertEqual(a, .ready)
    }

    func test_resolvedAvailability_idle_returnsResting() {
        let a = AttachmentDownloader.resolvedAvailability(
            isDownloading: false, downloadingURL: nil, currentURL: "url-A",
            isCached: false, progress: 0, downloadedBytes: 0, totalBytes: 0,
            resting: .ready)
        XCTAssertEqual(a, .ready)
    }
}

/// #7492 — UN téléchargement par média, partagé par toutes les surfaces qui le
/// montrent. Chaque façade (`AttachmentDownloader`) observe la clé de cache de
/// son média dans `AttachmentDownloadCenter` : deux surfaces voient la MÊME
/// progression, finissent ensemble, et un média déjà sur disque ne repart
/// jamais sur le réseau.
@MainActor
final class AttachmentDownloadCenterTests: XCTestCase {

    private func makeVideo(fileUrl: String = "https://cdn.example.com/v-\(UUID().uuidString).mp4") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: "att-vid-\(UUID().uuidString)",
            mimeType: "video/mp4",
            fileUrl: fileUrl,
            uploadedBy: "user-test"
        )
    }

    private func makeSUT() -> (center: AttachmentDownloadCenter, bubble: AttachmentDownloader, gallery: AttachmentDownloader) {
        let center = AttachmentDownloadCenter()
        return (center, AttachmentDownloader(center: center), AttachmentDownloader(center: center))
    }

    func test_twoSurfacesOnTheSameMedia_showTheSameProgress() {
        let (center, bubble, gallery) = makeSUT()
        let video = makeVideo()
        bubble.observe(video)
        gallery.observe(video)
        let key = AttachmentDownloadCenter.key(for: video.fileUrl)

        center.publish(.progress(.init(downloadedBytes: 40, totalBytes: 100)), for: key)

        XCTAssertTrue(bubble.isDownloading)
        XCTAssertTrue(gallery.isDownloading)
        XCTAssertEqual(bubble.progress, 0.4, accuracy: 0.001)
        XCTAssertEqual(gallery.progress, 0.4, accuracy: 0.001)
    }

    func test_aDownloadFinishedElsewhere_marksEveryObserverCached() {
        let (center, bubble, gallery) = makeSUT()
        let video = makeVideo()
        bubble.observe(video)
        gallery.observe(video)
        let key = AttachmentDownloadCenter.key(for: video.fileUrl)

        center.publish(.progress(.init(downloadedBytes: 0, totalBytes: 100)), for: key)
        center.publish(.finished(totalBytes: 100), for: key)

        XCTAssertTrue(bubble.isCached, "la bulle doit passer à « prête » quand la galerie finit")
        XCTAssertFalse(bubble.isDownloading)
        XCTAssertTrue(gallery.isCached)
    }

    func test_aSurfaceMountedMidDownload_joinsTheRunningProgress() {
        let (center, bubble, gallery) = makeSUT()
        let video = makeVideo()
        bubble.observe(video)
        let key = AttachmentDownloadCenter.key(for: video.fileUrl)
        center.publish(.progress(.init(downloadedBytes: 70, totalBytes: 100)), for: key)

        gallery.observe(video)

        XCTAssertTrue(gallery.isDownloading, "une surface montée en cours de route lit le téléchargement en cours")
        XCTAssertEqual(gallery.progress, 0.7, accuracy: 0.001)
    }

    func test_anotherMediaEvent_neverLeaksIntoThisSurface() {
        let (center, bubble, _) = makeSUT()
        let video = makeVideo()
        bubble.observe(video)

        center.publish(.progress(.init(downloadedBytes: 10, totalBytes: 100)), for: "https://cdn.example.com/other.mp4")

        XCTAssertFalse(bubble.isDownloading)
    }

    func test_cancelFromOneSurface_stopsTheDownloadEverywhere() {
        let (_, bubble, gallery) = makeSUT()
        let video = makeVideo(fileUrl: "https://cdn.example.invalid/v-\(UUID().uuidString).mp4")
        gallery.observe(video)

        bubble.start(attachment: video, origin: .manual, onShare: nil)
        XCTAssertTrue(gallery.isDownloading, "le téléchargement lancé par la bulle s'affiche dans la galerie")

        gallery.cancel()

        XCTAssertFalse(bubble.isDownloading)
        XCTAssertFalse(gallery.isDownloading)
    }

    func test_start_onAMediaAlreadyOnDisk_finishesFromTheCache() async {
        let (_, bubble, _) = makeSUT()
        let video = makeVideo(fileUrl: "https://cdn.example.invalid/v-\(UUID().uuidString).mp4")
        let key = AttachmentDownloadCenter.key(for: video.fileUrl)
        await CacheCoordinator.shared.video.store(Data([0x00, 0x01, 0x02]), for: key)
        let cached = expectation(description: "servi par le cache local, sans réseau")
        let subscription = bubble.$isCached.first(where: { $0 }).sink { _ in cached.fulfill() }

        bubble.start(attachment: video, origin: .manual, onShare: nil)

        await fulfillment(of: [cached], timeout: 5)
        subscription.cancel()
        await CacheCoordinator.shared.video.invalidate(for: key)
    }

    // MARK: - #7625 — le préchargement passe par le MÊME registre, en silence

    /// Le réel suivant se télécharge AVANT le swipe : sa surface, montée au
    /// moment où il entre à l'écran, doit rejoindre ce téléchargement au lieu
    /// d'en ouvrir un second — et le trouver « prêt » s'il a fini.
    func test_prefetch_aSurfaceMountedLater_joinsThePrefetch() {
        let center = AttachmentDownloadCenter(haptics: { _ in })
        let surface = AttachmentDownloader(center: center)
        let video = makeVideo(fileUrl: "https://cdn.example.invalid/v-\(UUID().uuidString).mp4")

        center.prefetch(urlString: video.fileUrl, expectedSize: 100, cacheStore: .video)
        surface.observe(video)

        XCTAssertTrue(surface.isDownloading, "la surface doit lire le préchargement en cours, pas en lancer un autre")
        center.cancel(key: AttachmentDownloadCenter.key(for: video.fileUrl))
    }

    /// Un préchargement est invisible : il ne doit pas faire vibrer le
    /// téléphone à chaque réel qui défile, ni au départ ni à la fin.
    func test_prefetch_finishedFromTheCache_neverVibrates() async {
        var haptics: [AttachmentDownloadCenter.Haptic] = []
        let center = AttachmentDownloadCenter(haptics: { haptics.append($0) })
        let surface = AttachmentDownloader(center: center)
        let video = makeVideo(fileUrl: "https://cdn.example.invalid/v-\(UUID().uuidString).mp4")
        let key = AttachmentDownloadCenter.key(for: video.fileUrl)
        await CacheCoordinator.shared.video.store(Data([0x00, 0x01, 0x02]), for: key)
        surface.observe(video)
        let cached = expectation(description: "préchargement terminé depuis le cache")
        let subscription = surface.$isCached.first(where: { $0 }).sink { _ in cached.fulfill() }

        center.prefetch(urlString: video.fileUrl, expectedSize: 3, cacheStore: .video)

        await fulfillment(of: [cached], timeout: 5)
        XCTAssertEqual(haptics, [], "un préchargement ne vibre jamais")
        subscription.cancel()
        await CacheCoordinator.shared.video.invalidate(for: key)
    }

    /// Le témoin du canal : un téléchargement DEMANDÉ garde sa vibration de
    /// départ — sans quoi le test précédent serait vert par un canal débranché.
    func test_start_requestedByTheUser_stillVibrates() {
        var haptics: [AttachmentDownloadCenter.Haptic] = []
        let center = AttachmentDownloadCenter(haptics: { haptics.append($0) })
        let key = "https://cdn.example.invalid/v-\(UUID().uuidString).mp4"

        center.start(urlString: key, expectedSize: 100, cacheStore: .video, origin: .manual)

        XCTAssertEqual(haptics, [.light])
        center.cancel(key: AttachmentDownloadCenter.key(for: key))
    }

    // MARK: - #8573 — seul un téléchargement MANUEL vibre

    /// Un téléchargement AUTOMATIQUE (politique réseau, feed, galerie) ne
    /// vibre pas au départ : l'utilisateur n'a rien touché.
    func test_start_automaticOrigin_neverVibratesOnStart() {
        var haptics: [AttachmentDownloadCenter.Haptic] = []
        let center = AttachmentDownloadCenter(haptics: { haptics.append($0) })
        let key = "https://cdn.example.invalid/v-\(UUID().uuidString).mp4"

        center.start(urlString: key, expectedSize: 100, cacheStore: .video, origin: .automatic)

        XCTAssertEqual(haptics, [])
        center.cancel(key: AttachmentDownloadCenter.key(for: key))
    }

    /// Ni à la fin : un auto-téléchargement servi par le cache termine en silence.
    func test_start_automaticOriginFinishedFromTheCache_neverVibrates() async {
        var haptics: [AttachmentDownloadCenter.Haptic] = []
        let center = AttachmentDownloadCenter(haptics: { haptics.append($0) })
        let surface = AttachmentDownloader(center: center)
        let video = makeVideo(fileUrl: "https://cdn.example.invalid/v-\(UUID().uuidString).mp4")
        let key = AttachmentDownloadCenter.key(for: video.fileUrl)
        await CacheCoordinator.shared.video.store(Data([0x00, 0x01, 0x02]), for: key)
        let cached = expectation(description: "auto-téléchargement terminé depuis le cache")
        let subscription = surface.$isCached.first(where: { $0 }).sink { _ in cached.fulfill() }

        surface.start(attachment: video, origin: .automatic, onShare: nil)

        await fulfillment(of: [cached], timeout: 5)
        XCTAssertEqual(haptics, [], "un téléchargement automatique ne vibre jamais")
        subscription.cancel()
        await CacheCoordinator.shared.video.invalidate(for: key)
    }

    /// Le témoin du canal : le MÊME parcours, demandé par un tap, vibre au
    /// départ puis à la fin — sans quoi le test précédent serait vert par un
    /// canal débranché.
    func test_start_manualOriginFinishedFromTheCache_vibratesOnStartAndSuccess() async {
        var haptics: [AttachmentDownloadCenter.Haptic] = []
        let center = AttachmentDownloadCenter(haptics: { haptics.append($0) })
        let surface = AttachmentDownloader(center: center)
        let video = makeVideo(fileUrl: "https://cdn.example.invalid/v-\(UUID().uuidString).mp4")
        let key = AttachmentDownloadCenter.key(for: video.fileUrl)
        await CacheCoordinator.shared.video.store(Data([0x00, 0x01, 0x02]), for: key)
        let cached = expectation(description: "téléchargement manuel terminé depuis le cache")
        let subscription = surface.$isCached.first(where: { $0 }).sink { _ in cached.fulfill() }

        surface.start(attachment: video, origin: .manual, onShare: nil)

        await fulfillment(of: [cached], timeout: 5)
        XCTAssertEqual(haptics, [.light, .success])
        subscription.cancel()
        await CacheCoordinator.shared.video.invalidate(for: key)
    }

    /// Un auto-téléchargement de piste traduite qui échoue ne vibre pas non plus.
    func test_startTranslatedAudio_automaticOriginFailing_neverVibrates() async {
        var haptics: [AttachmentDownloadCenter.Haptic] = []
        let center = AttachmentDownloadCenter(haptics: { haptics.append($0) })
        let surface = AttachmentDownloader(center: center)
        let url = "https://cdn.example.invalid/a-\(UUID().uuidString).m4a"
        let failed = expectation(description: "le téléchargement échoue")
        let subscription = center.events(for: AttachmentDownloadCenter.key(for: url))
            .filter { $0 == .failed }
            .first()
            .sink { _ in failed.fulfill() }

        surface.startTranslatedAudio(url: url, fileSize: 0, origin: .automatic)

        await fulfillment(of: [failed], timeout: 15)
        XCTAssertEqual(haptics, [], "un échec d'auto-téléchargement ne vibre pas")
        subscription.cancel()
    }
}

/// #11569 — sur la dernière case d'une grille (« +N »), le badge de
/// téléchargement se posait au CENTRE, par-dessus le libellé : on ne lisait ni
/// l'un ni l'autre tant que la photo n'était pas téléchargée. Une seule loi de
/// placement sert la bulle et le Fil.
final class MediaTileDownloadPlacementTests: XCTestCase {

    func test_resolve_overflowTile_sameCompactCornerInBubbleAndFocal() {
        let bubble = MediaTileDownloadPlacement.resolve(surface: .bubbleGrid, overflowCount: 3)
        let focal = MediaTileDownloadPlacement.resolve(surface: .focalGrid, overflowCount: 3)

        XCTAssertEqual(bubble, focal, "la case « +N » a la même disposition dans les deux modes")
        XCTAssertEqual(bubble.alignment, .topLeading)
        XCTAssertEqual(bubble.form, .compact)
    }

    /// Sur la dernière case, la bulle pose l'heure et l'état d'envoi en bas à
    /// droite ; les deux modes posent les réactions en bas à gauche et le
    /// compteur de vue unique en haut à droite.
    func test_resolve_overflowTile_takesTheOnlyCornerNoOtherBadgeHolds() {
        let held: [Alignment] = [.bottomTrailing, .bottomLeading, .topTrailing]
        for surface in [MediaTileDownloadPlacement.Surface.bubbleGrid, .focalGrid] {
            let placement = MediaTileDownloadPlacement.resolve(surface: surface, overflowCount: 2)
            XCTAssertFalse(held.contains(placement.alignment),
                           "le badge de la case « +N » ne se pose sur aucune autre pastille (\(surface))")
        }
    }

    func test_resolve_overflowTile_badgeNeverSharesTheOverflowLabelAnchor() {
        for surface in [MediaTileDownloadPlacement.Surface.bubbleGrid, .focalGrid] {
            let placement = MediaTileDownloadPlacement.resolve(surface: surface, overflowCount: 1)
            XCTAssertNotEqual(placement.alignment, MediaTileDownloadPlacement.overflowLabelAlignment,
                              "le badge ne se pose jamais sur le « +N » (\(surface))")
        }
    }

    func test_resolve_plainBubbleTile_keepsTheCentredProminentBadge() {
        let placement = MediaTileDownloadPlacement.resolve(surface: .bubbleGrid, overflowCount: 0)

        XCTAssertEqual(placement, MediaTileDownloadPlacement(alignment: .center, form: .prominent))
    }

    func test_resolve_plainFocalTile_keepsItsCornerProminentBadge() {
        let placement = MediaTileDownloadPlacement.resolve(surface: .focalGrid, overflowCount: 0)

        XCTAssertEqual(placement, MediaTileDownloadPlacement(alignment: .bottomTrailing, form: .prominent))
    }

    func test_compactForm_keepsTheMinimumTapTarget() {
        XCTAssertGreaterThanOrEqual(MediaTileDownloadPlacement.compactHitTarget, MeeshyControlSize.tapTarget)
    }
}
