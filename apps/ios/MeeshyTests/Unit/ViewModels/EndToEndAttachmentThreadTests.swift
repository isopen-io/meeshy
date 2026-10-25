import XCTest
import GRDB
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// **Une pièce jointe chiffrée de bout en bout, de l'appareil d'Alice à la
/// bulle de Bob** (#10789). Deux installations libsignal RÉELLES de l'app
/// (enrôlement, scelleur, ouvreur de production) sur une fausse passerelle
/// (`LibsignalTestGateway`) et un faux stockage de blobs (`InMemoryBlobGateway`) :
/// Alice chiffre la photo sur son appareil, n'envoie que le blob et le pointeur
/// scellé ; Bob ouvre l'enveloppe, son fil reçoit la ligne servie (un blob
/// opaque, `application/octet-stream`), télécharge, vérifie, déchiffre, et la
/// CELLULE rend une photo, avec son nom et son clair sur le disque protégé.
/// Rien du clair, du nom ni du type n'atteint la passerelle, le stockage de
/// blobs ni la base des messages de l'app.
@MainActor
final class EndToEndAttachmentThreadTests: XCTestCase {

    private let conversationId = "00000000000000000000ab01"
    private let alice = "00000000000000000000aa11"
    private let bob = "00000000000000000000bb22"
    private let serverId = "00000000000000000000ab51"
    private let fileName = "IMG-\(UUID().uuidString).jpg"

    private func temporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("e2ee-thread-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    private func installation(_ userId: String, on gateway: LibsignalTestGateway) async throws -> EndToEndMessagingRuntime {
        let runtime = EndToEndMessagingRuntime(provisioning: try LibsignalDeviceProvisioning.inMemory(on: gateway, userId: userId))
        _ = try await runtime.ready(for: userId)
        return runtime
    }

