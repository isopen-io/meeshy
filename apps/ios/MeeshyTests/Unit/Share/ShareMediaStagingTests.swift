import XCTest
import AVFoundation
import ImageIO
import UniformTypeIdentifiers
@testable import Meeshy
import os

/// `loadFileRepresentation` SUPPRIME l'URL fournie au retour de sa closure :
/// la copie doit être faite DANS la closure, de façon synchrone, par flux.
/// Ces tests portent sur la partie décidable de cette copie — le streaming
/// lui-même, les refus explicites, et la dérivation du MIME.
final class ShareMediaStagingTests: XCTestCase {

    // MARK: - Bac à sable

    private func makeDirectory() throws -> URL {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("share-staging-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func makeFile(bytes: Int, ext: String, in directory: URL) throws -> URL {
        let url = directory.appendingPathComponent("source-\(UUID().uuidString).\(ext)")
        // Motif non constant : une copie qui tronquerait ou dupliquerait une
        // tranche produirait des octets DIFFÉRENTS, pas seulement une taille
        // différente.
        var payload = Data(capacity: bytes)
        for index in 0..<bytes { payload.append(UInt8(index % 251)) }
        try payload.write(to: url)
        return url
    }

    // MARK: - Streaming

    /// Le fichier de test dépasse DEUX tranches : une implémentation qui lirait
    /// tout d'un coup passerait un test à 1 Kio et échouerait en production sur
    /// une vidéo de 400 Mo, sous un plafond mémoire de 120 Mo.
    func test_streamCopy_acrossSeveralBuffers_reproducesTheBytesExactly() throws {
        let dir = try makeDirectory()
        let source = try makeFile(bytes: 64 * 1024 * 2 + 137, ext: "bin", in: dir)
        let destination = dir.appendingPathComponent("copy.bin")

        let written = try ShareMediaStaging.streamCopy(
            from: source, to: destination, bufferSize: ShareMediaStaging.copyBufferSize
        )

        XCTAssertEqual(written, 64 * 1024 * 2 + 137)
        XCTAssertEqual(
            try Data(contentsOf: destination), try Data(contentsOf: source),
            "les octets copiés doivent être IDENTIQUES, pas seulement de même taille"
        )
    }

    func test_streamCopy_onEmptySource_producesAnEmptyFile() throws {
        let dir = try makeDirectory()
        let source = try makeFile(bytes: 0, ext: "bin", in: dir)
        let destination = dir.appendingPathComponent("copy.bin")

        XCTAssertEqual(try ShareMediaStaging.streamCopy(
            from: source, to: destination, bufferSize: 64 * 1024), 0)
        XCTAssertTrue(FileManager.default.fileExists(atPath: destination.path))
    }

    func test_streamCopy_overAnExistingDestination_overwritesIt() throws {
        let dir = try makeDirectory()
        let source = try makeFile(bytes: 512, ext: "bin", in: dir)
        let destination = dir.appendingPathComponent("copy.bin")
        try Data(repeating: 0xFF, count: 4096).write(to: destination)

        _ = try ShareMediaStaging.streamCopy(from: source, to: destination, bufferSize: 64 * 1024)

        XCTAssertEqual(try Data(contentsOf: destination).count, 512,
                       "un résidu d'une tentative précédente ne doit pas survivre à la copie")
    }

    // MARK: - Mise en scène complète

    func test_stage_writesUnderTheShareSubdirectory_withTheOriginalExtension() throws {
        let dir = try makeDirectory()
        let source = try makeFile(bytes: 2048, ext: "HEIC", in: dir)
        let mediaRoot = try makeDirectory()

        let staged = try ShareMediaStaging.stage(
            source: source, into: mediaRoot, shareId: "cid_abc",
            index: 3, mime: "image/heic", freeBytes: 1_000_000_000
        )

        XCTAssertEqual(staged.relPath, "cid_abc/3.heic",
                       "l'extension est PRÉSERVÉE en minuscules — le consommateur en dérive le MIME")
        XCTAssertEqual(staged.ext, "heic")
        XCTAssertEqual(staged.mime, "image/heic")
        XCTAssertEqual(staged.bytes, 2048)
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: mediaRoot.appendingPathComponent(staged.relPath).path))
    }

    /// Une photo partagée depuis Photos porte son lieu : il ne quitte pas
    /// l'appareil par défaut (#11847, défaut validé de #11247), et ses pixels
    /// ne sont pas ré-encodés pour autant.
    func test_stage_aPhotoWithLocation_isStagedWithoutIt() throws {
        let dir = try makeDirectory()
        let source = try makeGeotaggedJPEG(in: dir)
        let mediaRoot = try makeDirectory()

        let staged = try ShareMediaStaging.stage(
            source: source, into: mediaRoot, shareId: "cid_gps",
            index: 0, mime: "image/jpeg", freeBytes: 1_000_000_000
        )

        let copy = try Data(contentsOf: mediaRoot.appendingPathComponent(staged.relPath))
        let image = try XCTUnwrap(CGImageSourceCreateWithData(copy as CFData, nil))
        let properties = try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(image, 0, nil) as? [CFString: Any])
        XCTAssertNil(properties[kCGImagePropertyGPSDictionary], "le lieu de la photo ne doit pas partir")
        XCTAssertEqual(staged.bytes, copy.count, "la fiche annonce les octets réellement copiés")
    }

    private func makeGeotaggedJPEG(in directory: URL) throws -> URL {
        let space = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        let context = try XCTUnwrap(CGContext(data: nil, width: 64, height: 48, bitsPerComponent: 8, bytesPerRow: 0,
                                              space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        context.setFillColor(CGColor(srgbRed: 0.2, green: 0.5, blue: 0.8, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: 64, height: 48))
        let image = try XCTUnwrap(context.makeImage())
        let url = directory.appendingPathComponent("IMG_0001.jpeg")
        let destination = try XCTUnwrap(CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil))
        let gps: [CFString: Any] = [
            kCGImagePropertyGPSLatitude: 48.8566, kCGImagePropertyGPSLatitudeRef: "N",
            kCGImagePropertyGPSLongitude: 2.3522, kCGImagePropertyGPSLongitudeRef: "E",
        ]
        CGImageDestinationAddImage(destination, image, [kCGImagePropertyGPSDictionary: gps] as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return url
    }

    func test_stage_withoutExtension_fallsBackToBin() throws {
        let dir = try makeDirectory()
        let source = dir.appendingPathComponent("sans-extension")
        try Data(repeating: 7, count: 16).write(to: source)
        let mediaRoot = try makeDirectory()

        let staged = try ShareMediaStaging.stage(
            source: source, into: mediaRoot, shareId: "cid_abc",
            index: 0, mime: "application/octet-stream", freeBytes: 1_000_000_000
        )

        XCTAssertEqual(staged.relPath, "cid_abc/0.bin")
    }

    /// L'extension vient du nom de fichier que l'app hôte a choisi : seule une
    /// extension courte, minuscule, alphanumérique se garde (#11134).
    func test_fileExtension_replacesAnythingButAShortLowercaseAlphanumeric() {
        let hostile = ["..", "a/b", String(repeating: "x", count: 40), "jpé", "j p", "-1"]
        hostile.forEach { ext in
            XCTAssertEqual(ShareMediaStaging.fileExtension(sourceExtension: ext, mime: "image/png"), "png", ext)
            XCTAssertEqual(ShareMediaStaging.fileExtension(sourceExtension: ext, mime: "application/octet-stream"), "bin", ext)
        }
        XCTAssertEqual(ShareMediaStaging.fileExtension(sourceExtension: "JPG", mime: "image/png"), "jpg")
        XCTAssertEqual(ShareMediaStaging.fileExtension(sourceExtension: "mp4", mime: "image/png"), "mp4")
    }

    func test_stage_aShareIdThatClimbsOut_isRefusedAndWritesNothingOutside() throws {
        let dir = try makeDirectory()
        let source = try makeFile(bytes: 16, ext: "jpg", in: dir)
        let mediaRoot = try makeDirectory().appendingPathComponent("share_pending_media", isDirectory: true)
        try FileManager.default.createDirectory(at: mediaRoot, withIntermediateDirectories: true)

        XCTAssertThrowsError(try ShareMediaStaging.stage(
            source: source, into: mediaRoot, shareId: "../evade",
            index: 0, mime: "image/jpeg", freeBytes: 1_000_000_000
        )) { error in
            XCTAssertEqual(error as? ShareMediaStagingError, .destinationOutsideShare)
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: mediaRoot.deletingLastPathComponent().appendingPathComponent("evade").path))
    }

    func test_stage_aShareDirectoryThatIsASymlink_isRefused() throws {
        let dir = try makeDirectory()
        let source = try makeFile(bytes: 16, ext: "jpg", in: dir)
        let mediaRoot = try makeDirectory()
        let elsewhere = try makeDirectory()
        try FileManager.default.createSymbolicLink(
            at: mediaRoot.appendingPathComponent("cid_abc"), withDestinationURL: elsewhere)

        XCTAssertThrowsError(try ShareMediaStaging.stage(
            source: source, into: mediaRoot, shareId: "cid_abc",
            index: 0, mime: "image/jpeg", freeBytes: 1_000_000_000
        )) { error in
            XCTAssertEqual(error as? ShareMediaStagingError, .destinationOutsideShare)
        }
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: elsewhere.path), [])
    }

    /// Un disque plein transformerait la copie en fichier TRONQUÉ, donc en
    /// pièce jointe corrompue livrée sans un mot. Le refus est explicite.
    func test_stage_withoutEnoughFreeSpace_refusesBeforeCopying() throws {
        let dir = try makeDirectory()
        let source = try makeFile(bytes: 4096, ext: "mp4", in: dir)
        let mediaRoot = try makeDirectory()

        XCTAssertThrowsError(try ShareMediaStaging.stage(
            source: source, into: mediaRoot, shareId: "cid_abc",
            index: 0, mime: "video/mp4", freeBytes: 4096
        )) { error in
            XCTAssertEqual(
                error as? ShareMediaStagingError,
                .insufficientFreeSpace(needed: 4096 + ShareUploadBudget.freeSpaceMarginBytes, free: 4096)
            )
        }
        XCTAssertFalse(FileManager.default.fileExists(
            atPath: mediaRoot.appendingPathComponent("cid_abc/0.mp4").path),
            "aucun octet ne doit être écrit quand la place manque")
    }

    // MARK: - Une copie interrompue ne laisse rien (#11429)

    /// Un dossier s'ouvre mais ne se lit pas : la destination est déjà créée
    /// quand la lecture échoue. Rien ne doit en rester dans l'App Group.
    func test_stage_aCopyThatFailsMidway_leavesNoPartialFile() throws {
        let unreadable = try makeDirectory()
        let mediaRoot = try makeDirectory()

        XCTAssertThrowsError(try ShareMediaStaging.stage(
            source: unreadable, into: mediaRoot, shareId: "cid_abc",
            index: 0, mime: "image/jpeg", freeBytes: .max
        ))
        XCTAssertEqual(
            try FileManager.default.contentsOfDirectory(atPath: mediaRoot.appendingPathComponent("cid_abc").path), [],
            "la copie partielle doit être supprimée"
        )
    }

    func test_streamCopy_whenAdmitRefusesTheNextChunk_stopsBeforeWritingIt() throws {
        let dir = try makeDirectory()
        let source = try makeFile(bytes: 1000, ext: "bin", in: dir)
        let destination = dir.appendingPathComponent("copy.bin")
        struct Refused: Error {}

        XCTAssertThrowsError(try ShareMediaStaging.streamCopy(from: source, to: destination, bufferSize: 400) { total in
            if total > 400 { throw Refused() }
        })
        XCTAssertEqual(try Data(contentsOf: destination).count, 400, "la tranche refusée n'est jamais écrite")
    }

    // MARK: - Budget cumulé (#11429)

    func test_byteBudget_reservesAtomically_underConcurrentDemands() {
        let budget = ShareByteBudget(limit: 1_000)
        let granted = OSAllocatedUnfairLockCounter()

        DispatchQueue.concurrentPerform(iterations: 200) { _ in
            if budget.reserve(7) { granted.increment() }
        }

        XCTAssertEqual(granted.value, 142, "1000 / 7 = 142 réservations, jamais une de plus")
        XCTAssertEqual(budget.reservedBytes, 994)
    }

    /// Huit copies concurrentes de 100 Kio sous un plafond de 300 Kio : trois
    /// passent, les cinq autres sont refusées sans laisser un octet.
    func test_stage_concurrentCopies_neverExceedTheCumulativeBudget() throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeDirectory()
        let size = 100 * 1024
        let sources = try (0..<8).map { _ in try makeFile(bytes: size, ext: "jpg", in: dir) }
        let budget = ShareByteBudget(limit: 3 * size)
        let outcomes = OutcomeBox()

        DispatchQueue.concurrentPerform(iterations: sources.count) { index in
            do {
                let staged = try ShareMediaStaging.stage(
                    source: sources[index], into: mediaRoot, shareId: "cid_abc",
                    index: index, mime: "image/jpeg", freeBytes: .max, budget: budget
                )
                outcomes.append(.success(staged))
            } catch let error as ShareMediaStagingError {
                outcomes.append(.failure(error))
            } catch {
                outcomes.append(.failure(.copyFailed(error.localizedDescription)))
            }
        }

        let results = outcomes.values
        let copied = results.compactMap { try? $0.get() }
        let refused = results.compactMap { result -> ShareMediaStagingError? in
            guard case .failure(let error) = result else { return nil }
            return error
        }
        XCTAssertEqual(copied.count, 3)
        XCTAssertEqual(refused.count, 5)
        XCTAssertTrue(refused.allSatisfy(\.isOverBudget), "\(refused)")
        let onDisk = try FileManager.default.contentsOfDirectory(atPath: mediaRoot.appendingPathComponent("cid_abc").path)
        XCTAssertEqual(onDisk.count, 3, "aucune copie refusée ne laisse de fichier")
        XCTAssertEqual(budget.reservedBytes, 3 * size)
    }

    func test_stage_aFailedCopy_givesItsReservationBack() throws {
        let unreadable = try makeDirectory()
        let mediaRoot = try makeDirectory()
        let budget = ShareByteBudget(limit: 1_000)

        XCTAssertThrowsError(try ShareMediaStaging.stage(
            source: unreadable, into: mediaRoot, shareId: "cid_abc",
            index: 0, mime: "image/jpeg", freeBytes: .max, budget: budget
        ))
        XCTAssertEqual(budget.reservedBytes, 0)
    }

    func test_shortfalls_sayHowManyFilesTheBudgetLeftBehind_andThatOthersFailed() {
        XCTAssertEqual(
            ShareExtensionIncoming.shortfalls(from: [
                .byteBudgetExceeded(total: 2, limit: 1), .copyFailed("x"), .byteBudgetExceeded(total: 3, limit: 1),
            ]),
            [.overBudget(uncopied: 2), .unprepared]
        )
        XCTAssertEqual(
            ShareExtensionIncoming.shortfalls(from: [.refusedSource, .refusedSource]),
            [.refusedSource],
            "un chemin refusé se dit pour ce qu'il est, pas comme un fichier à télécharger"
        )
        XCTAssertEqual(ShareExtensionIncoming.shortfalls(from: []), [])
    }

    func test_requiredFreeBytes_addsTheSafetyMargin() {
        XCTAssertEqual(ShareMediaStaging.requiredFreeBytes(for: 1_000),
                       1_000 + ShareUploadBudget.freeSpaceMarginBytes)
    }

    // MARK: - iCloud non téléchargé

    /// Un média iCloud non téléchargé produit un fichier VIDE : le laisser
    /// passer livrerait une pièce jointe de zéro octet.
    func test_isNotDownloaded_forANotDownloadedUbiquitousItem_isTrue() {
        XCTAssertTrue(ShareMediaStaging.isNotDownloaded(
            ubiquitousDownloadingStatus: URLUbiquitousItemDownloadingStatus.notDownloaded.rawValue))
    }

    func test_isNotDownloaded_forACurrentUbiquitousItem_isFalse() {
        XCTAssertFalse(ShareMediaStaging.isNotDownloaded(
            ubiquitousDownloadingStatus: URLUbiquitousItemDownloadingStatus.current.rawValue))
    }

    /// Un fichier local ordinaire n'a PAS de statut ubiquitaire : l'absence de
    /// valeur ne doit jamais être lue comme « non téléchargé ».
    func test_isNotDownloaded_forANonUbiquitousFile_isFalse() {
        XCTAssertFalse(ShareMediaStaging.isNotDownloaded(ubiquitousDownloadingStatus: nil))
    }

    // MARK: - MIME

    func test_mimeType_prefersTheTypeIdentifier() {
        XCTAssertEqual(
            ShareMediaStaging.mimeType(typeIdentifier: "com.compuserve.gif", fileExtension: "bin"),
            "image/gif",
            "un GIF conforme à public.image doit rester un image/gif, pas devenir un octet-stream"
        )
    }

    func test_mimeType_fallsBackToTheExtension() {
        XCTAssertEqual(
            ShareMediaStaging.mimeType(typeIdentifier: nil, fileExtension: "pdf"),
            "application/pdf"
        )
    }

    func test_mimeType_withNothingUsable_isOctetStream() {
        XCTAssertEqual(
            ShareMediaStaging.mimeType(typeIdentifier: nil, fileExtension: ""),
            "application/octet-stream",
            "getAttachmentType retombe sur `document` côté serveur — c'est ce qui fait passer .xls"
        )
    }

    // MARK: - Abandon

    func test_discard_removesTheWholeShareDirectory() throws {
        let mediaRoot = try makeDirectory()
        let shareDir = mediaRoot.appendingPathComponent("cid_abc", isDirectory: true)
        try FileManager.default.createDirectory(at: shareDir, withIntermediateDirectories: true)
        try Data(repeating: 1, count: 8).write(to: shareDir.appendingPathComponent("0.jpg"))

        ShareMediaStaging.discard(shareId: "cid_abc", in: mediaRoot)

        XCTAssertFalse(FileManager.default.fileExists(atPath: shareDir.path))
    }

    func test_discard_onAnAbsentDirectory_isSilent() throws {
        let mediaRoot = try makeDirectory()
        ShareMediaStaging.discard(shareId: "jamais-vu", in: mediaRoot)
    }

    // MARK: - Défense en profondeur (round 2 de revue — Critical)
    //
    // Le bouton Annuler redevenait actif ~700 ms après un envoi tenté, pendant
    // que la fiche de reprise (déjà committée, `ShareSender.send` écrit AVANT
    // le premier POST) référençait encore ces mêmes fichiers. La garde côté UI
    // (round 2, `ShareCancelPolicy`) suffit à fermer le symptôme ; celle-ci vit
    // dans le code qui DÉTRUIT, pour qu'aucune autre porte ne puisse la
    // contourner demain.

    /// LE Critical : une fiche vivante référence encore ce dossier — l'effacer
    /// perdrait des octets qu'une reprise différée attend.
    func test_discard_whenALivingRecordReferencesTheShare_refusesToErase() throws {
        let mediaRoot = try makeDirectory()
        let shareDir = mediaRoot.appendingPathComponent("cid_committed", isDirectory: true)
        try FileManager.default.createDirectory(at: shareDir, withIntermediateDirectories: true)
        try Data(repeating: 1, count: 8).write(to: shareDir.appendingPathComponent("0.jpg"))

        let pendingSendsDirectory = try makeDirectory()
        try Data("{}".utf8).write(
            to: pendingSendsDirectory.appendingPathComponent("cid_committed.json"))

        ShareMediaStaging.discard(
            shareId: "cid_committed", in: mediaRoot, pendingSendsDirectory: pendingSendsDirectory)

        XCTAssertTrue(
            FileManager.default.fileExists(atPath: shareDir.path),
            "une fiche vivante référence encore ce dossier — l'effacer perdrait des octets "
            + "qu'une reprise différée attend"
        )
    }

    /// La fuite fermée au round 1 ne doit PAS rouvrir : sans fiche vivante,
    /// annuler efface toujours (annulation avant tout envoi).
    func test_discard_withoutALivingRecord_stillErases() throws {
        let mediaRoot = try makeDirectory()
        let shareDir = mediaRoot.appendingPathComponent("cid_never_sent", isDirectory: true)
        try FileManager.default.createDirectory(at: shareDir, withIntermediateDirectories: true)
        try Data(repeating: 1, count: 8).write(to: shareDir.appendingPathComponent("0.jpg"))

        let pendingSendsDirectory = try makeDirectory()

        ShareMediaStaging.discard(
            shareId: "cid_never_sent", in: mediaRoot, pendingSendsDirectory: pendingSendsDirectory)

        XCTAssertFalse(
            FileManager.default.fileExists(atPath: shareDir.path),
            "annuler AVANT tout envoi doit continuer d'effacer les fichiers copiés"
        )
    }

    /// Une fiche référençant un AUTRE partage ne doit pas protéger celui-ci —
    /// la vérification doit être scopée au `shareId` exact.
    func test_discard_whenALivingRecordReferencesADifferentShare_stillErases() throws {
        let mediaRoot = try makeDirectory()
        let shareDir = mediaRoot.appendingPathComponent("cid_this_one", isDirectory: true)
        try FileManager.default.createDirectory(at: shareDir, withIntermediateDirectories: true)
        try Data(repeating: 1, count: 8).write(to: shareDir.appendingPathComponent("0.jpg"))

        let pendingSendsDirectory = try makeDirectory()
        try Data("{}".utf8).write(
            to: pendingSendsDirectory.appendingPathComponent("cid_a_different_share.json"))

        ShareMediaStaging.discard(
            shareId: "cid_this_one", in: mediaRoot, pendingSendsDirectory: pendingSendsDirectory)

        XCTAssertFalse(FileManager.default.fileExists(atPath: shareDir.path))
    }
}

