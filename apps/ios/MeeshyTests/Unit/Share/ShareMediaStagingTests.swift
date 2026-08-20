import XCTest

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
                .insufficientFreeSpace(needed: 4096 + ShareLimits.freeSpaceMarginBytes, free: 4096)
            )
        }
        XCTAssertFalse(FileManager.default.fileExists(
            atPath: mediaRoot.appendingPathComponent("cid_abc/0.mp4").path),
            "aucun octet ne doit être écrit quand la place manque")
    }

    func test_requiredFreeBytes_addsTheSafetyMargin() {
        XCTAssertEqual(ShareMediaStaging.requiredFreeBytes(for: 1_000),
                       1_000 + ShareLimits.freeSpaceMarginBytes)
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
}
