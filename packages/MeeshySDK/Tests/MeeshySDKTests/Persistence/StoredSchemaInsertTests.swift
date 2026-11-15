import XCTest
import GRDB
@testable import MeeshySDK

/// Une base arrêtée à une migration ancienne se reproduit par l'IDENTIFIANT de
/// cette migration, jamais par sa position : chaque migration ajoutée en queue
/// de liste décalait un `dropLast(n)` et faisait jouer, avant l'insertion, la
/// migration même que le test voulait éprouver (#14369).
extension MessageDatabaseMigrations {
    static func migrate(_ writer: any DatabaseWriter, upTo identifier: String) throws {
        var migrator = DatabaseMigrator()
        registerAll(in: &migrator)
        try migrator.migrate(writer, upTo: identifier)
    }
}

struct ColumnUnknownToStoredSchema: Error, Equatable {
    let column: String
}

extension MessageRecord {
    /// Écrit la ligne comme l'écrivait la version de l'app qui a laissé ce
    /// schéma : seules les colonnes que la table porte. Une valeur non nulle
    /// pour une colonne que ce schéma ignore est refusée — l'ancienne version
    /// n'aurait pas pu l'écrire, et la taire fausserait la base reproduite.
    func insertAsOfStoredSchema(_ db: Database) throws {
        let stored = Set(try db.columns(in: Self.databaseTableName).map(\.name))
        let values = try databaseDictionary
        if let unknown = values.keys.sorted().first(where: { !stored.contains($0) && !(values[$0]?.isNull ?? true) }) {
            throw ColumnUnknownToStoredSchema(column: unknown)
        }
        let columns = values.keys.filter(stored.contains).sorted()
        let names = columns.map { "\"\($0)\"" }.joined(separator: ", ")
        let placeholders = Array(repeating: "?", count: columns.count).joined(separator: ", ")
        try db.execute(
            sql: "INSERT INTO \"\(Self.databaseTableName)\" (\(names)) VALUES (\(placeholders))",
            arguments: StatementArguments(columns.map { values[$0] ?? .null })
        )
    }
}

final class StoredSchemaInsertTests: XCTestCase {
    private let lastBeforeServedClientMessageId = "messages_e2ee_plaintext_erasures_authenticated_v1"

    func test_insertAsOfStoredSchema_onABaseBeforeAColumn_writesTheRowWithoutIt() throws {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.migrate(queue, upTo: lastBeforeServedClientMessageId)
        let record = MessageRecordFactory.make(localId: "m_era", content: "bonjour")

        try queue.write { db in try record.insertAsOfStoredSchema(db) }

        let content = try queue.read { db in try String.fetchOne(db, sql: "SELECT content FROM messages WHERE localId = 'm_era'") }
        XCTAssertEqual(content, "bonjour")
    }

    func test_insertAsOfStoredSchema_refusesAValueTheStoredSchemaCouldNotHold() throws {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.migrate(queue, upTo: lastBeforeServedClientMessageId)
        var record = MessageRecordFactory.make(localId: "m_future")
        record.servedClientMessageId = "cid_future"

        XCTAssertThrowsError(try queue.write { db in try record.insertAsOfStoredSchema(db) }) { error in
            XCTAssertEqual(error as? ColumnUnknownToStoredSchema, ColumnUnknownToStoredSchema(column: "servedClientMessageId"))
        }
    }
}
