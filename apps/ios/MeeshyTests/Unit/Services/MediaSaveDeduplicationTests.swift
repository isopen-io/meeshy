import XCTest
import MeeshySDK
@testable import Meeshy

/// Un instant d'installation figé — partagé avec `ReceivedMediaAutoSaverTests`.
final class FixedInstallationDate: AppInstallationDateProviding {
    let installationStartedAt: Date
    init(_ date: Date) { installationStartedAt = date }
}

/// #10370 — un média n'entre qu'une fois dans l'album Meeshy, et une réinstallation
/// suivie d'une synchronisation n'y remet pas l'historique (directive porteur 2026-10-12).
@MainActor
final class MediaSaveDeduplicationTests: XCTestCase {

    // MARK: - Fabriques

    private let installedAt = Date(timeIntervalSince1970: 1_800_000_000)

    private func photo(_ id: String = "p1") -> MessageAttachment {
        MessageAttachment(id: id, messageId: "m1", fileName: "p.jpg", mimeType: "image/jpeg",
                          fileUrl: "https://staging.meeshy.me/\(id).jpg")
    }

    private func message(receivedAt date: Date, attachment: MessageAttachment) -> Message {
        Message(id: "m-\(attachment.id)", conversationId: "c1", senderId: "autre", content: "",
                createdAt: date, attachments: [attachment], isMe: false)
    }

    private func settle() async {
        for _ in 0..<5 { await Task.yield(); try? await Task.sleep(nanoseconds: 10_000_000) }
    }

    // MARK: - L'enregistrement automatique ne vise que l'installation en cours

    func test_policy_messageAntérieurÀLInstallation_nEstPasEnregistréSeul() {
        let ancien = message(receivedAt: installedAt.addingTimeInterval(-60), attachment: photo())

        XCTAssertTrue(ReceivedMediaAutoSavePolicy.eligibleMedia(in: ancien, receivedSince: installedAt).isEmpty)
    }

    func test_policy_messageReçuPendantLInstallation_estÉligible() {
        let reçu = message(receivedAt: installedAt.addingTimeInterval(60), attachment: photo())

        XCTAssertEqual(ReceivedMediaAutoSavePolicy.eligibleMedia(in: reçu, receivedSince: installedAt).map(\.id), ["p1"])
    }

    func test_autoSaver_synchroAprèsRéinstallation_nÉcritQueLesMédiasReçusDepuis() async {
        let writer = RecordingAlbumWriter()
        let sut = ReceivedMediaAutoSaver(
            isActive: true,
            setting: AlwaysOnAutoSave(),
            registry: AutoSavedAttachmentRegistry(defaults: UserDefaults(suiteName: "dedup-\(UUID().uuidString)")!),
            writer: writer,
            downloadAllowed: { _ in true },
            installation: FixedInstallationDate(installedAt))

        sut.consider([
            message(receivedAt: installedAt.addingTimeInterval(-86_400), attachment: photo("historique")),
            message(receivedAt: installedAt.addingTimeInterval(5), attachment: photo("nouveau")),
        ])
        await settle()

        XCTAssertEqual(writer.savedIds, ["nouveau"])
    }

    func test_installationClock_poséUneFois_puisStable() {
        let defaults = UserDefaults(suiteName: "install-\(UUID().uuidString)")!
        var tick = installedAt
        let clock = AppInstallationClock(defaults: defaults, now: { tick })

        let first = clock.installationStartedAt
        tick = installedAt.addingTimeInterval(3600)

        XCTAssertEqual(first, installedAt)
        XCTAssertEqual(clock.installationStartedAt, installedAt)
        XCTAssertEqual(AppInstallationClock(defaults: defaults).installationStartedAt, installedAt,
                       "un relancement garde l'instant de l'installation")
    }

    // MARK: - « Enregistrer » à la main : toujours possible, jamais en double

    private func coordinator(_ photos: DedupPhotoSaver, branding: MediaSaveBranding = PassThroughBranding())
        -> (MediaSaveCoordinator, URL) {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("dedup-\(UUID().uuidString).jpg")
        try? Data("la photo reçue".utf8).write(to: file)
        let resolver = FixedFileResolver(file: file)
        let sut = MediaSaveCoordinator(exitGate: .open, resolver: resolver, photoSaver: photos,
                                       downloadReporter: SilentDownloadReporter(), branding: branding)
        return (sut, file)
    }

    private func request() -> MediaSaveRequest {
        MediaSaveRequest(kind: .image, origin: .transmitted,
                         remoteURLString: "https://staging.meeshy.me/p1.jpg", attachmentId: "p1")
    }

