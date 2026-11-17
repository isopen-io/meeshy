import Foundation
import GRDB

/// #18929 — le filigrane de CONTIGUÏTÉ de chaque conversation
/// (`ConversationContiguity`) : jusqu'où la base détient son fil sans trou.
///
/// Une conversation déjà détenue l'hérite de la frontière que le rattrapage
/// prenait jusqu'ici, son plus récent message SERVEUR (une ligne optimiste,
/// sans `serverId`, porte l'horloge de l'appareil). À partir de là, seule une
/// synchro contiguë le fait avancer.
///
/// Cet amorçage FIGE les trous déjà présents : si le plus récent message
/// serveur était entré seul — déposé par la NSE au-delà du fil détenu —, le
/// filigrane atteste un fil sans trou jusqu'à lui, et le rattrapage repart de
/// là sans jamais combler l'écart d'avant. La migration ne peut pas savoir
/// mieux : la base ne garde pas la provenance d'une ligne. Une conversation
/// SANS filigrane — née après la migration — repart, elle, de son plus ancien
/// message serveur détenu (`ConversationContiguity.catchUpCursor`).
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
