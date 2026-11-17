import CryptoKit
import Foundation
import GRDB
import XCTest
@testable import MeeshyE2EE

/// **Le coffre libsignal vit dans un dossier exclu de la sauvegarde** (IOS-03,
/// #18945). Sa clé de scellement et l'identité sont dans le trousseau en
/// `…ThisDeviceOnly` : elles ne suivent ni une sauvegarde iCloud ou Finder, ni
/// un Démarrage rapide. Le coffre ne doit pas les suivre non plus.
final class E2EEVaultLocationTests: XCTestCase {

    private func container() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("E2EEVaultLocationTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    private func companion(_ database: URL, _ suffix: String) -> URL {
        URL(fileURLWithPath: database.path + suffix)
    }

    func test_theVaultFolder_isExcludedFromBackup() throws {
        let database = try E2EEVaultLocation.preparedDatabase(in: try container())
        let folder = database.deletingLastPathComponent()

        let values = try folder.resourceValues(forKeys: [.isExcludedFromBackupKey])

        XCTAssertEqual(values.isExcludedFromBackup, true, "la valeur posée sur le DOSSIER couvre -wal et -shm, que SQLite recrée")
        XCTAssertEqual(folder.lastPathComponent, E2EEVaultLocation.folderName)
        XCTAssertEqual(database.lastPathComponent, "e2ee.sqlite")
    }

    func test_aDatabaseLeftAtTheContainerRoot_movesWithItsJournal() throws {
        let container = try container()
        let legacy = container.appendingPathComponent("e2ee.sqlite")
        for suffix in ["", "-wal", "-shm"] {
            try Data("contenu\(suffix)".utf8).write(to: companion(legacy, suffix))
        }

        let database = try E2EEVaultLocation.preparedDatabase(in: container)

        for suffix in ["", "-wal", "-shm"] {
            XCTAssertEqual(try Data(contentsOf: companion(database, suffix)), Data("contenu\(suffix)".utf8))
            XCTAssertFalse(FileManager.default.fileExists(atPath: companion(legacy, suffix).path))
        }
    }

    /// La base se déplace EN DERNIER : un arrêt après le journal se rejoue.
    func test_aMoveInterruptedAfterTheJournal_resumes() throws {
        let container = try container()
        let legacy = container.appendingPathComponent("e2ee.sqlite")
        let folder = container.appendingPathComponent(E2EEVaultLocation.folderName, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try Data("journal".utf8).write(to: companion(folder.appendingPathComponent("e2ee.sqlite"), "-wal"))
        try Data("base".utf8).write(to: legacy)

        let database = try E2EEVaultLocation.preparedDatabase(in: container)

        XCTAssertEqual(try Data(contentsOf: database), Data("base".utf8))
        XCTAssertEqual(try Data(contentsOf: companion(database, "-wal")), Data("journal".utf8))
    }

    func test_aMovedDatabase_isNeverOverwrittenByALeftover() throws {
        let container = try container()
        let current = try E2EEVaultLocation.preparedDatabase(in: container)
        try Data("courante".utf8).write(to: current)
        try Data("restée".utf8).write(to: container.appendingPathComponent("e2ee.sqlite"))

        let again = try E2EEVaultLocation.preparedDatabase(in: container)

        XCTAssertEqual(try Data(contentsOf: again), Data("courante".utf8))
    }

    /// Une vraie base en WAL, fermée avec des pages encore au journal, se relit
    /// intacte à sa nouvelle place.
    func test_aWalDatabase_isReadableAtItsNewPlace() throws {
        let container = try container()
        let key = SymmetricKey(size: .bits256)
        let legacyPool = try DatabasePool(path: container.appendingPathComponent("e2ee.sqlite").path)
        try E2EEGRDBRecordVault(writer: legacyPool, sealingKey: key)
            .write { try $0.save(Data("historique".utf8), as: .plaintext, "m1") }
        try legacyPool.close()

        let database = try E2EEVaultLocation.preparedDatabase(in: container)
        let pool = try DatabasePool(path: database.path)
        defer { try? pool.close() }

        XCTAssertEqual(try E2EEGRDBRecordVault(writer: pool, sealingKey: key).read { try $0.load(.plaintext, "m1") },
                       Data("historique".utf8))
    }
}