    func test_manuel_médiaAbsentDeLAlbum_estEnregistré() async {
        let photos = DedupPhotoSaver(contains: false)
        let (sut, _) = coordinator(photos)

        await sut.pick(.photoLibrary, request: request())

        XCTAssertEqual(photos.writes, 1)
        XCTAssertEqual(sut.lastOutcome, .saved(.photoLibrary))
    }

    /// Un média de l'historique (antérieur à l'installation) reste enregistrable à la main.
    func test_manuel_médiaDéjàDansLAlbum_rienNEstÉcrit_etCeLeDit() async {
        let photos = DedupPhotoSaver(contains: true)
        let branding = PassThroughBranding()
        let (sut, _) = coordinator(photos, branding: branding)

        await sut.pick(.photoLibrary, request: request())

        XCTAssertEqual(photos.writes, 0)
        XCTAssertEqual(branding.stamps, 0, "rien à préparer pour un média déjà présent")
        XCTAssertEqual(sut.lastOutcome, .alreadyInPhotoLibrary)
        XCTAssertEqual(photos.aliases, ["p1"])
    }

    /// La course (auto-enregistrement pendant le toucher) se règle à l'écriture.
    func test_manuel_écritureDédoublonnée_rendDéjàPrésent() async {
        let photos = DedupPhotoSaver(contains: false, writeOutcome: .alreadyPresent)
        let (sut, _) = coordinator(photos)

        await sut.pick(.photoLibrary, request: request())

        XCTAssertEqual(sut.lastOutcome, .alreadyInPhotoLibrary)
    }

    /// L'empreinte est celle de la SOURCE, jamais celle de la copie marquée.
    func test_manuel_lEmpreinteEstCelleDeLaSource() async throws {
        let photos = DedupPhotoSaver(contains: false)
        let (sut, file) = coordinator(photos)

        await sut.pick(.photoLibrary, request: request())

        let expected = try await PhotoLibraryMediaSignature.of(fileAt: file)
        XCTAssertEqual(photos.signatures, [expected])
    }

    // MARK: - #14640 — à la main puis automatiquement (ou deux fois) : un seul asset

    /// Le coordinateur et l'enregistrement automatique passent par le MÊME
    /// dédoublonneur que `PhotoLibraryManager` (empreinte du fichier source, alias
    /// = identifiant de la pièce) ; seule la photothèque est remplacée.
    private func sharedAlbum() -> (album: LiveDedupAlbum, coordinator: MediaSaveCoordinator, file: URL) {
        let album = LiveDedupAlbum()
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("dedup-\(UUID().uuidString).jpg")
        try? Data("la même photo reçue".utf8).write(to: file)
        let coordinator = MediaSaveCoordinator(exitGate: .open, resolver: FixedFileResolver(file: file), photoSaver: album,
                                               downloadReporter: SilentDownloadReporter(), branding: PassThroughBranding())
        return (album, coordinator, file)
    }

    func test_manuelPuisAutomatique_unSeulAsset() async throws {
        let (album, coordinator, file) = sharedAlbum()

        await coordinator.pick(.photoLibrary, request: request())
        let auto = await album.autoSave(file, attachmentId: "p1")

        XCTAssertEqual(coordinator.lastOutcome, .saved(.photoLibrary))
        XCTAssertEqual(auto, .alreadyPresent)
        XCTAssertEqual(album.assetCount, 1)
    }

    func test_automatiquePuisManuel_unSeulAsset_etLeCoordinateurDitDéjàEnregistré() async throws {
        let (album, coordinator, file) = sharedAlbum()

        let auto = await album.autoSave(file, attachmentId: "p1")
        await coordinator.pick(.photoLibrary, request: request())

        XCTAssertEqual(auto, .saved)
        XCTAssertEqual(coordinator.lastOutcome, .alreadyInPhotoLibrary)
        XCTAssertEqual(album.assetCount, 1)
    }

    func test_manuelDeuxFoisDeSuite_unSeulAsset_leSecondDitDéjàEnregistré() async {
        let (album, coordinator, _) = sharedAlbum()

        await coordinator.pick(.photoLibrary, request: request())
        await coordinator.pick(.photoLibrary, request: request())

        XCTAssertEqual(coordinator.lastOutcome, .alreadyInPhotoLibrary)
        XCTAssertEqual(album.assetCount, 1)
    }

    func test_automatiqueDeuxFoisDeSuite_unSeulAsset() async {
        let (album, _, file) = sharedAlbum()

        let first = await album.autoSave(file, attachmentId: "p1")
        let second = await album.autoSave(file, attachmentId: "p1")

        XCTAssertEqual([first, second], [.saved, .alreadyPresent])
        XCTAssertEqual(album.assetCount, 1)
    }
}

// MARK: - Doubles

