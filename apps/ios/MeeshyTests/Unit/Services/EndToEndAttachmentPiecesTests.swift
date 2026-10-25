import XCTest
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// Une passerelle de blobs en mémoire : ce qu'elle garde est TOUT ce que le
/// serveur verrait d'une pièce chiffrée de bout en bout (#10789).
nonisolated final class InMemoryBlobGateway: EndToEndBlobUploading, EndToEndBlobFetching, @unchecked Sendable {
    private let lock = NSLock()
    private var blobs: [String: Data] = [:]
    private var next = 0
    var failsUploads = false
    var tamper: ((Data) -> Data)?
    /// Un serveur compromis qui sert, sous un identifiant, le blob d'un AUTRE identifiant.
    var substitute: [String: String] = [:]
    private(set) var limits: [Int] = []

    var stored: [String: Data] { lock.withLock { blobs } }

    func upload(blobAt fileURL: URL) async throws -> String {
        if failsUploads { throw URLError(.notConnectedToInternet) }
        let data = try Data(contentsOf: fileURL)
        return lock.withLock {
            next += 1
            let id = String(format: "%024x", next)
            blobs[id] = data
            return id
        }
    }

    func blob(_ blobId: String, to destination: URL, maxBytes: Int) async throws {
        let served = lock.withLock { () -> Data? in
            limits.append(maxBytes)
            return blobs[substitute[blobId] ?? blobId]
        }
        guard let data = served else { throw URLError(.fileDoesNotExist) }
        try (tamper?(data) ?? data).write(to: destination)
    }
}

/// **Une pièce jointe d'une conversation chiffrée de bout en bout part chiffrée
/// sur l'appareil, revient vérifiée, et son clair ne vit que dans le dossier
/// protégé** (#10789). Modèle de menace : serveur qui lit et altère les blobs.
final class EndToEndAttachmentPiecesTests: XCTestCase {

    private func temporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("e2ee-pieces-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    private func source(_ data: Data, in dir: URL, thumbnail: Data? = nil, transcript: String? = nil) throws -> EndToEndPieceSource {
        let file = dir.appendingPathComponent("IMG_\(UUID().uuidString).jpg")
        try data.write(to: file)
        return EndToEndPieceSource(
            localId: "local1", fileURL: file, contentType: "image/jpeg", fileName: "IMG_0042.jpg", kind: .image,
            width: 4032, height: 3024, durationMs: nil, thumbHash: "1QcSHQRnh493V4dIh4eXh1h4kJUI",
            thumbnailJPEG: thumbnail, transcript: transcript.map { .init(text: $0, language: "fr") }
        )
    }

    private func vault(_ gateway: InMemoryBlobGateway, in dir: URL) -> EndToEndAttachmentVault {
        EndToEndAttachmentVault(paths: EndToEndMediaPaths(directory: dir.appendingPathComponent("vault", isDirectory: true)), fetcher: gateway)
    }

    // MARK: - Envoi

    func test_seal_leServeurNeRecoitQueDuChiffre_etLePointeurRouvreLaPiece() async throws {
        let dir = try temporaryDirectory()
        let gateway = InMemoryBlobGateway()
        let sentinel = Data("photo-sentinelle-\(UUID().uuidString)".utf8)
        let sealer = EndToEndPieceSealer(uploader: gateway, vault: vault(gateway, in: dir), temporaryDirectory: dir)

        let pointers = try await sealer.seal([try source(sentinel, in: dir, thumbnail: Data("vignette-claire".utf8))])

        let pointer = try XCTUnwrap(pointers.first)
        let blob = try XCTUnwrap(gateway.stored[pointer.id])
        XCTAssertNil(blob.range(of: sentinel), "aucun octet clair sur le serveur")
        XCTAssertEqual(try E2EEAttachmentCipher.open(blob, with: pointer.secret), sentinel)
        XCTAssertEqual(pointer.fileName, "IMG_0042.jpg")
        XCTAssertEqual(pointer.contentType, "image/jpeg")
        XCTAssertEqual(pointer.size, sentinel.count)
        let thumbnail = try XCTUnwrap(pointer.thumbnail)
        XCTAssertNotEqual(thumbnail.id, pointer.id, "l'affiche part en blob séparé")
        XCTAssertNotEqual(thumbnail.key, pointer.key, "sous sa propre clé")
        XCTAssertNil(try XCTUnwrap(gateway.stored[thumbnail.id]).range(of: Data("vignette-claire".utf8)))
        XCTAssertEqual(gateway.stored.count, 2)
        let leftovers = try FileManager.default.contentsOfDirectory(atPath: dir.path).filter { $0.hasPrefix("e2ee-out-") || $0.hasPrefix("e2ee-thumb") }
        XCTAssertEqual(leftovers, [], "aucun blob ni clair temporaire ne reste")
    }

