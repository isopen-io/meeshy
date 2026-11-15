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
/// Les identifiants sans `_v3` ont porté des schémas provisoires sur une
/// branche jamais fusionnée (appareils de recette) : ils restent inscrits, à
/// vide, pour que la base qui les a appliqués se reconnaisse à jour, et leurs
/// objets sont retirés avant d'être recréés.
struct MessagesPlaintextErasuresProvisionalMigration: DatabaseMigration {
    let identifier: String
    func migrate(_ db: Database) throws {}
}

struct MessagesPlaintextErasuresMigration: DatabaseMigration {
    let identifier = "messages_e2ee_plaintext_erasures_v3"

    static let provisionalTriggers = [
        "e2ee_erasure_on_delete", "e2ee_erasure_on_view_once_opened",
        "e2ee_erasure_on_update_deleted", "e2ee_erasure_on_insert_deleted",
        "e2ee_erasure_on_update_viewOnceOpened", "e2ee_erasure_on_insert_viewOnceOpened",
        "e2ee_content_sealed_on_insert", "e2ee_content_sealed_on_update",
    ]

    func migrate(_ db: Database) throws {
        // Les octets d'un clair rescellé ici sont mis à zéro, dans la base et le journal.
        try db.withSecureDelete { try migrateSecurely(db) }
    }

    private func migrateSecurely(_ db: Database) throws {
        for trigger in Self.provisionalTriggers {
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
/// bout ne garde jamais de texte, quel que soit l'écrivain.
/// - Un `MessageRecord` est scellé par son encodage (`EndToEndDiskPlaintextLaw`).
/// - Le SQL brut qui écrit `content` passe par `sealedContentAssignment`, que
///   que `EndToEndDiskPlaintextLawTests` exige de toute affectation paramétrée.
/// - L'index plein texte n'indexe jamais le texte d'une telle ligne : ses
///   déclencheurs indexent l'expression scellée, si bien qu'un écrivain futur
///   qui oublierait la règle n'y laisserait aucun terme.
///
/// Les lignes déjà marquées sont rescellées AVANT que les déclencheurs ne
/// changent : l'index et la table restent d'accord sur chaque ligne.
enum EndToEndContentSeal {
    static let placeholder = E2EEWire.contentPlaceholder

    /// L'affectation de `content` d'un `UPDATE` brut ; `?1` est le texte, premier
    /// paramètre de l'instruction. La ligne lue est celle d'AVANT l'écriture.
    static let sealedContentAssignment = """
        content = CASE WHEN isEncrypted = 1 AND encryptionMode = '\(E2EEWire.mode)' AND length(COALESCE(?1, '')) > 0 \
        THEN '\(placeholder)' ELSE ?1 END
        """

    private static func indexed(_ row: String) -> String {
        """
        CASE WHEN \(row).isEncrypted = 1 AND \(row).encryptionMode = '\(E2EEWire.mode)' \
        AND length(COALESCE(\(row).content, '')) > 0 THEN '\(placeholder)' ELSE \(row).content END
        """
    }

    static func install(in db: Database) throws {
        try db.execute(sql: """
            UPDATE messages SET content = '\(placeholder)'
            WHERE isEncrypted = 1 AND encryptionMode = '\(E2EEWire.mode)'
              AND length(COALESCE(content, '')) > 0 AND content != '\(placeholder)'
            """)
        for trigger in ["msg_fts_ai", "msg_fts_ad", "msg_fts_au"] {
            try db.execute(sql: "DROP TRIGGER IF EXISTS \(trigger)")
        }
        // L'index se reconstruit depuis l'expression scellée, jamais depuis le
        // contenu brut (`rebuild` l'indexerait) : un terme qu'une version
        // provisoire y aurait laissé disparaît.
        try db.execute(sql: "INSERT INTO messages_fts(messages_fts) VALUES('delete-all')")
        try db.execute(sql: "INSERT INTO messages_fts(rowid, content) SELECT rowid, \(indexed("messages")) FROM messages")
        try db.execute(sql: """
            CREATE TRIGGER msg_fts_ai AFTER INSERT ON messages BEGIN
                INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, \(indexed("new")));
            END
            """)
        try db.execute(sql: """
            CREATE TRIGGER msg_fts_ad AFTER DELETE ON messages BEGIN
                INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, \(indexed("old")));
            END
            """)
        try db.execute(sql: """
            CREATE TRIGGER msg_fts_au AFTER UPDATE ON messages BEGIN
                INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, \(indexed("old")));
                INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, \(indexed("new")));
            END
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
        WHEN old.\(column) IS NULL AND new.\(column) IS NOT NULL AND (new.isEncrypted = 1 OR old.isEncrypted = 1 OR old.content = '\(E2EEWire.contentPlaceholder)')
        BEGIN
        \(insertions(of: cause))
        END
        """
    }

    static func insertTrigger(for cause: Cause) -> String {
        let column = cause.column ?? ""
        return """
        CREATE TRIGGER e2ee_erasure_on_insert_\(cause.rawValue) AFTER INSERT ON messages
        WHEN new.\(column) IS NOT NULL AND (new.isEncrypted = 1 OR new.content = '\(E2EEWire.contentPlaceholder)')
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
            sql: "INSERT OR IGNORE INTO \(table)(messageKey, cause) SELECT localId, '\(cause.rawValue)' FROM messages WHERE (isEncrypted = 1 OR content = '\(E2EEWire.contentPlaceholder)') AND (\(filter))",
            arguments: arguments
        )
        try db.execute(
            sql: "INSERT OR IGNORE INTO \(table)(messageKey, cause) SELECT serverId, '\(cause.rawValue)' FROM messages WHERE serverId IS NOT NULL AND (isEncrypted = 1 OR content = '\(E2EEWire.contentPlaceholder)') AND (\(filter))",
            arguments: arguments
        )
    }
}
