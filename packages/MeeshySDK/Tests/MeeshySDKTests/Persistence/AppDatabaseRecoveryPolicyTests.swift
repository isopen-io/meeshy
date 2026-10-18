import GRDB
import XCTest
@testable import MeeshySDK

/// Cycle 4 — `openOrRecover` effaçait la base sur N'IMPORTE QUELLE erreur
/// d'ouverture ou de migration : un disque plein, un fichier verrouillé ou
/// protégé faisaient perdre toute la base locale. Seuls la corruption et
/// l'échec réel d'une migration la recréent.
final class AppDatabaseRecoveryPolicyTests: XCTestCase {

    private var url: URL!

    override func setUp() {
        super.setUp()
        url = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy_recovery_\(UUID().uuidString).sqlite")
    }

    override func tearDown() {
        try? FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: url.path)
        for suffixe in ["", "-wal", "-shm"] {
            try? FileManager.default.removeItem(at: URL(fileURLWithPath: url.path + suffixe))
        }
        url = nil
        super.tearDown()
    }

    func test_anUnreadableStore_isLeftIntact_andTheSessionFallsBackToMemory() throws {
        let (writer, _) = AppDatabase.openOrRecover(at: url)
        try writer.write { db in
            try db.execute(sql: "CREATE TABLE sonde_cycle4 (id INTEGER PRIMARY KEY)")
            try db.execute(sql: "INSERT INTO sonde_cycle4 (id) VALUES (77)")
        }
        try (writer as? DatabasePool)?.close()
        for suffixe in ["-wal", "-shm"] {
            try? FileManager.default.removeItem(at: URL(fileURLWithPath: url.path + suffixe))
        }
        try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: url.path)

        let (_, ephemeral) = AppDatabase.openOrRecover(at: url)

        XCTAssertTrue(ephemeral, "un store illisible se replie en mémoire")
        try FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: url.path)
        let reopened = try DatabaseQueue(path: url.path)
        let kept = try reopened.read { db in try Int.fetchOne(db, sql: "SELECT id FROM sonde_cycle4") }
        XCTAssertEqual(kept, 77, "la base de l'utilisateur n'est pas effacée pour un fichier momentanément illisible")
    }

    func test_aCorruptStore_isRecreated() throws {
        try Data(repeating: 0x5A, count: 8192).write(to: url)

        let (writer, ephemeral) = AppDatabase.openOrRecover(at: url)

        XCTAssertFalse(ephemeral, "un store corrompu est recréé sur disque")
        XCTAssertNoThrow(try writer.read { db in try db.tableExists("grdb_migrations") })
    }

    func test_policy_onlyCorruptionOrAFailedMigration_warrantsRecreation() {
        func error(_ code: ResultCode) -> DatabaseError { DatabaseError(resultCode: code) }
        struct MigrationBug: Error {}

        XCTAssertTrue(AppDatabase.warrantsRecreation(error(.SQLITE_CORRUPT), phase: .open))
        XCTAssertTrue(AppDatabase.warrantsRecreation(error(.SQLITE_NOTADB), phase: .migrate))
        XCTAssertTrue(AppDatabase.warrantsRecreation(error(.SQLITE_ERROR), phase: .migrate))
        XCTAssertTrue(AppDatabase.warrantsRecreation(MigrationBug(), phase: .migrate))

        XCTAssertFalse(AppDatabase.warrantsRecreation(error(.SQLITE_FULL), phase: .migrate), "disque plein")
        XCTAssertFalse(AppDatabase.warrantsRecreation(error(.SQLITE_BUSY), phase: .migrate))
        XCTAssertFalse(AppDatabase.warrantsRecreation(error(.SQLITE_LOCKED), phase: .migrate))
        XCTAssertFalse(AppDatabase.warrantsRecreation(error(.SQLITE_CANTOPEN), phase: .open),
                       "fichier protégé avant le premier déverrouillage")
        XCTAssertFalse(AppDatabase.warrantsRecreation(error(.SQLITE_IOERR), phase: .migrate))
        XCTAssertFalse(AppDatabase.warrantsRecreation(error(.SQLITE_ERROR), phase: .open))
        XCTAssertFalse(AppDatabase.warrantsRecreation(MigrationBug(), phase: .open))
    }
}
