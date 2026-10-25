import Foundation
import GRDB

/// Les messages dont le contenu vient d'être effacé sur cet appareil (#13001) :
/// le clair qu'en tient le coffre E2EE doit partir avec eux. Le coffre vit dans
/// une autre base (`e2ee.sqlite`, scellée), que ce module ne connaît pas : la
/// table garde l'identifiant, jamais le texte, jusqu'à ce que l'app l'ait retiré
/// du coffre (`MessagePersistenceActor.acknowledgePlaintextErasures`). Elle
/// survit donc à un arrêt de l'app, et à une session fermée au moment de
/// l'effacement.
///
/// Les déclencheurs couvrent les effacements qui gardent la ligne — suppression
/// pour tous (`deletedAt`) et vue unique ouverte (`viewOnceOpenedAt`) — quel que
/// soit le chemin qui les écrit (socket, REST, NSE, geste local). Les
/// effacements qui retirent la ligne (éphémère échu, retrait pour moi)
/// l'inscrivent dans leur propre transaction ; les retraits qui ne sont pas des
/// effacements (rétention locale, doublon temp → serveur, accès révoqué) ne
/// l'inscrivent pas : le coffre est la seule copie de ce clair. Une suppression
/// annulée (échec réseau, `markUndeleted`) retire son inscription.
struct MessagesPlaintextErasuresMigration: DatabaseMigration {
    let identifier = "messages_e2ee_plaintext_erasures"

    func migrate(_ db: Database) throws {
        try db.create(table: MessagePlaintextErasures.table) { t in
            t.column("messageKey", .text).notNull().primaryKey(onConflict: .ignore)
            t.column("recordedAt", .datetime).notNull().defaults(sql: "(strftime('%Y-%m-%d %H:%M:%f','now'))")
        }
        try db.execute(sql: MessagePlaintextErasures.trigger(
            named: "e2ee_erasure_on_delete", column: "deletedAt"
        ))
        try db.execute(sql: MessagePlaintextErasures.trigger(
            named: "e2ee_erasure_on_view_once_opened", column: "viewOnceOpenedAt"
        ))
    }
}

enum MessagePlaintextErasures {
    static let table = "e2ee_plaintext_erasures"

    static func trigger(named name: String, column: String) -> String {
        """
        CREATE TRIGGER \(name) AFTER UPDATE OF \(column) ON messages
        WHEN old.\(column) IS NULL AND new.\(column) IS NOT NULL
        BEGIN
            INSERT OR IGNORE INTO \(table)(messageKey) VALUES (new.localId);
            INSERT OR IGNORE INTO \(table)(messageKey) SELECT new.serverId WHERE new.serverId IS NOT NULL;
        END
        """
    }

    /// Retire l'inscription des lignes dont l'effacement est annulé.
    static func cancel(rowsMatching filter: String, arguments: StatementArguments, in db: Database) throws {
        try db.execute(
            sql: """
                DELETE FROM \(table) WHERE messageKey IN (
                    SELECT localId FROM messages WHERE \(filter)
                    UNION SELECT serverId FROM messages WHERE serverId IS NOT NULL AND (\(filter))
                )
                """,
            arguments: arguments + arguments
        )
    }

    /// Inscrit les clés (identifiant local et serveur) des lignes qui vont être
    /// retirées, dans la transaction qui les retire.
    static func record(rowsMatching filter: String, arguments: StatementArguments, in db: Database) throws {
        try db.execute(
            sql: "INSERT OR IGNORE INTO \(table)(messageKey) SELECT localId FROM messages WHERE \(filter)",
            arguments: arguments
        )
        try db.execute(
            sql: "INSERT OR IGNORE INTO \(table)(messageKey) SELECT serverId FROM messages WHERE serverId IS NOT NULL AND (\(filter))",
            arguments: arguments
        )
    }
}
