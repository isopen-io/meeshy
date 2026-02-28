import Foundation
import GRDB
import os

// MARK: - AppDatabase
public final class AppDatabase {
    public static let shared = AppDatabase()
    
    public let databaseWriter: any DatabaseWriter
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "grdb")
    
    private init() {
        do {
            let fileManager = FileManager.default
            let appSupportDir = try fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            let directoryURL = appSupportDir.appendingPathComponent("Database", isDirectory: true)
            
            if !fileManager.fileExists(atPath: directoryURL.path) {
                try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
            }
            
            let databaseURL = directoryURL.appendingPathComponent("meeshy.sqlite")
            
            var configuration = Configuration()
            configuration.prepareDatabase { db in
                db.trace { _ in }
            }
            
            let pool = try DatabasePool(path: databaseURL.path, configuration: configuration)
            self.databaseWriter = pool
            
            try migrator.migrate(self.databaseWriter)
        } catch {
            fatalError("Failed to initialize GRDB: \(error)")
        }
    }
    
    private var migrator: DatabaseMigrator {
        var migrator = DatabaseMigrator()
        
        migrator.registerMigration("v1_create_tables") { db in
            try db.create(table: "conversations") { t in
                t.column("id", .text).primaryKey()
                t.column("name", .text).notNull()
                t.column("encodedData", .blob).notNull() // Temporary fallback column
                t.column("updatedAt", .datetime).notNull()
            }
            
            try db.create(table: "messages") { t in
                t.column("id", .text).primaryKey()
                t.column("conversationId", .text).notNull().references("conversations", onDelete: .cascade)
                t.column("createdAt", .datetime).notNull()
                t.column("encodedData", .blob).notNull() // Temporary fallback column
            }
            
            try db.create(index: "index_messages_on_conversationId_createdAt", on: "messages", columns: ["conversationId", "createdAt"])
        }
        
        return migrator
    }
}