    func test_seal_lExpediteurGardeSonClairDansLeDossierProtege_rienARetelecharger() async throws {
        let dir = try temporaryDirectory()
        let gateway = InMemoryBlobGateway()
        let store = vault(gateway, in: dir)
        let sentinel = Data("ma-photo".utf8)

        let pointers = try await EndToEndPieceSealer(uploader: gateway, vault: store, temporaryDirectory: dir)
            .seal([try source(sentinel, in: dir)])

        let kept = store.paths.file(for: try XCTUnwrap(pointers.first))
        XCTAssertEqual(try Data(contentsOf: kept), sentinel)
    }

    func test_seal_unTeleversementEnEchec_neRendAucunPointeur() async throws {
        let dir = try temporaryDirectory()
        let gateway = InMemoryBlobGateway()
        gateway.failsUploads = true

        do {
            _ = try await EndToEndPieceSealer(uploader: gateway, vault: vault(gateway, in: dir), temporaryDirectory: dir)
                .seal([try source(Data("x".utf8), in: dir)])
            XCTFail("rien ne part")
        } catch {}
        XCTAssertTrue(gateway.stored.isEmpty)
    }

    // MARK: - Réception

    private func sealedOnServer(_ data: Data, by gateway: InMemoryBlobGateway, in dir: URL) async throws -> E2EEAttachmentPointer {
        let senderDir = dir.appendingPathComponent("sender", isDirectory: true)
        try FileManager.default.createDirectory(at: senderDir, withIntermediateDirectories: true)
        let sender = EndToEndPieceSealer(uploader: gateway, vault: vault(gateway, in: senderDir), temporaryDirectory: senderDir)
        let pointers = try await sender.seal([try source(data, in: senderDir, thumbnail: Data("affiche".utf8))])
        return try XCTUnwrap(pointers.first)
    }

    func test_materialize_telechargeVerifieDechiffre_etRangeLeClairEnProtectionComplete() async throws {
        let dir = try temporaryDirectory()
        let gateway = InMemoryBlobGateway()
        let pointer = try await sealedOnServer(Data("reçue".utf8), by: gateway, in: dir)
        let receiver = vault(gateway, in: dir.appendingPathComponent("receiver"))

        let present = await receiver.materialize([pointer])

        XCTAssertEqual(present, 2, "la pièce et son affiche")
        XCTAssertEqual(try Data(contentsOf: receiver.paths.file(for: pointer)), Data("reçue".utf8))
        let thumbnail = try XCTUnwrap(receiver.paths.thumbnail(of: pointer))
        XCTAssertEqual(try Data(contentsOf: thumbnail), Data("affiche".utf8))
        let values = try receiver.paths.file(for: pointer).resourceValues(forKeys: [.isExcludedFromBackupKey])
        XCTAssertEqual(values.isExcludedFromBackup, true)
    }

    func test_materialize_unBlobAltereParLeServeur_neLaisseAucunClair() async throws {
        let dir = try temporaryDirectory()
        let gateway = InMemoryBlobGateway()
        let pointer = try await sealedOnServer(Data("intègre".utf8), by: gateway, in: dir)
        gateway.tamper = { data in var forged = data; forged[20] ^= 0x01; return forged }
        let receiver = vault(gateway, in: dir.appendingPathComponent("receiver"))

        let present = await receiver.materialize([pointer])

        XCTAssertEqual(present, 0)
        XCTAssertFalse(FileManager.default.fileExists(atPath: receiver.paths.file(for: pointer).path))
        let files = (try? FileManager.default.contentsOfDirectory(atPath: receiver.paths.directory.path)) ?? []
        XCTAssertTrue(files.isEmpty, "ni clair partiel ni fichier .partial : \(files)")
    }

