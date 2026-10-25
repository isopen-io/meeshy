import Foundation
import GRDB

/// Les messages dont le contenu vient d'être effacé sur cet appareil (#13001) :
/// le clair qu'en tient le coffre E2EE doit partir avec eux. Le coffre vit dans
/// une autre base (`e2ee.sqlite`, scellée), que ce module ne connaît pas : la
/// table garde l'identifiant, jamais le texte, jusqu'à ce que l'app l'ait retiré
/// du coffre (`MessagePlaintextErasureQueue.acknowledge`). Elle
/// survit donc à un arrêt de l'app, et à une session fermée au moment de
/// l'effacement.
///
/// Les déclencheurs couvrent les effacements qui gardent la ligne — suppression
/// pour tous (`deletedAt`) et vue unique ouverte (`viewOnceOpenedAt`) — quel que
/// soit le chemin qui les écrit (socket, REST, NSE, geste local), à la mise à
/// jour comme à l'insertion d'une ligne qui arrive déjà effacée (synchro
/// tardive, autre appareil). Un effacement nommé sans ligne locale s'inscrit
/// aussi : le coffre peut tenir le clair d'un message que la base n'a pas. Les
/// effacements qui retirent la ligne (éphémère échu, retrait pour moi)
/// l'inscrivent dans leur propre transaction ; les retraits qui ne sont pas des
/// effacements (rétention locale, doublon temp → serveur, accès révoqué) ne
/// l'inscrivent pas : le coffre est la seule copie de ce clair.
///
/// Chaque inscription porte sa CAUSE : une suppression annulée
/// (`markUndeleted`, échec réseau) ne retire que celle de la suppression, et
/// jamais celle d'une vue unique ouverte ni d'un éphémère échu.
///
/// Une suppression lancée sur cet appareil s'inscrit NON CONFIRMÉE
/// (`confirmed = 0`) : elle peut encore être refusée par le serveur, minutes ou
/// heures plus tard (file hors ligne), et le coffre est la seule copie de son
/// clair. Elle n'est confirmée que par la réponse du serveur, son écho
/// `message:deleted` ou une page REST qui la porte. Seules les inscriptions
/// confirmées vident le coffre.
///
/// À la migration, les pierres tombales et les vues uniques déjà ouvertes en
/// base s'inscrivent : leurs clairs, effacés avant ce lot, quittent le coffre.
/// Le même identifiant, sans `_v2`, a porté un schéma provisoire sur une
/// branche jamais fusionnée : ses objets sont retirés avant d'être recréés.
struct MessagesPlaintextErasuresMigration: DatabaseMigration {
    let identifier = "messages_e2ee_plaintext_erasures_v2"

    func migrate(_ db: Database) throws {
        for trigger in ["e2ee_erasure_on_delete", "e2ee_erasure_on_view_once_opened"] {
            try db.execute(sql: "DROP TRIGGER IF EXISTS \(trigger)")
        }
        try db.execute(sql: "DROP TABLE IF EXISTS \(MessagePlaintextErasures.table)")
        try db.create(table: MessagePlaintextErasures.table) { t in
            t.column("messageKey", .text).notNull()
            t.column("cause", .text).notNull()
            t.column("confirmed", .boolean).notNull().defaults(to: true)
            t.column("recordedAt", .datetime).notNull().defaults(sql: "(strftime('%Y-%m-%d %H:%M:%f','now'))")
            t.column("acknowledgedAt", .datetime)
            t.primaryKey(["messageKey", "cause"], onConflict: .ignore)
        }
        for cause in [MessagePlaintextErasures.Cause.deleted, .viewOnceOpened] {
            try db.execute(sql: MessagePlaintextErasures.updateTrigger(for: cause))
            try db.execute(sql: MessagePlaintextErasures.insertTrigger(for: cause))
            try MessagePlaintextErasures.record(
                rowsMatching: "\(cause.column ?? "") IS NOT NULL", arguments: [], cause: cause, in: db
            )
        }
        try EndToEndContentSeal.install(in: db)
    }
}

/// **La garde structurelle de #12999** : une ligne déclarée chiffrée de bout en
/// bout ne garde jamais de texte, quel que soit l'écrivain — un `MessageRecord`
/// (déjà scellé par son encodage), du SQL brut (`updateServerAckedFields`,
/// `markEdited`, avis d'appel) ou un écrivain futur. Le déclencheur réécrit le
/// littéral dans l'instruction même qui posait le texte.
enum EndToEndContentSeal {
    static let placeholder = E2EEWire.contentPlaceholder

    static func install(in db: Database) throws {
        let sealed = """
            new.isEncrypted = 1 AND new.encryptionMode = '\(E2EEWire.mode)'
            AND new.content IS NOT NULL AND new.content NOT IN ('', '\(placeholder)')
            """
        try db.execute(sql: """
            CREATE TRIGGER e2ee_content_sealed_on_insert AFTER INSERT ON messages WHEN \(sealed)
            BEGIN UPDATE messages SET content = '\(placeholder)' WHERE rowid = new.rowid; END
            """)
        try db.execute(sql: """
            CREATE TRIGGER e2ee_content_sealed_on_update AFTER UPDATE OF content, isEncrypted, encryptionMode ON messages
            WHEN \(sealed)
            BEGIN UPDATE messages SET content = '\(placeholder)' WHERE rowid = new.rowid; END
            """)
    }
}

enum MessagePlaintextErasures {
    static let table = "e2ee_plaintext_erasures"

    enum Cause: String {
        case deleted
        case viewOnceOpened
        case expired
        case removedForMe

        /// La colonne qui déclare cet effacement sur une ligne gardée.
        var column: String? {
            switch self {
            case .deleted: "deletedAt"
            case .viewOnceOpened: "viewOnceOpenedAt"
            case .expired, .removedForMe: nil
            }
        }
    }

