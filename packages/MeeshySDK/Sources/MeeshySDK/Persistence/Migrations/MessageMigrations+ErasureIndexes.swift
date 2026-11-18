import Foundation
import GRDB

/// **Les index que la loi d'effacement interroge** (#19437) : `MessageEnrichmentLaw.erase` retire les traductions d'un
/// message par `messageLocalId` OU `messageServerId`, et `followQuotes` retrouve les réponses d'un message par
/// `replyToId`. Sans index sur ces deux colonnes, chaque appel lisait toute la table : le balayage de migration
/// (`MessagesEnrichmentSweepMigration`), qui tourne sur le fil principal au lancement, devenait quadratique et pouvait
/// dépasser le délai de garde du système. La migration précède le balayage.
struct MessagesErasureIndexesMigration: DatabaseMigration {
    let identifier = "messages_erasure_lookup_indexes_v1"

    func migrate(_ db: Database) throws {
        try db.execute(sql: "CREATE INDEX IF NOT EXISTS idx_trans_msg_server ON message_translations(messageServerId)")
        try db.execute(sql: "CREATE INDEX IF NOT EXISTS idx_msg_reply_to ON messages(replyToId)")
    }
}