    func test_materialize_unSchemeInconnu_neSeTelechargePas() async throws {
        let dir = try temporaryDirectory()
        let gateway = InMemoryBlobGateway()
        let future = E2EEAttachmentPointer(
            id: "6add0000000000000000b10b", scheme: "client-v9", key: Data(count: 64), digest: Data(count: 32), size: 1,
            contentType: "image/jpeg", fileName: nil, kind: .image
        )

        let present = await vault(gateway, in: dir).materialize([future])

        XCTAssertEqual(present, 0)
    }

    func test_wipe_effaceToutLeClair() async throws {
        let dir = try temporaryDirectory()
        let gateway = InMemoryBlobGateway()
        let pointer = try await sealedOnServer(Data("à effacer".utf8), by: gateway, in: dir)
        let receiver = vault(gateway, in: dir.appendingPathComponent("receiver"))
        _ = await receiver.materialize([pointer])

        await receiver.wipe()

        XCTAssertFalse(FileManager.default.fileExists(atPath: receiver.paths.directory.path))
    }

    // MARK: - Ce que la bulle rend, ce que la base garde

    func test_overlay_laBulleLitLePointeur_etJamaisLaCle() throws {
        let paths = EndToEndMediaPaths(directory: URL(fileURLWithPath: "/tmp/e2ee"))
        let pointer = E2EEAttachmentPointer(
            id: "6add0000000000000000b10b", key: Data(repeating: 9, count: 64), digest: Data(repeating: 8, count: 32),
            size: 1234, contentType: "audio/mp4", fileName: "vocal.m4a", kind: .audio, durationMs: 4200,
            transcript: .init(text: "bonjour", language: "fr")
        )

        let shown = try XCTUnwrap(EndToEndAttachmentOverlay.attachments(
            for: [pointer], messageId: "m1", uploadedBy: "u1", createdAt: Date(), servedBlobIds: [pointer.id], paths: paths
        ).first)

        XCTAssertEqual(shown.mimeType, "audio/mp4")
        XCTAssertEqual(shown.type, .audio)
        XCTAssertEqual(shown.originalName, "vocal.m4a")
        XCTAssertEqual(shown.fileSize, 1234)
        XCTAssertEqual(shown.duration, 4200)
        XCTAssertEqual(shown.fileUrl, paths.file(for: pointer).absoluteString)
        XCTAssertTrue(shown.fileUrl.hasPrefix("file://"))
        XCTAssertEqual(shown.transcription?.text, "bonjour")
        let encoded = String(decoding: try JSONEncoder().encode(shown), as: UTF8.self)
        XCTAssertFalse(encoded.contains(pointer.key.base64EncodedString()), "la clé ne passe jamais sur la pièce affichée")
        XCTAssertEqual(EndToEndAttachmentOverlay.messageType(of: [pointer]), .audio)
    }

    func test_sealedForStorage_laBaseDesMessagesNeGardeQueLaFormeOpaque() throws {
        let paths = EndToEndMediaPaths(directory: URL(fileURLWithPath: "/tmp/e2ee"))
        let pointer = E2EEAttachmentPointer(
            id: "6add0000000000000000b10c", key: Data(repeating: 9, count: 64), digest: Data(repeating: 8, count: 32),
            size: 99, contentType: "application/pdf", fileName: "contrat-secret.pdf", kind: .file
        )
        var shown = EndToEndAttachmentOverlay.attachments(
            for: [pointer], messageId: "m1", uploadedBy: "u1", createdAt: Date(), servedBlobIds: [pointer.id], paths: paths
        )
        shown[0].reactionSummary = ["👍": 1]
        let plain = MeeshyMessageAttachment(id: "p1", originalName: "ordinaire.pdf", mimeType: "application/pdf")

        let stored = EndToEndAttachmentOverlay.sealedForStorage(shown + [plain])

        let encoded = String(decoding: try JSONEncoder().encode(stored), as: UTF8.self)
        XCTAssertFalse(encoded.contains("contrat-secret"))
        XCTAssertFalse(encoded.contains("application/pdf\",\"originalName\":\"contrat"))
        XCTAssertEqual(stored[0].mimeType, "application/octet-stream")
        XCTAssertEqual(stored[0].reactionSummary, ["👍": 1])
        XCTAssertEqual(stored[1].originalName, "ordinaire.pdf", "une pièce en clair ne change pas")
    }

