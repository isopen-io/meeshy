import Foundation
import GRDB

/// Describes which slice of the conversation the store is currently displaying.
public enum WindowMode: Equatable, Sendable {
    /// Latest window — show the most recent N messages.
    case latest
    /// Jumped window — show messages centered around a specific date.
    case around(date: Date)
    /// Search filter — show ONLY the messages whose `serverId` is in `ids`, in chronological order, independent of any
    /// time window. `ids` are server message IDs; the caller must have persisted the matches beforehand.
    case search(ids: [String])
}

/// Bord RÉCENT d'une fenêtre sautée (#9304). Le serveur sert la fenêtre `around` puis ses pages `after` d'un seul
/// tenant ; la base peut porter, plus haut, les messages récents d'une session antérieure, séparés d'elle par un trou.
/// - `halfWindow` — la moitié de la fenêtre initiale ;
/// - `through(date)` — jusqu'au plus récent message servi, inclus ;
/// - `present` — la fenêtre a rejoint le présent : tout ce qui suit.
public enum JumpedWindowNewerEdge: Equatable, Sendable {
    case halfWindow
    case through(Date)
    case present
}

/// Les lectures et la maintenance de la base des messages dont l'app a besoin, sans qu'elle ne touche GRDB : elle
/// passe par ce dépôt, posé sur la base de l'acteur de persistance du compte.
public struct MessageRepository: Sendable {
    private let database: any DatabaseWriter

    public init(persistence: MessagePersistenceActor) {
        self.database = persistence.reader
    }

    /// Les ids d'une recherche filtrée, sans doublon, par paquets de `size` (plafond SQLite des `IN`) : un même id
    /// tombé dans deux paquets ramenait la même ligne deux fois, et le diffable plantait sur l'identifiant dupliqué.
    public static func searchIdChunks(_ ids: [String], size: Int = 900) -> [[String]] {
        var seen = Set<String>()
        let unique = ids.filter { seen.insert($0).inserted }
        let step = Swift.max(1, size)
        return stride(from: 0, to: unique.count, by: step).map {
            Array(unique[$0 ..< Swift.min($0 + step, unique.count)])
        }
    }

    /// La fenêtre de messages d'une conversation, toujours du plus ancien au plus récent. `anchoredRowCap` plafonne la
    /// lecture `.latest` ANCRÉE aux lignes les plus récentes ; il ne sert qu'aux appelants qui fusionnent en mémoire.
    public func messageWindow(
        conversationId: String,
        mode: WindowMode,
        anchor: Date?,
        initialWindowSize: Int,
        anchoredRowCap: Int? = nil,
        newerEdge: JumpedWindowNewerEdge = .halfWindow
    ) throws -> [MessageRecord] {
        try database.read { db in
            let thread = MessageRecord.filter(Column("conversationId") == conversationId)
            switch mode {
            case .search(let ids):
                return try Self.searchIdChunks(ids)
                    .flatMap { try thread.filter($0.contains(Column("serverId"))).fetchAll(db) }
                    .sorted { $0.createdAt < $1.createdAt }
            case .around(let center):
                return try Self.around(center, in: thread, half: initialWindowSize / 2, newerEdge: newerEdge, db)
            case .latest:
                return try Self.latest(in: thread, anchor: anchor, cap: anchoredRowCap,
                                       initialWindowSize: initialWindowSize, db)
            }
        }
    }

    private static func around(_ center: Date, in thread: QueryInterfaceRequest<MessageRecord>,
                                           half: Int, newerEdge: JumpedWindowNewerEdge,
                                           _ db: Database) throws -> [MessageRecord] {
        let before = try thread
            .filter(Column("createdAt") <= center)
            .order(Column("createdAt").desc)
            .limit(half)
            .fetchAll(db)
        let newer = thread.filter(Column("createdAt") > center).order(Column("createdAt").asc)
        let after: [MessageRecord]
        switch newerEdge {
        case .halfWindow: after = try newer.limit(half).fetchAll(db)
        case .through(let edge): after = try newer.filter(Column("createdAt") <= edge).fetchAll(db)
        case .present: after = try newer.fetchAll(db)
        }
        return Array(before.reversed()) + after
    }

    private static func latest(in thread: QueryInterfaceRequest<MessageRecord>, anchor: Date?, cap: Int?,
                                           initialWindowSize: Int, _ db: Database) throws -> [MessageRecord] {
        guard let anchor else {
            return try Array(thread.order(Column("createdAt").desc).limit(initialWindowSize).fetchAll(db).reversed())
        }
        let fromAnchor = thread.filter(Column("createdAt") >= anchor)
        guard let cap else { return try fromAnchor.order(Column("createdAt").asc).fetchAll(db) }
        return try Array(fromAnchor.order(Column("createdAt").desc).limit(cap).fetchAll(db).reversed())
    }

    public func translations(forMessageIds messageIds: [String]) async throws -> [String: [TranslationRecord]] {
        guard !messageIds.isEmpty else { return [:] }
        return try await database.read { db in
            Dictionary(grouping: try Self.translationRows(for: messageIds, in: db), by: \.messageLocalId)
        }
    }

    public func recentTranslations(conversationId: String, limit: Int) async throws -> [String: [TranslationRecord]] {
        try await database.read { db in
            let messageIds = try MessageRecord
                .filter(Column("conversationId") == conversationId)
                .order(Column("createdAt").desc)
                .limit(limit)
                .fetchAll(db)
                .flatMap { [$0.localId, $0.serverId].compactMap { $0 } }
            guard !messageIds.isEmpty else { return [:] }
            return Dictionary(grouping: try Self.translationRows(for: messageIds, in: db), by: \.messageLocalId)
        }
    }

    /// Vide la file durable entière, quel que soit l'état de ses lignes : une prise de vitrine repart à neuf.
    @discardableResult
    public func purgeOutbox() async throws -> Int {
        try await database.write { db in try OutboxRecord.deleteAll(db) }
    }

    private static func translationRows(for messageIds: [String], in db: Database) throws -> [TranslationRecord] {
        try TranslationRecord.filter(messageIds.contains(Column("messageLocalId"))).fetchAll(db)
    }
}