    private func openThread(as userId: String, with peerId: String, endToEnd: any EndToEndMessagingProviding, media: EndToEndAttachmentVault) async throws -> (ConversationViewModel, MessagePersistenceActor, DatabaseQueue) {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "u\(userId.suffix(2))", displayName: "U"))
        let messageService = MockMessageService()
        let socket = MockMessageSocket()
        socket.isConnected = true
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        await persistence.start()
        let viewModel = ConversationViewModel(
            conversationId: conversationId, isDirect: true, participantUserId: peerId, encryptionMode: E2EEWire.mode,
            authManager: auth, messageService: messageService, conversationService: MockConversationService(),
            reactionService: MockReactionService(), reportService: MockReportService(), messageSocket: socket,
            dependencies: ConversationDependencies(
                dbPool: pool, persistence: persistence,
                collaborators: ConversationCollaborators(
                    persistence: persistence, syncEngine: ConversationSyncEngine.shared,
                    messageService: messageService, regimeLedger: EndToEndRegimeLedger()
                ),
                endToEndClear: EndToEndThreadClear(media: media)
            ),
            networkMonitor: FakeNetworkMonitor(isOnline: true), offlineQueue: FakeOfflineMessageQueue(), endToEnd: endToEnd
        )
        viewModel.start()
        return (viewModel, persistence, pool)
    }

    /// Ce que la passerelle sert : le littéral et les blobs OPAQUES, jamais le pointeur.
    private func served(blobIds: [String]) -> APIMessage {
        let attachments = blobIds.map {
            #"{"id":"\#($0)","messageId":"\#(serverId)","fileName":"e2ee_\#($0).bin","originalName":"","mimeType":"application/octet-stream","fileSize":592,"fileUrl":"2026/10/\#(alice)/e2ee_\#($0).bin","uploadedBy":"\#(alice)","isEncrypted":true,"encryptionMode":"e2ee","createdAt":"2026-10-25T12:00:00.000Z"}"#
        }.joined(separator: ",")
        return JSONStub.decode("""
        {"id":"\(serverId)","conversationId":"\(conversationId)","senderId":"\(alice)",
         "content":"\(E2EEWire.contentPlaceholder)","isEncrypted":true,"encryptionMode":"\(E2EEWire.mode)",
         "messageType":"file","messageSource":"user","createdAt":"2026-10-25T12:00:00.000Z",
         "attachments":[\(attachments)],
         "sender":{"id":"\(alice)","username":"u11","displayName":"U"}}
        """)
    }

    private func rendered(_ id: String, in viewModel: ConversationViewModel) -> MeeshyMessage? {
        let store = viewModel.messageStore
        guard let record = store.messages.first(where: { $0.serverId == id || $0.localId == id }),
              var message = store.domainMessage(for: record.localId, currentUserId: viewModel.currentUserId) else { return nil }
        ThreadVisitState.apply(to: &message, from: viewModel)
        return message
    }

    private func eventually(_ what: String, timeout: TimeInterval = 8, file: StaticString = #filePath, line: UInt = #line, _ condition: () -> Bool) async {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition(), Date() < deadline { try? await Task.sleep(nanoseconds: 20_000_000) }
        XCTAssertTrue(condition(), what, file: file, line: line)
    }

    func test_unePhotoChiffreeSurLAppareilDAlice_sAfficheDansLaBulleDeBob_etRienDuClairNeTouchelePassage() async throws {
        let dir = try temporaryDirectory()
        let gateway = LibsignalTestGateway()
        let blobs = InMemoryBlobGateway()
        let aliceDevice = try await installation(alice, on: gateway)
        let bobDevice = try await installation(bob, on: gateway)
        let aliceMedia = EndToEndAttachmentVault(paths: EndToEndMediaPaths(directory: dir.appendingPathComponent("alice")), fetcher: blobs)
        let bobMedia = EndToEndAttachmentVault(paths: EndToEndMediaPaths(directory: dir.appendingPathComponent("bob")), fetcher: blobs)
        let photo = Data([0xFF, 0xD8, 0xFF, 0xE0]) + Data("photo-sentinelle-\(UUID().uuidString)".utf8)
        let original = dir.appendingPathComponent("capture.jpg")
        try photo.write(to: original)

        // 1. Alice chiffre sur son appareil : seuls les blobs partent.
        let pointers = try await EndToEndPieceSealer(uploader: blobs, vault: aliceMedia, temporaryDirectory: dir).seal([EndToEndPieceSource(
            localId: "local", fileURL: original, contentType: "image/jpeg", fileName: fileName, kind: .image,
            width: 4032, height: 3024, durationMs: nil, thumbHash: nil, thumbnailJPEG: Data("affiche-claire".utf8), transcript: nil
        )])
        let content = E2EEContent(
            text: nil, language: nil, replyTo: nil, conversationId: conversationId,
            clientMessageId: "cid_alice_1", sentAt: Date(), attachments: pointers
        )
        let (alice, conversationId, serverId) = (alice, conversationId, serverId)
        try await aliceDevice.deliver(content, from: alice, to: bob) { sealed in
            gateway.relay(sealed, from: alice, conversationId: conversationId, messageId: serverId)
        }

        // 2. Bob ouvre l'enveloppe ; son fil reçoit la ligne servie, opaque.
        let (thread, persistence, pool) = try await openThread(as: bob, with: alice, endToEnd: bobDevice, media: bobMedia)
        for envelope in gateway.pending(for: bob) { await bobDevice.receive(envelope, as: bob) }
        try await persistence.upsertFromAPIMessages([served(blobIds: pointers.flatMap(\.blobIds))], preferredLanguages: ["fr"])

        // 3. La cellule rend une PHOTO, son nom, et son clair déchiffré sur le disque protégé.
        await eventually("la bulle rend la photo déchiffrée") {
            guard let piece = rendered(serverId, in: thread)?.attachments.first, piece.type == .image,
                  let url = URL(string: piece.fileUrl), let bytes = try? Data(contentsOf: url) else { return false }
            return bytes == photo
        }
        let shown = try XCTUnwrap(rendered(serverId, in: thread))
        XCTAssertEqual(shown.attachments.count, 1, "l'affiche n'est pas une seconde pièce")
        XCTAssertEqual(shown.attachments.first?.originalName, fileName)
        XCTAssertEqual(shown.attachments.first?.mimeType, "image/jpeg")
        XCTAssertEqual(shown.messageType, .image)
        let thumbnail = try XCTUnwrap(shown.attachments.first?.thumbnailUrl.flatMap(URL.init(string:)))
        XCTAssertEqual(try Data(contentsOf: thumbnail), Data("affiche-claire".utf8))

        // 4. Rien du clair, du nom ni du type sur le passage.
        let sentinel = photo.suffix(from: 4)
        for (blobId, blob) in blobs.stored {
            XCTAssertNil(blob.range(of: sentinel), "blob \(blobId) en clair")
            XCTAssertNil(blob.range(of: Data("affiche-claire".utf8)))
            XCTAssertNotEqual(blob.prefix(3), Data([0xFF, 0xD8, 0xFF]), "aucun en-tête JPEG")
        }
        let wire = gateway.wire.reduce(Data(), +)
        XCTAssertNil(wire.range(of: Data(fileName.utf8)), "le nom de fichier n'est pas sur le fil")
        XCTAssertNil(wire.range(of: Data("image/jpeg".utf8)), "le type n'est pas sur le fil")
        let stored = try await pool.read { db in try MessageRecord.fetchAll(db) }
        let databaseText = stored.compactMap { $0.attachmentsJson.map { String(decoding: $0, as: UTF8.self) } }.joined()
        XCTAssertFalse(databaseText.contains(fileName), "la base des messages de l'app ne garde pas le nom")
        XCTAssertFalse(databaseText.contains("image/jpeg"), "ni le type")
    }

    /// Un blob remplacé par le serveur : la bulle ne montre rien de lui.
    func test_unBlobAltereParLeServeur_nAtteintJamaisLaBulle() async throws {
        let dir = try temporaryDirectory()
        let gateway = LibsignalTestGateway()
        let blobs = InMemoryBlobGateway()
        let aliceDevice = try await installation(alice, on: gateway)
        let bobDevice = try await installation(bob, on: gateway)
        let aliceMedia = EndToEndAttachmentVault(paths: EndToEndMediaPaths(directory: dir.appendingPathComponent("alice")), fetcher: blobs)
        let bobMedia = EndToEndAttachmentVault(paths: EndToEndMediaPaths(directory: dir.appendingPathComponent("bob")), fetcher: blobs)
        let original = dir.appendingPathComponent("doc.pdf")
        try Data("%PDF-1.7 intègre".utf8).write(to: original)
        let pointers = try await EndToEndPieceSealer(uploader: blobs, vault: aliceMedia, temporaryDirectory: dir).seal([EndToEndPieceSource(
            localId: "local", fileURL: original, contentType: "application/pdf", fileName: "doc.pdf", kind: .file,
            width: nil, height: nil, durationMs: nil, thumbHash: nil, thumbnailJPEG: nil, transcript: nil
        )])
        blobs.tamper = { data in var forged = data; forged[24] ^= 0x01; return forged }
        let content = E2EEContent(text: nil, language: nil, replyTo: nil, conversationId: conversationId, clientMessageId: "cid_2", sentAt: Date(), attachments: pointers)
        let (alice, conversationId, serverId) = (alice, conversationId, serverId)
        try await aliceDevice.deliver(content, from: alice, to: bob) { sealed in
            gateway.relay(sealed, from: alice, conversationId: conversationId, messageId: serverId)
        }
        let (thread, persistence, _) = try await openThread(as: bob, with: alice, endToEnd: bobDevice, media: bobMedia)
        for envelope in gateway.pending(for: bob) { await bobDevice.receive(envelope, as: bob) }
        try await persistence.upsertFromAPIMessages([served(blobIds: pointers.flatMap(\.blobIds))], preferredLanguages: ["fr"])
        await eventually("la bulle rend la pièce décrite par le pointeur") { rendered(serverId, in: thread)?.attachments.first?.originalName == "doc.pdf" }
        try? await Task.sleep(nanoseconds: 500_000_000)

        let piece = try XCTUnwrap(rendered(serverId, in: thread)?.attachments.first)
        XCTAssertFalse(FileManager.default.fileExists(atPath: try XCTUnwrap(URL(string: piece.fileUrl)).path),
                       "un condensat faux ne laisse aucun clair à lire")
    }

    /// Audit B2 — un texte chiffré authentique d'Alice, auquel le SERVEUR ajoute
    /// une pièce sur la ligne servie : la bulle n'en montre aucune.
    func test_unePieceAjouteeParLeServeurAUnTexteChiffre_nApparaitPas() async throws {
        let dir = try temporaryDirectory()
        let gateway = LibsignalTestGateway()
        let aliceDevice = try await installation(alice, on: gateway)
        let bobDevice = try await installation(bob, on: gateway)
        let bobMedia = EndToEndAttachmentVault(paths: EndToEndMediaPaths(directory: dir.appendingPathComponent("bob")), fetcher: InMemoryBlobGateway())
        let content = E2EEContent(text: "bonjour", language: "fr", replyTo: nil, conversationId: conversationId, clientMessageId: "cid_3", sentAt: Date())
        let (alice, conversationId, serverId) = (alice, conversationId, serverId)
        try await aliceDevice.deliver(content, from: alice, to: bob) { sealed in
            gateway.relay(sealed, from: alice, conversationId: conversationId, messageId: serverId)
        }
        let (thread, persistence, _) = try await openThread(as: bob, with: alice, endToEnd: bobDevice, media: bobMedia)
        for envelope in gateway.pending(for: bob) { await bobDevice.receive(envelope, as: bob) }
        let forged: APIMessage = JSONStub.decode("""
        {"id":"\(serverId)","conversationId":"\(conversationId)","senderId":"\(alice)",
         "content":"\(E2EEWire.contentPlaceholder)","isEncrypted":true,"encryptionMode":"\(E2EEWire.mode)",
         "messageType":"image","messageSource":"user","createdAt":"2026-10-25T12:00:00.000Z",
         "attachments":[{"id":"6add0000000000000000beef","mimeType":"image/jpeg","fileUrl":"https://evil.example/fake.jpg","fileName":"fake.jpg","originalName":"fake.jpg","fileSize":10,"uploadedBy":"\(alice)","createdAt":"2026-10-25T12:00:00.000Z"}],
         "sender":{"id":"\(alice)","username":"u11","displayName":"U"}}
        """)

        try await persistence.upsertFromAPIMessages([forged], preferredLanguages: ["fr"])
        await eventually("le texte authentique s'affiche") { rendered(serverId, in: thread)?.content == "bonjour" }

        let shown = try XCTUnwrap(rendered(serverId, in: thread))
        XCTAssertTrue(shown.attachments.isEmpty, "aucune pièce que le serveur ajoute n'apparaît sous le message d'Alice")
        XCTAssertEqual(shown.messageType, .text)
    }
}