    // MARK: - Audit adversarial (2026-10-25)

    /// B1 — un pair (ou le serveur) réutilise l'identifiant du blob d'une AUTRE
    /// pièce, sous sa propre clé : le clair de l'une ne se fait jamais passer pour
    /// celui de l'autre, quel que soit l'ordre d'ouverture.
    func test_audit_unIdentifiantReutiliseSousUneAutreCle_neSubstituePasLeClair() async throws {
        let dir = try temporaryDirectory()
        let gateway = InMemoryBlobGateway()
        let alice = try await sealedOnServer(Data("photo d'Alice".utf8), by: gateway, in: dir)
        let mallory = try await sealedOnServer(Data("photo de Mallory".utf8), by: gateway, in: dir.appendingPathComponent("m"))
        let forged = E2EEAttachmentPointer(
            id: alice.id, key: mallory.key, digest: mallory.digest, size: mallory.size,
            contentType: "image/jpeg", fileName: "x.jpg", kind: .image
        )
        gateway.substitute = [alice.id: mallory.id]
        let receiver = vault(gateway, in: dir.appendingPathComponent("receiver"))
        _ = await receiver.materialize([forged])
        gateway.substitute = [:]

        _ = await receiver.materialize([alice])

        XCTAssertEqual(try Data(contentsOf: receiver.paths.file(for: alice)), Data("photo d'Alice".utf8))
        XCTAssertNotEqual(receiver.paths.file(for: alice), receiver.paths.file(for: forged))
    }

    /// M3 — le téléchargement est borné par la taille que le pointeur annonce.
    func test_audit_leTelechargementEstBorneParLaTailleDuPointeur() async throws {
        let dir = try temporaryDirectory()
        let gateway = InMemoryBlobGateway()
        let pointer = try await sealedOnServer(Data(repeating: 7, count: 2000), by: gateway, in: dir)

        _ = await vault(gateway, in: dir.appendingPathComponent("receiver")).materialize([pointer])

        XCTAssertTrue(gateway.limits.contains(E2EEAttachmentCipher.blobSize(forPlaintextSize: 2000)))
    }

    /// B3 — un identifiant qui n'est pas un identifiant serveur ne compose aucune adresse.
    func test_audit_unIdentifiantHostile_nEstPasLisible() {
        let hostile = E2EEAttachmentPointer(
            id: "../../stories/6add0000000000000000b10b", key: Data(count: 64), digest: Data(count: 32), size: 1,
            contentType: "image/jpeg", fileName: nil, kind: .image
        )
        XCTAssertFalse(hostile.isReadable)
    }

    /// B2 — un pointeur dont le blob n'est pas rattaché à la ligne servie reste illisible.
    func test_audit_unPointeurHorsDeLaLigne_resteIllisible() throws {
        let paths = EndToEndMediaPaths(directory: URL(fileURLWithPath: "/tmp/e2ee"))
        let pointer = E2EEAttachmentPointer(
            id: "6add0000000000000000b10d", key: Data(repeating: 1, count: 64), digest: Data(repeating: 2, count: 32),
            size: 5, contentType: "image/jpeg", fileName: "a.jpg", kind: .image
        )

        let shown = try XCTUnwrap(EndToEndAttachmentOverlay.attachments(
            for: [pointer], messageId: "m1", uploadedBy: "u1", createdAt: Date(), servedBlobIds: ["6add0000000000000000ffff"], paths: paths
        ).first)

        XCTAssertEqual(shown.mimeType, "application/octet-stream")
        XCTAssertEqual(shown.fileUrl, "")
    }
}