    static func updateTrigger(for cause: Cause) -> String {
        let column = cause.column ?? ""
        return """
        CREATE TRIGGER e2ee_erasure_on_update_\(cause.rawValue) AFTER UPDATE OF \(column) ON messages
        WHEN old.\(column) IS NULL AND new.\(column) IS NOT NULL AND (new.isEncrypted = 1 OR old.isEncrypted = 1)
        BEGIN
        \(insertions(of: cause))
        END
        """
    }

    static func insertTrigger(for cause: Cause) -> String {
        let column = cause.column ?? ""
        return """
        CREATE TRIGGER e2ee_erasure_on_insert_\(cause.rawValue) AFTER INSERT ON messages
        WHEN new.\(column) IS NOT NULL AND new.isEncrypted = 1
        BEGIN
        \(insertions(of: cause))
        END
        """
    }

    private static func insertions(of cause: Cause) -> String {
        """
            INSERT OR IGNORE INTO \(table)(messageKey, cause) VALUES (new.localId, '\(cause.rawValue)');
            INSERT OR IGNORE INTO \(table)(messageKey, cause) SELECT new.serverId, '\(cause.rawValue)' WHERE new.serverId IS NOT NULL;
        """
    }

    /// Inscrit un effacement nommé par son identifiant, qu'une ligne locale le
    /// porte ou non.
    static func record(_ messageKey: String, cause: Cause, in db: Database) throws {
        try db.execute(
            sql: "INSERT OR IGNORE INTO \(table)(messageKey, cause) VALUES (?, ?)",
            arguments: [messageKey, cause.rawValue]
        )
    }

    /// Une suppression lancée ici attend sa confirmation ; toute autre est
    /// annoncée par le serveur, donc confirmée (un écho sur une ligne déjà
    /// supprimée ne réveille pas le déclencheur : il confirme ici).
    static func settle(_ messageKey: String, awaitingConfirmation: Bool, in db: Database) throws {
        try awaitingConfirmation ? awaitConfirmation(of: messageKey, in: db) : confirmDeletion(of: messageKey, in: db)
    }

    /// Une suppression lancée ici attend sa confirmation.
    static func awaitConfirmation(of messageKey: String, in db: Database) throws {
        try db.execute(
            sql: """
                UPDATE \(table) SET confirmed = 0 WHERE cause = '\(Cause.deleted.rawValue)' AND messageKey IN (
                    SELECT localId FROM messages WHERE localId = ? OR serverId = ?
                    UNION SELECT serverId FROM messages WHERE serverId IS NOT NULL AND (localId = ? OR serverId = ?)
                    UNION SELECT ?
                )
                """,
            arguments: [messageKey, messageKey, messageKey, messageKey, messageKey]
        )
    }

    /// Le serveur a accepté ou annoncé la suppression.
    static func confirmDeletion(of messageKey: String, in db: Database) throws {
        try db.execute(
            sql: """
                UPDATE \(table) SET confirmed = 1 WHERE cause = '\(Cause.deleted.rawValue)' AND messageKey IN (
                    SELECT localId FROM messages WHERE localId = ? OR serverId = ?
                    UNION SELECT serverId FROM messages WHERE serverId IS NOT NULL AND (localId = ? OR serverId = ?)
                    UNION SELECT ?
                )
                """,
            arguments: [messageKey, messageKey, messageKey, messageKey, messageKey]
        )
    }

    /// Une suppression annulée retire sa seule inscription, et pas pour un
    /// message dont la vue unique est ouverte ou l'éphémère échu.
    static func cancelDeletion(of messageKey: String, now: Date, in db: Database) throws {
        let filter = "(localId = ? OR serverId = ?) AND viewOnceOpenedAt IS NULL AND NOT (expiresAt IS NOT NULL AND expiresAt <= ?)"
        let rowArguments: StatementArguments = [messageKey, messageKey, now]
        guard try Bool.fetchOne(db, sql: "SELECT EXISTS (SELECT 1 FROM messages WHERE \(filter))", arguments: rowArguments) == true else {
            return
        }
        try db.execute(
            sql: """
                DELETE FROM \(table) WHERE cause = '\(Cause.deleted.rawValue)' AND messageKey IN (
                    SELECT localId FROM messages WHERE \(filter)
                    UNION SELECT serverId FROM messages WHERE serverId IS NOT NULL AND (\(filter))
                )
                """,
            arguments: rowArguments + rowArguments
        )
    }

    /// Inscrit les lignes de ces identifiants locaux, et leurs identifiants serveur.
    static func record(_ localIds: [String], cause: Cause, in db: Database) throws {
        let placeholders = localIds.map { _ in "?" }.joined(separator: ",")
        try record(rowsMatching: "localId IN (\(placeholders))", arguments: StatementArguments(localIds), cause: cause, in: db)
    }

    /// Inscrit les clés (identifiant local et serveur) des lignes qui vont être
    /// retirées, dans la transaction qui les retire.
    static func record(rowsMatching filter: String, arguments: StatementArguments, cause: Cause, in db: Database) throws {
        try db.execute(
            sql: "INSERT OR IGNORE INTO \(table)(messageKey, cause) SELECT localId, '\(cause.rawValue)' FROM messages WHERE isEncrypted = 1 AND (\(filter))",
            arguments: arguments
        )
        try db.execute(
            sql: "INSERT OR IGNORE INTO \(table)(messageKey, cause) SELECT serverId, '\(cause.rawValue)' FROM messages WHERE serverId IS NOT NULL AND isEncrypted = 1 AND (\(filter))",
            arguments: arguments
        )
    }
}
