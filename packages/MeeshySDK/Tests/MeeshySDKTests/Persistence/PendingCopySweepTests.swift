import XCTest
import GRDB
@testable import MeeshySDK

/// Une copie d'envoi que plus rien ne désigne quitte le disque au démarrage à froid (#16129),
/// et ce qu'elle épargne compte autant : l'outbox et la bulle de CHAQUE compte de l'appareil,
/// puisque `pending-media/` est partagé et que chaque compte a sa base.
final class PendingCopySweepTests: XCTestCase {

    private struct Stage {
        let directory: URL
        let media: URL
        let audio: URL
        let active: DatabaseQueue
        let activePath: String
        let now: Date

        var roots: [URL] { [media, audio] }

        func copy(in root: URL, named name: String) throws -> URL {
            let folder = root.appendingPathComponent(name, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try Data("octets".utf8).write(to: folder.appendingPathComponent("0.jpeg"))
            return folder
        }

        func sweep(storeDirectory: URL? = nil) async -> Int {
            await PendingCopySweep.sweepAtColdStart(
                activeBase: active, activePath: activePath,
                storeDirectory: storeDirectory ?? directory, roots: roots, now: now
            )
        }
    }

    private func makeStage() throws -> Stage {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("pending-sweep-\(UUID().uuidString)", isDirectory: true)
        let media = directory.appendingPathComponent("pending-media", isDirectory: true)
        let audio = directory.appendingPathComponent("pending-audio", isDirectory: true)
        try FileManager.default.createDirectory(at: media, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: audio, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        let (active, path) = try makeBase(user: "active", in: directory)
        return Stage(
            directory: directory, media: media, audio: audio, active: active, activePath: path,
            now: Date().addingTimeInterval(PendingCopySweep.minimumAge + 60)
        )
    }

    private func makeBase(user: String, in directory: URL) throws -> (DatabaseQueue, String) {
        let key = try XCTUnwrap(MessageStoreAccountKey(userId: user, serverOrigin: "https://staging.meeshy.me"))
        let path = directory.appendingPathComponent(key.databaseFileName).path
        let base = try DatabaseQueue(path: path)
        try MessageDatabaseMigrations.runAll(on: base)
        return (base, path)
    }

    /// Une base de compte réelle est un pool WAL : c'est elle que le balayage doit savoir relire.
    private func makeAccountPool(user: String, in directory: URL) throws -> DatabasePool {
        let key = try XCTUnwrap(MessageStoreAccountKey(userId: user, serverOrigin: "https://staging.meeshy.me"))
        let pool = try DatabasePool(path: directory.appendingPathComponent(key.databaseFileName).path)
        try MessageDatabaseMigrations.runAll(on: pool)
        return pool
    }

    private func insertRow(cmid: String, payload: Data, in base: any DatabaseWriter, id: String = UUID().uuidString) throws {
        let now = Date()
        try base.write { db in
            try OutboxRecord(
                id: id, kind: .sendMessage, conversationId: "conv",
                clientMessageId: cmid, payload: payload, status: .pending, attempts: 0,
                lastError: nil, createdAt: now, updatedAt: now, nextAttemptAt: now
            ).insert(db)
        }
    }

    private func insertBubble(attachmentsJson: Data, in base: any DatabaseWriter) throws {
        let now = Date()
        try base.write { db in
            try db.execute(
                sql: """
                    INSERT INTO messages (localId, conversationId, senderId, state, createdAt, updatedAt, attachmentsJson)
                    VALUES (?, 'conv', 'me', 'sent', ?, ?, ?)
                    """,
                arguments: [UUID().uuidString, now, now, attachmentsJson]
            )
        }
    }

    private func exists(_ url: URL) -> Bool {
        FileManager.default.fileExists(atPath: url.path)
    }

    func test_sweep_copyNoRowNoBubbleDesignates_leavesTheDisk() async throws {
        let stage = try makeStage()
        let media = try stage.copy(in: stage.media, named: ClientMessageId.generate())
        let audio = try stage.copy(in: stage.audio, named: ClientMessageId.generate())

        let removed = await stage.sweep()

        XCTAssertEqual(removed, 2)
        XCTAssertFalse(exists(media))
        XCTAssertFalse(exists(audio))
    }

    func test_sweep_legacySingleAudioFileNoRow_leavesTheDisk() async throws {
        let stage = try makeStage()
        let file = stage.audio.appendingPathComponent("\(ClientMessageId.generate()).m4a")
        try Data("octets".utf8).write(to: file)

        _ = await stage.sweep()

        XCTAssertFalse(exists(file))
    }

    func test_sweep_outboxRowDesignatesTheCopy_keepsIt() async throws {
        let stage = try makeStage()
        let cmid = ClientMessageId.generate()
        let folder = try stage.copy(in: stage.media, named: cmid)
        try insertRow(cmid: "autre", payload: Data(#"{"localMediaPaths":["pending-media\/\#(cmid)\/0.jpeg"]}"#.utf8), in: stage.active)

        let removed = await stage.sweep()

        XCTAssertEqual(removed, 0)
        XCTAssertTrue(exists(folder))
    }

    func test_sweep_outboxRowBearsTheCmid_keepsItEvenWithoutPathInPayload() async throws {
        let stage = try makeStage()
        let cmid = ClientMessageId.generate()
        let folder = try stage.copy(in: stage.audio, named: cmid)
        try insertRow(cmid: cmid, payload: Data("{}".utf8), in: stage.active)

        _ = await stage.sweep()

        XCTAssertTrue(exists(folder))
    }

    /// `JSONEncoder` échappe `/` : le chemin entier ne se retrouve pas tel quel dans la colonne.
    func test_sweep_pendingBubbleDesignatesTheCopy_keepsIt() async throws {
        let stage = try makeStage()
        let cmid = ClientMessageId.generate()
        let folder = try stage.copy(in: stage.media, named: cmid)
        let json = Data(#"[{"fileUrl":"file:\/\/\/Documents\/pending-media\/\#(cmid)\/0.jpeg"}]"#.utf8)
        try insertBubble(attachmentsJson: json, in: stage.active)

        let removed = await stage.sweep()

        XCTAssertEqual(removed, 0)
        XCTAssertTrue(exists(folder))
    }

    func test_sweep_bubbleOnServerUrlOnly_doesNotProtectTheCopy() async throws {
        let stage = try makeStage()
        let folder = try stage.copy(in: stage.media, named: ClientMessageId.generate())
        try insertBubble(attachmentsJson: Data(#"[{"fileUrl":"https://gate.meeshy.me/a.jpg"}]"#.utf8), in: stage.active)

        _ = await stage.sweep()

        XCTAssertFalse(exists(folder))
    }

    /// Une mise en file peut être en train d'y copier ses fichiers, sa ligne pas encore écrite.
    func test_sweep_youngCopy_isLeftAlone() async throws {
        let stage = try makeStage()
        let folder = try stage.copy(in: stage.media, named: ClientMessageId.generate())

        let removed = await PendingCopySweep.sweepAtColdStart(
            activeBase: stage.active, activePath: stage.activePath,
            storeDirectory: stage.directory, roots: stage.roots, now: Date()
        )

        XCTAssertEqual(removed, 0)
        XCTAssertTrue(exists(folder))
    }

    /// Les pièces de commentaire ont leur balayage, jugé contre la base de leur auteur.
    func test_sweep_commentFolder_isNeverJudgedHere() async throws {
        let stage = try makeStage()
        let folder = try stage.copy(in: stage.media, named: "comments-abc123")

        _ = await stage.sweep()

        XCTAssertTrue(exists(folder))
    }

    /// `pending-media/` est partagé : la ligne d'un autre compte de l'appareil vit dans SA base.
    func test_sweep_rowOfAnotherAccountOnTheDevice_keepsItsCopy() async throws {
        let stage = try makeStage()
        let cmid = ClientMessageId.generate()
        let folder = try stage.copy(in: stage.media, named: cmid)
        let other = try makeAccountPool(user: "other", in: stage.directory)
        try insertRow(cmid: cmid, payload: Data("{}".utf8), in: other)
        try other.close()

        let removed = await stage.sweep()

        XCTAssertEqual(removed, 0)
        XCTAssertTrue(exists(folder))
    }

    func test_sweep_bubbleOfAnotherAccountOnTheDevice_keepsItsCopy() async throws {
        let stage = try makeStage()
        let cmid = ClientMessageId.generate()
        let folder = try stage.copy(in: stage.media, named: cmid)
        let other = try makeAccountPool(user: "other", in: stage.directory)
        try insertBubble(attachmentsJson: Data(#"[{"fileUrl":"pending-media\/\#(cmid)\/0.jpeg"}]"#.utf8), in: other)
        try other.close()

        _ = await stage.sweep()

        XCTAssertTrue(exists(folder))
    }

    /// Le rouge du contraire : les témoins « garde » passeraient aussi si une base WAL voisine ne
    /// s'ouvrait jamais. Une voisine lisible et muette laisse le balayage effacer.
    func test_sweep_readableNeighbourDesignatesNothing_stillRemovesTheOrphan() async throws {
        let stage = try makeStage()
        let folder = try stage.copy(in: stage.media, named: ClientMessageId.generate())
        let other = try makeAccountPool(user: "other", in: stage.directory)
        try insertRow(cmid: ClientMessageId.generate(), payload: Data("{}".utf8), in: other)
        try other.close()

        let removed = await stage.sweep()

        XCTAssertEqual(removed, 1)
        XCTAssertFalse(exists(folder))
    }

    /// Si une base ne se lit pas, on ne sait pas ce qu'elle désigne : on n'efface RIEN.
    /// La colonne est nullable au schéma : une ligne ancienne ne fait pas tomber le démarrage,
    /// et sa charge désigne encore sa copie.
    func test_sweep_rowWithoutClientMessageId_stillJudgedByItsPayload() async throws {
        let stage = try makeStage()
        let cmid = ClientMessageId.generate()
        let kept = try stage.copy(in: stage.media, named: cmid)
        let orphan = try stage.copy(in: stage.media, named: ClientMessageId.generate())
        let now = Date()
        try await stage.active.write { db in
            try db.execute(
                sql: """
                    INSERT INTO outbox (id, kind, conversationId, payload, status, createdAt, updatedAt, nextAttemptAt)
                    VALUES ('ofq_ancien', 'sendMessage', 'conv', ?, 'pending', ?, ?, ?)
                    """,
                arguments: [Data("pending-media/\(cmid)/0.mp4".utf8), now, now, now]
            )
        }

        let removed = await stage.sweep()

        XCTAssertEqual(removed, 1)
        XCTAssertTrue(exists(kept))
        XCTAssertFalse(exists(orphan))
    }

    func test_sweep_anotherAccountBaseUnreadable_removesNothing() async throws {
        let stage = try makeStage()
        let folder = try stage.copy(in: stage.media, named: ClientMessageId.generate())
        let key = try XCTUnwrap(MessageStoreAccountKey(userId: "other", serverOrigin: "https://staging.meeshy.me"))
        try Data("pas une base".utf8).write(to: stage.directory.appendingPathComponent(key.databaseFileName))

        let removed = await stage.sweep()

        XCTAssertEqual(removed, 0)
        XCTAssertTrue(exists(folder))
    }

    /// Une base de secours ne prouve rien : les autres comptes ne sont pas à côté d'elle.
    func test_sweep_activeBaseOutsideTheStoreDirectory_removesNothing() async throws {
        let stage = try makeStage()
        let folder = try stage.copy(in: stage.media, named: ClientMessageId.generate())
        let elsewhere = stage.directory.appendingPathComponent("ailleurs", isDirectory: true)
        try FileManager.default.createDirectory(at: elsewhere, withIntermediateDirectories: true)

        let removed = await stage.sweep(storeDirectory: elsewhere)

        XCTAssertEqual(removed, 0)
        XCTAssertTrue(exists(folder))
    }
}
