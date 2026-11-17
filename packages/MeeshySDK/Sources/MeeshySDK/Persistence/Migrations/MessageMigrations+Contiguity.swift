import Foundation
import GRDB

/// #18929 — le filigrane de CONTIGUÏTÉ de chaque conversation
/// (`ConversationContiguity`) : jusqu'où la base détient son fil sans trou.
///
/// Une conversation déjà détenue l'hérite de la frontière que le rattrapage
/// prenait jusqu'ici, son plus récent message SERVEUR (une ligne optimiste,
/// sans `serverId`, porte l'horloge de l'appareil). À partir de là, seule une
/// synchro contiguë le fait avancer.
struct ConversationContiguityMigration: DatabaseMigration {
    let identifier = "conversation_contiguity"

    func migrate(_ db: Database) throws {
        try db.create(table: ConversationContiguity.table) { t in
            t.column("conversationId", .text).primaryKey()
            t.column("contiguousUpTo", .datetime).notNull()
        }
        try db.execute(sql: """
            INSERT INTO \(ConversationContiguity.table) (conversationId, contiguousUpTo)
            SELECT conversationId, MAX(createdAt) FROM messages
            WHERE serverId IS NOT NULL
            GROUP BY conversationId
            """)
    }
}