private final class OSAllocatedUnfairLockCounter: Sendable {
    private let count = OSAllocatedUnfairLock(initialState: 0)
    var value: Int { count.withLock { $0 } }
    func increment() { count.withLock { $0 += 1 } }
}

private final class OutcomeBox: Sendable {
    private let results = OSAllocatedUnfairLock(initialState: [Result<ShareStagedMedia, ShareMediaStagingError>]())
    var values: [Result<ShareStagedMedia, ShareMediaStagingError>] { results.withLock { $0 } }
    func append(_ result: Result<ShareStagedMedia, ShareMediaStagingError>) { results.withLock { $0.append(result) } }
}

/// La vignette d'une VIDÉO copiée (#11528) : une image tirée du fichier,
/// réduite par le décodeur lui-même — jamais une image pleine résolution sous
/// le plafond mémoire de l'extension. Un fichier illisible rend `nil`, et la
/// tuile garde son glyphe.
final class ShareIncomingVideoPosterTests: XCTestCase {

    private func makeMovie(width: Int, height: Int) async throws -> URL {
        let url = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("share-poster-\(UUID().uuidString).mov")
        let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
        ])
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height,
        ])
        writer.add(input)
        XCTAssertTrue(writer.startWriting())
        writer.startSession(atSourceTime: .zero)
        for frame in 0..<2 {
            while !input.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 1_000_000) }
            let buffer = try XCTUnwrap(Self.solidBuffer(pool: adaptor.pixelBufferPool, value: frame == 0 ? 0x40 : 0xC0))
            XCTAssertTrue(adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(frame), timescale: 10)))
        }
        input.markAsFinished()
        await writer.finishWriting()
        XCTAssertEqual(writer.status, .completed)
        return url
    }

    private static func solidBuffer(pool: CVPixelBufferPool?, value: UInt8) -> CVPixelBuffer? {
        guard let pool else { return nil }
        var buffer: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
        guard let buffer else { return nil }
        CVPixelBufferLockBaseAddress(buffer, [])
        if let base = CVPixelBufferGetBaseAddress(buffer) {
            memset(base, Int32(value), CVPixelBufferGetDataSize(buffer))
        }
        CVPixelBufferUnlockBaseAddress(buffer, [])
        return buffer
    }

    func test_videoPoster_movie_returnsAnImageNoLargerThanTheRequestedSide() async throws {
        let movie = try await makeMovie(width: 640, height: 360)
        defer { try? FileManager.default.removeItem(at: movie) }

        let poster = await ShareIncomingThumbnail.videoPoster(movie, maxPixel: 160)

        let image = try XCTUnwrap(poster, "une vidéo lisible doit rendre une image, pas le glyphe")
        let pixels = image.size.applying(CGAffineTransform(scaleX: image.scale, y: image.scale))
        XCTAssertGreaterThan(pixels.width, 0)
        XCTAssertLessThanOrEqual(max(pixels.width, pixels.height), 160)
    }

    func test_videoPoster_fileThatIsNotAMovie_returnsNilSoTheGlyphStays() async throws {
        let url = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("share-poster-\(UUID().uuidString).mov")
        try Data("pas une vidéo".utf8).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }

        let poster = await ShareIncomingThumbnail.videoPoster(url, maxPixel: 160)

        XCTAssertNil(poster)
    }
}
