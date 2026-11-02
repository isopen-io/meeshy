import Foundation
import GRDB

extension Database {
    /// Exécute `body` sous `secure_delete = ON`, puis rend à la connexion le
    /// mode qu'elle avait : la SQLite d'Apple démarre en mode rapide (`2`), qu'un
    /// `OFF` affaiblirait pour toute la session (#12999).
    func withSecureDelete<T>(_ body: () throws -> T) throws -> T {
        let previous = try Int.fetchOne(self, sql: "PRAGMA secure_delete") ?? 2
        try execute(sql: "PRAGMA secure_delete = ON")
        // Le pragma lit `FAST` pour le mode 2, un entier y vaudrait `ON`.
        let restored = [0: "OFF", 1: "ON"][previous] ?? "FAST"
        defer { try? execute(sql: "PRAGMA secure_delete = \(restored)") }
        return try body()
    }
}