/// Une photothèque en mémoire derrière le VRAI `PhotoLibraryDeduplicator`.
nonisolated private final class LiveDedupAlbum: PhotoLibrarySaving, PhotoLibraryAssetProbing, PhotoLibraryAssetCreating,
                                    @unchecked Sendable {
    private let lock = NSLock()
    private var assets: [String] = []
    private var deduplicator: PhotoLibraryDeduplicator {
        PhotoLibraryDeduplicator(registry: registry, probe: self, creator: self)
    }
    private let registry = PhotoLibraryMediaRegistry(defaults: UserDefaults(suiteName: "live-dedup-\(UUID().uuidString)")!)

    var assetCount: Int { lock.withLock { assets.count } }

    /// Ce que fait `PhotoAlbumReceivedMediaWriter` : `addImageFile(at:alias:)`, empreinte du fichier.
    func autoSave(_ file: URL, attachmentId: String) async -> PhotoLibrarySaveOutcome {
        guard let signature = try? await PhotoLibraryMediaSignature.of(fileAt: file) else { return .failed }
        return await deduplicator.save(request(file), signature: signature, alias: attachmentId)
    }

    private func request(_ file: URL) -> PhotoLibraryAssetRequest {
        PhotoLibraryAssetRequest(kind: .photo, source: .file(file, move: false), originalFileName: file.lastPathComponent)
    }

    func saveImage(_ data: Data) async throws {}
    func saveVideo(at url: URL) async throws {}

    func albumContains(_ signature: PhotoLibraryMediaSignature, alias: String?) async -> Bool {
        await deduplicator.isAlreadyInAlbum(signature)
    }

    func addToAlbum(_ file: URL, kind: AttachmentKind, moveFile: Bool,
                    signature: PhotoLibraryMediaSignature?, alias: String?) async throws -> PhotoLibrarySaveOutcome {
        let resolved: PhotoLibraryMediaSignature?
        if let signature { resolved = signature } else { resolved = try? await PhotoLibraryMediaSignature.of(fileAt: file) }
        guard let resolved else { return .failed }
        return await deduplicator.save(request(file), signature: resolved, alias: alias)
    }

    func presence(ofAsset localIdentifier: String) -> PhotoLibraryAssetPresence {
        lock.withLock { assets.contains(localIdentifier) ? .present : .absent }
    }

    func albumMarks() -> [PhotoLibraryMediaSignature: String]? { nil }

    func create(_ request: PhotoLibraryAssetRequest) async -> String? {
        lock.withLock {
            let id = "asset-\(assets.count + 1)"
            assets.append(id)
            return id
        }
    }
}

private final class AlwaysOnAutoSave: ReceivedMediaAutoSaveSetting {
    var isEnabled: Bool { true }
}

private final class RecordingAlbumWriter: ReceivedMediaAlbumWriting, @unchecked Sendable {
    private let lock = NSLock()
    private var ids: [String] = []
    var savedIds: [String] { lock.withLock { ids } }

    func save(_ attachment: MessageAttachment) async -> ReceivedMediaSaveOutcome {
        lock.withLock { ids.append(attachment.id) }
        return .saved
    }
}

private final class DedupPhotoSaver: PhotoLibrarySaving, @unchecked Sendable {
    let contains: Bool
    let writeOutcome: PhotoLibrarySaveOutcome
    private(set) var writes = 0
    private(set) var aliases: [String?] = []
    private(set) var signatures: [PhotoLibraryMediaSignature?] = []

    init(contains: Bool, writeOutcome: PhotoLibrarySaveOutcome = .saved) {
        self.contains = contains
        self.writeOutcome = writeOutcome
    }

    func saveImage(_ data: Data) async throws { writes += 1 }
    func saveVideo(at url: URL) async throws { writes += 1 }

    func albumContains(_ signature: PhotoLibraryMediaSignature, alias: String?) async -> Bool {
        aliases.append(alias)
        return contains
    }

    func addToAlbum(_ file: URL, kind: AttachmentKind, moveFile: Bool,
                    signature: PhotoLibraryMediaSignature?, alias: String?) async throws -> PhotoLibrarySaveOutcome {
        signatures.append(signature)
        if writeOutcome == .saved { writes += 1 }
        return writeOutcome
    }
}

private final class PassThroughBranding: MediaSaveBranding, @unchecked Sendable {
    private(set) var stamps = 0
    func stamp(_ file: URL, kind: AttachmentKind, origin: MediaOrigin, author: String?) async -> BrandedMedia {
        stamps += 1
        return .original(file)
    }
}

private struct FixedFileResolver: MediaSaveSourceResolving {
    let file: URL
    func resolveLocalFile(for request: MediaSaveRequest) async throws -> URL { file }
}

private struct SilentDownloadReporter: MediaSaveDownloadReporting {
    func reportDownloaded(attachmentId: String) async {}
}
