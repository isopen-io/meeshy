import Foundation
import GRDB

/// **Jusqu'où la base du compte détient le fil d'une conversation SANS TROU** —
/// le filigrane de CONTIGUÏTÉ (#18929).
///
/// Le rattrapage `after` d'un fil repartait du plus récent message détenu
/// (`SyncWatermark.newest`). Or un message entre aussi SEUL dans la base —
/// déposé par la NSE, ramené par un push, relayé par le socket conversation
/// fermée — et devenait ce point de départ : les messages non poussés entre le
/// fil détenu et lui (conversation en « mentions seulement », muette, push
/// perdu) n'étaient jamais relus. Un trou au MILIEU du fil, sans signal.
///
/// Le filigrane n'avance que sur une synchro CONTIGUË : une page des plus
/// récents messages qui ouvre le fil (rien n'était détenu) ou qui rejoint le
/// bloc détenu, un balayage `after` parti de l'intérieur du bloc. Une insertion
/// isolée ne le touche jamais, et il ne recule pas : un rattrapage le borne au
/// plus récent message détenu.
///
/// SANS filigrane — une conversation née après la migration, que seuls la NSE,
/// un push ou le socket ont nourrie —, rien n'atteste qu'un message détenu en
/// rejoint un autre : le rattrapage repart du plus ANCIEN message serveur
/// détenu, et seule une page qui remonte jusqu'à lui ouvre le fil.
///
/// Les règles sont pures, les écritures atomiques ; QUAND synchroniser reste à
/// l'app (`ConversationHistoryLoader`).
public enum ConversationContiguity {

    static let table = "conversation_contiguity"

    /// Ce que la base tient d'une conversation au moment d'y graver une page.
    public struct Base: Sendable, Equatable {
        /// La fin du fil détenu sans trou ; `nil` tant qu'aucune synchro contiguë ne l'a posée.
        public let watermark: Date?
        /// Le plus ancien message SERVEUR détenu, d'où qu'il vienne.
        public let oldestHeld: Date?
        /// Le plus récent message SERVEUR détenu, d'où qu'il vienne.
        public let newestHeld: Date?

        public init(watermark: Date?, oldestHeld: Date?, newestHeld: Date?) {
            self.watermark = watermark
            self.oldestHeld = oldestHeld
            self.newestHeld = newestHeld
        }

        /// D'où un fil détenu se prouve rejoint : sa fin sans trou, sinon le plus ancien message serveur détenu.
        var junction: Date? { watermark ?? oldestHeld ?? newestHeld }
    }

    // MARK: - Les règles

    /// D'où repart un rattrapage : la fin du fil détenu sans trou, bornée au plus
    /// récent message détenu ; sans filigrane, le plus ANCIEN message serveur
    /// détenu — repartir du plus récent laissait invisible tout trou entre deux
    /// messages entrés seuls ; rien de détenu, aucun rattrapage.
    public static func catchUpCursor(watermark: Date?, oldestHeld: Date?, newestHeld: Date?) -> Date? {
        guard let newestHeld else { return nil }
        return min(watermark ?? oldestHeld ?? newestHeld, newestHeld)
    }

    /// Jusqu'où une page des PLUS RÉCENTS messages — d'un seul tenant jusqu'au
    /// présent — étend le fil : elle l'ouvre quand rien n'était détenu, l'étend
    /// quand elle rejoint le bloc — sans filigrane, quand elle remonte jusqu'au
    /// plus ancien message serveur détenu —, et le laisse quand un écart l'en
    /// sépare (le balayage le comblera). `nil` : le filigrane ne bouge pas.
    public static func extent(ofRefresh page: [Date], over base: Base) -> Date? {
        guard let oldest = page.min(), let newest = page.max() else { return nil }
        guard let junction = base.junction else { return newest }
        return oldest <= junction ? newest : nil
    }

    /// Jusqu'où un balayage `after` parti de `cursor` étend le fil : jusqu'au plus
    /// récent message lu, à condition d'être parti de l'intérieur du bloc. Un
    /// balayage vide confirme le bloc jusqu'à son point de départ.
    public static func extent(ofSweepFrom cursor: Date, fetched: [Date], watermark: Date?) -> Date? {
        if let watermark, cursor > watermark { return nil }
        return max(cursor, fetched.max() ?? cursor)
    }

    // MARK: - La table

    public static func base(of conversationId: String, on persistence: isolated MessagePersistenceActor) throws -> Base {
        try persistence.dbWriter.read { db in
            Base(
                watermark: try Date.fetchOne(
                    db, sql: "SELECT contiguousUpTo FROM \(table) WHERE conversationId = ?", arguments: [conversationId]
                ),
                oldestHeld: try Date.fetchOne(
                    db, sql: "SELECT MIN(createdAt) FROM messages WHERE conversationId = ? AND serverId IS NOT NULL",
                    arguments: [conversationId]
                ),
                newestHeld: try Date.fetchOne(
                    db, sql: "SELECT MAX(createdAt) FROM messages WHERE conversationId = ? AND serverId IS NOT NULL",
                    arguments: [conversationId]
                )
            )
        }
    }

    /// Avance le filigrane jusqu'à `instant`, jamais en arrière.
    public static func extend(_ conversationId: String, to instant: Date, on persistence: isolated MessagePersistenceActor) throws {
        try persistence.dbWriter.write { db in
            try db.execute(sql: """
                INSERT INTO \(table) (conversationId, contiguousUpTo) VALUES (?, ?)
                ON CONFLICT(conversationId) DO UPDATE SET contiguousUpTo = MAX(contiguousUpTo, excluded.contiguousUpTo)
                """, arguments: [conversationId, instant])
        }
    }

    /// La conversation quitte la base (accès retiré) : son fil n'est plus détenu.
    public static func forget(_ conversationId: String, on persistence: isolated MessagePersistenceActor) throws {
        try persistence.dbWriter.write { db in
            try db.execute(sql: "DELETE FROM \(table) WHERE conversationId = ?", arguments: [conversationId])
        }
    }
}
