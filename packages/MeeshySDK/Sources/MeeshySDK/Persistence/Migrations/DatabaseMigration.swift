import GRDB

protocol DatabaseMigration: Sendable {
    var identifier: String { get }
    func migrate(_ db: Database) throws
}

extension DatabaseMigrator {
    mutating func register(_ table: [any DatabaseMigration]) {
        for migration in table {
            registerMigration(migration.identifier) { db in
                try migration.migrate(db)
            }
        }
    }

    init(table: [any DatabaseMigration]) {
        self.init()
        register(table)
    }
}
