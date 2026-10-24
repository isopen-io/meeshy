import CryptoKit
import Foundation
import GRDB
import MeeshySDK
import LibSignalClient

/// Ce que range un store libsignal : chaque enregistrement sérialisé par
/// libsignal, sous une sorte et une clé.
public enum E2EERecordKind: String, CaseIterable, Sendable {
    case session
    case remoteIdentity
    case preKey
    case signedPreKey
    case kyberPreKey
    case kyberLastResortMarker
    case kyberBaseKeySeen
    case senderKey
    case keyIdCounter
    /// Le CLAIR d'un message déchiffré sur cet appareil, par identifiant de
    /// message (spec § 4.4) : c'est lui qui rend l'historique lisible une fois
    /// l'enveloppe effacée du serveur. Scellé comme toute ligne.
    case plaintext
    /// Mes autres appareils approuvés localement (spec § 3.5), par numéro.
    case approvedOwnDevice
    /// L'enrôlement de cette installation auprès de l'annuaire (compte, numéro).
    case localEnrollment
}

/// Une transaction sur les enregistrements : c'est elle que libsignal reçoit
/// comme `StoreContext`, pour que le déchiffrement et l'écriture du nouvel état
/// du ratchet soient UNE écriture (spec § 4.4).
public protocol E2EERecordTransaction: StoreContext {
    func load(_ kind: E2EERecordKind, _ key: String) throws -> Data?
    func save(_ data: Data, as kind: E2EERecordKind, _ key: String) throws
    func remove(_ kind: E2EERecordKind, _ key: String) throws
    func keys(of kind: E2EERecordKind) throws -> [String]
    /// Efface TOUT : un changement de compte ou une identité révoquée ne laisse
    /// ni session, ni pré-clé, ni clair d'un autre régime.
    func removeAll() throws
}

public protocol E2EERecordVaultProviding: Sendable {
    func write<T>(_ body: (any E2EERecordTransaction) throws -> T) throws -> T
    func read<T>(_ body: (any E2EERecordTransaction) throws -> T) throws -> T
}

public enum E2EERecordVaultError: Error, Equatable {
    case unsealable(kind: String)
    case foreignContext
}

/// Le scellement d'UNE ligne : AES-256-GCM, la sorte et la clé en données
/// associées. Une ligne recopiée sous une autre clé (un attaquant qui écrit la
/// base sans la clé du trousseau) ne s'ouvre pas.
struct E2EERowSealer: Sendable {
    let key: SymmetricKey

    func seal(_ plaintext: Data, kind: E2EERecordKind, key rowKey: String) throws -> Data {
        guard let combined = try AES.GCM.seal(plaintext, using: key, authenticating: Self.aad(kind, rowKey)).combined else {
            throw E2EERecordVaultError.unsealable(kind: kind.rawValue)
        }
        return combined
    }

    func open(_ sealed: Data, kind: E2EERecordKind, key rowKey: String) throws -> Data {
        do {
            return try AES.GCM.open(AES.GCM.SealedBox(combined: sealed), using: key, authenticating: Self.aad(kind, rowKey))
        } catch {
            throw E2EERecordVaultError.unsealable(kind: kind.rawValue)
        }
    }

    private static func aad(_ kind: E2EERecordKind, _ key: String) -> Data {
        Data("meeshy-e2ee-row:v1:\(kind.rawValue):\(key)".utf8)
    }
}

/// Les enregistrements libsignal dans `e2ee.sqlite` (GRDB, WAL), chaque ligne
/// scellée. La base vit dans le conteneur du groupe d'apps pour que la NSE la
/// partage ; l'exclusion entre processus est le verrou de fichier
/// (`E2EEProcessLock`), que l'appelant tient autour de chaque transaction qui
/// fait avancer un ratchet.
public final class E2EEGRDBRecordVault: E2EERecordVaultProviding {
    private let writer: any DatabaseWriter
    private let sealer: E2EERowSealer

    public init(writer: any DatabaseWriter, sealingKey: SymmetricKey) throws {
        self.writer = writer
        self.sealer = E2EERowSealer(key: sealingKey)
        try Self.migrator.migrate(writer)
    }

    /// La base partagée de l'app et de la NSE : `e2ee.sqlite` du groupe d'apps.
    /// La clé de scellement se crée sous le verrou inter-processus : l'app et la
    /// NSE qui démarrent ensemble n'en tirent jamais deux.
    public static func shared(
        appGroup: String = "group.me.meeshy.apps",
        secrets: any E2EESecretStoreProviding,
        lock: any E2EEProcessLockProviding
    ) throws -> E2EEGRDBRecordVault {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
            throw CocoaError(.fileNoSuchFile)
        }
        var configuration = Configuration()
        configuration.busyMode = .timeout(10)
        // #3707 — le pool s'ouvre désormais à chaque session : sans armement, il
        // prend des verrous SQLite pendant la suspension (0xDEAD10CC).
        DatabaseSuspension.arm(&configuration)
        let pool = try DatabasePool(path: container.appendingPathComponent("e2ee.sqlite").path, configuration: configuration)
        let sealingKey = try lock.withLock { try E2EESealingKey.loadOrCreate(in: secrets) }
        return try E2EEGRDBRecordVault(writer: pool, sealingKey: sealingKey)
    }

    private static var migrator: DatabaseMigrator {
        var migrator = DatabaseMigrator()
        migrator.registerMigration("e2ee-records-v1") { db in
            try db.create(table: "record") { table in
                table.column("kind", .text).notNull()
                table.column("key", .text).notNull()
                table.column("sealed", .blob).notNull()
                table.primaryKey(["kind", "key"])
            }
        }
        return migrator
    }

    public func write<T>(_ body: (any E2EERecordTransaction) throws -> T) throws -> T {
        try writer.write { db in try body(GRDBRecordTransaction(db: db, sealer: sealer)) }
    }

    public func read<T>(_ body: (any E2EERecordTransaction) throws -> T) throws -> T {
        try writer.read { db in try body(GRDBRecordTransaction(db: db, sealer: sealer)) }
    }
}

private struct GRDBRecordTransaction: E2EERecordTransaction {
    let db: Database
    let sealer: E2EERowSealer

    func load(_ kind: E2EERecordKind, _ key: String) throws -> Data? {
        let sealed = try Data.fetchOne(db, sql: "SELECT sealed FROM record WHERE kind = ? AND key = ?", arguments: [kind.rawValue, key])
        return try sealed.map { try sealer.open($0, kind: kind, key: key) }
    }

    func save(_ data: Data, as kind: E2EERecordKind, _ key: String) throws {
        try db.execute(
            sql: "INSERT INTO record (kind, key, sealed) VALUES (?, ?, ?) ON CONFLICT(kind, key) DO UPDATE SET sealed = excluded.sealed",
            arguments: [kind.rawValue, key, try sealer.seal(data, kind: kind, key: key)]
        )
    }

    func remove(_ kind: E2EERecordKind, _ key: String) throws {
        try db.execute(sql: "DELETE FROM record WHERE kind = ? AND key = ?", arguments: [kind.rawValue, key])
    }

    func keys(of kind: E2EERecordKind) throws -> [String] {
        try String.fetchAll(db, sql: "SELECT key FROM record WHERE kind = ? ORDER BY key", arguments: [kind.rawValue])
    }

    func removeAll() throws {
        try db.execute(sql: "DELETE FROM record")
    }
}
