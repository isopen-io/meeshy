# iOS Persistence Layer + Message State Machine — Refonte complète (v2)

**Date**: 2026-05-04 (rev. 2 — post expert review)
**Scope**: Refonte complète de la couche persistence messages + state machine + reactive conversation list
**Target**: Swift 6.2, iOS 17+ (iOS 18 APIs via `if #available`), GRDB DatabasePool WAL mode
**Approach**: Actor-Isolated Persistence + Formal State Machine (Approche C)

## Changements v2 (post expert review)

15 corrections appliquees suite a la review de l'architecte iOS senior :

| # | Correction | Categorie |
|---|-----------|-----------|
| C1 | 40+ socket events documentes (etaient 4) | CRITIQUE |
| C2 | Tables GRDB dediees translations/transcriptions/audio | CRITIQUE |
| C3 | MessageRecord etendu a 35+ champs (etait 18) | CRITIQUE |
| C4 | Conversation list reactivity ajoutee (Section 8) | CRITIQUE |
| C5 | Target iOS 17+ (etait iOS 18+) avec `if #available` | CRITIQUE |
| C6 | Actor re-entrancy fixe via AsyncStream serial buffer | CRITIQUE |
| I1 | DatabaseRegionObservation + targeted fetch (etait full re-query) | IMPORTANT |
| I2 | Array + lazy index (etait OrderedDictionary) | IMPORTANT |
| I3 | Anchor-based windowing (etait LIMIT 200 from tail) | IMPORTANT |
| I4 | Layout invalidation strategy pour Dynamic Type/rotation/reactions | IMPORTANT |
| I5 | Migration strategy depuis ancien schema GRDB | IMPORTANT |
| I6 | Pipeline de decryptage E2EE explicite | IMPORTANT |
| I7 | DependencyContainer coexistence avec singletons existants | IMPORTANT |
| I8 | Gap detector pagination sans cap (etait limit 100) | IMPORTANT |
| I9 | RetryEngine reactif via ValueObservation (etait polling 2-5s) | IMPORTANT |

---

## Motivation

L'audit de l'architecture messaging iOS a revele 8 problemes critiques :

1. **Dirty flush debounce 2-10s** — risque de perte de donnees si crash/background
2. **Pas de persistence avant envoi REST** — message optimiste en memoire seule
3. **Delivery status updates non-persistes** — status perdu au cold-start
4. **Offline queue non-chiffree** — corps des messages en clair dans Documents/
5. **Media non snapshottes avant upload** — photo disparait si upload echoue
6. **Pas de gap detection au reconnect** — messages manques pendant deconnexion
7. **`pendingServerIds` en memoire seule** — mapping perdu au deinit ViewModel, duplicatas
8. **Pas de retry automatique** — messages .failed necessitent tap manuel

## Recherche SOTA appliquee

| Technique | Source | Application |
|-----------|--------|-------------|
| DatabasePool WAL mode | GRDB docs, SQLite WAL internals | Zero-contention reads (10 readers) + 1 writer |
| DatabaseRegionObservation | GRDB advanced | Notification de changement sans re-query 200 rows |
| Pre-computed bubble layout | Telegram (AsyncDisplayKit) | Layout off-main-thread, stocke en DB |
| Windowed LazyVStack | Stream Chat, iOS 18 ScrollView APIs | 200 messages max en memoire, pagination transparente |
| Equatable views + drawingGroup | Airbnb SwiftUI research | Skip re-renders + Metal rendering |
| mmap + CGImageSource | Telegram, Apple docs | Thumbnails sans heap allocation |
| Batched writes via AsyncStream | Swift concurrency patterns | Serial buffer sans re-entrancy |
| Actor isolation | Swift 6.2 SE-0466 | Zero race condition, zero lock manual |

---

## Section 1 : MessageStateMachine — Transitions formelles

*Inchange depuis v1 — la state machine pure est validee.*

### MessageState enum

```swift
public enum MessageState: String, Codable, Sendable, Comparable {
    case draft
    case queued
    case sending
    case sent
    case delivered
    case read
    case failed

    private var ordinal: Int {
        switch self {
        case .draft: 0  case .queued: 1  case .sending: 2
        case .sent: 3  case .delivered: 4  case .read: 5  case .failed: -1
        }
    }

    public static func < (lhs: Self, rhs: Self) -> Bool { lhs.ordinal < rhs.ordinal }
}
```

### MessageEvent enum

```swift
public enum MessageEvent: Sendable {
    case enqueue
    case startSending
    case serverAck(serverId: String, at: Date)
    case delivered(count: Int, at: Date)
    case readBy(userId: String, at: Date)
    case sendFailed(Error)
    case retry
    case retryExhausted
}
```

### MessageStateMachine struct

```swift
public struct MessageStateMachine: Sendable {
    public private(set) var state: MessageState
    public private(set) var retryCount: Int = 0
    public private(set) var serverId: String?
    public private(set) var lastError: String?
    public private(set) var deliveredAt: Date?
    public private(set) var readAt: Date?

    public static let maxRetries = 3

    public mutating func apply(_ event: MessageEvent) -> MessageState? {
        switch (state, event) {
        case (.draft, .enqueue), (.draft, .startSending): state = .queued
        case (.queued, .startSending): state = .sending
        case (.sending, .serverAck(let id, _)):
            serverId = id; state = .sent
        case (.sent, .delivered(let count, let at)) where count > 0:
            deliveredAt = at; state = .delivered
        case (.delivered, .readBy(_, let at)):
            readAt = at; state = .read
        case (.sent, .readBy(_, let at)):
            readAt = at; state = .read
        case (.sending, .sendFailed(let error)):
            lastError = error.localizedDescription
            if retryCount < Self.maxRetries { retryCount += 1; state = .queued }
            else { state = .failed }
        case (.failed, .retry):
            retryCount = 0; state = .queued
        case (.queued, .retryExhausted): state = .failed
        default: return nil
        }
        return state
    }
}
```

### Transition rules

1. **Monotone** pour delivery : sending -> sent -> delivered -> read (jamais de retour)
2. **Skip autorise** : sent -> read directement
3. **Retry loop** : sending -> queued -> sending... (max 3) -> failed
4. **Manual retry** : failed -> queued (retryCount reset)
5. **`apply()` retourne `nil`** pour transitions invalides

---

## Section 2 : MessagePersistenceActor — Write-through isole

### MessageRecord (GRDB) — COMPLET (C3 fix)

```swift
struct MessageRecord: Codable, FetchableRecord, PersistableRecord, Sendable, Equatable {
    static let databaseTableName = "messages"

    // Identity
    var localId: String              // PK : temp_<uuid> ou server ID
    var serverId: String?
    var conversationId: String
    var senderId: String

    // Content
    var content: String?
    var originalLanguage: String     // default "fr"
    var messageType: String          // text, image, file, audio, video, location
    var messageSource: String        // user, system, ads, app, agent, authority
    var contentType: String          // MIME-like for attachments

    // State machine
    var state: MessageState
    var retryCount: Int
    var lastError: String?

    // Encryption
    var encryptedPayload: Data?
    var isEncrypted: Bool
    var encryptionMode: String?

    // Reply / Forward
    var replyToId: String?
    var storyReplyToId: String?
    var forwardedFromId: String?
    var forwardedFromConversationId: String?
    var replyToJson: Data?           // JSON-encoded ReplyReference
    var forwardedFromJson: Data?     // JSON-encoded ForwardReference

    // Ephemeral / Effects
    var expiresAt: Date?
    var effectFlags: UInt32          // MessageEffects bitmask
    var maxViewOnceCount: Int?
    var viewOnceCount: Int

    // Edit / Delete
    var isEdited: Bool
    var editedAt: Date?
    var deletedAt: Date?

    // Pin
    var pinnedAt: Date?
    var pinnedBy: String?

    // Sender metadata (denormalized for offline display)
    var senderName: String?
    var senderUsername: String?
    var senderColor: String?
    var senderAvatarURL: String?

    // Delivery tracking
    var deliveredCount: Int
    var readCount: Int
    var deliveredToAllAt: Date?
    var readByAllAt: Date?

    // Timestamps
    var createdAt: Date
    var sentAt: Date?
    var deliveredAt: Date?
    var readAt: Date?
    var updatedAt: Date

    // Attachments (JSON blob — array of attachment records)
    var attachmentsJson: Data?       // JSON [AttachmentRecord]

    // Reactions (JSON blob — array of reaction summaries)
    var reactionsJson: Data?         // JSON [ReactionRecord]
    var reactionCount: Int
    var currentUserReactionsJson: Data? // JSON [String]

    // Mentions
    var mentionedUsersJson: Data?    // JSON [MentionedUser]

    // Pre-computed layout
    var cachedBubbleWidth: Double?
    var cachedBubbleHeight: Double?
    var layoutVersion: Int
    var layoutMaxWidth: Double?      // (I4) maxWidth utilise pour ce calcul
}
```

### Tables de traduction/transcription (C2 fix)

```swift
/// Traductions texte d'un message
struct TranslationRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "message_translations"

    var id: String                   // PK
    var messageLocalId: String       // FK -> messages.localId
    var messageServerId: String?     // Pour reconciliation
    var targetLanguage: String
    var translatedContent: String
    var translationModel: String
    var confidenceScore: Double?
    var sourceLanguage: String?
    var receivedAt: Date
}

/// Transcriptions audio (Whisper)
struct TranscriptionRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "message_transcriptions"

    var messageLocalId: String       // PK (1 transcription par message)
    var messageServerId: String?
    var language: String
    var text: String
    var segmentsJson: Data?          // JSON [TranscriptionSegment]
    var speakerCount: Int?
    var receivedAt: Date
}

/// Traductions audio (TTS genere)
struct AudioTranslationRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "message_audio_translations"

    var id: String                   // PK
    var messageLocalId: String       // FK -> messages.localId
    var messageServerId: String?
    var targetLanguage: String
    var audioUrl: String?
    var status: String               // ready, progressive, completed
    var receivedAt: Date
}
```

### PendingIdRecord

```swift
struct PendingIdRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "pending_ids"
    var localId: String              // PK
    var serverId: String
    var conversationId: String
    var reconciledAt: Date?
}
```

### Actor — avec AsyncStream serial buffer (C6 fix)

```swift
public actor MessagePersistenceActor {
    private let dbPool: DatabasePool

    // (C6) Serial buffer pour les ecritures haute-frequence
    // AsyncStream garantit l'ordre et empeche la re-entrancy
    private let writeStream: AsyncStream<WriteOperation>
    private let writeContinuation: AsyncStream<WriteOperation>.Continuation
    private var processorTask: Task<Void, Never>?

    enum WriteOperation: Sendable {
        case insert(MessageRecord)
        case applyEvent(localId: String, event: MessageEvent)
        case reconcileBatch([IncomingMessage])
        case batchDeliveryUpdate(conversationId: String, event: MessageEvent)
    }

    init(dbPool: DatabasePool) throws {
        self.dbPool = dbPool
        let (stream, continuation) = AsyncStream.makeStream(of: WriteOperation.self)
        self.writeStream = stream
        self.writeContinuation = continuation
        try migrate()
        startProcessor()
    }

    /// Processeur serial — lit les operations une par une, jamais de re-entrancy
    private func startProcessor() {
        processorTask = Task { [weak self] in
            guard let self else { return }
            for await op in writeStream {
                switch op {
                case .insert(let record):
                    try? dbPool.write { db in try record.insert(db) }
                case .applyEvent(let localId, let event):
                    try? self.applyEventSync(localId: localId, event: event)
                case .reconcileBatch(let messages):
                    try? self.reconcileBatchSync(messages)
                case .batchDeliveryUpdate(let convId, let event):
                    try? self.batchDeliverySync(conversationId: convId, event: event)
                }
            }
        }
    }

    // Methodes publiques : enqueue dans le stream (non-bloquant)
    // Pour les cas ou on a besoin du resultat : methode sync directe

    /// Insert optimiste — write-through, retourne apres ecriture GRDB
    func insertOptimistic(_ record: MessageRecord) throws {
        try dbPool.write { db in try record.insert(db) }
    }

    /// Apply event — atomique, retourne le nouvel etat
    func applyEvent(localId: String, event: MessageEvent) throws -> MessageState? {
        try applyEventSync(localId: localId, event: event)
    }

    /// Buffer pour les rafales socket (C6 safe — AsyncStream serial)
    func bufferIncoming(_ messages: [IncomingMessage]) {
        writeContinuation.yield(.reconcileBatch(messages))
    }

    /// Buffer pour batch delivery (ex: 50 read receipts)
    func bufferBatchDelivery(conversationId: String, event: MessageEvent) {
        writeContinuation.yield(.batchDeliveryUpdate(conversationId: conversationId, event: event))
    }

    // MARK: - Sync implementations (called within actor)

    private func applyEventSync(localId: String, event: MessageEvent) throws -> MessageState? {
        try dbPool.write { db in
            guard var record = try MessageRecord.fetchOne(db, key: localId) else { return nil }
            var machine = MessageStateMachine(
                state: record.state, retryCount: record.retryCount,
                serverId: record.serverId
            )
            guard let newState = machine.apply(event) else { return nil }

            record.state = newState
            record.retryCount = machine.retryCount
            record.serverId = machine.serverId
            record.lastError = machine.lastError
            record.deliveredAt = machine.deliveredAt ?? record.deliveredAt
            record.readAt = machine.readAt ?? record.readAt
            record.updatedAt = Date()

            if case .serverAck(let serverId, let at) = event {
                record.serverId = serverId
                record.sentAt = at
                try PendingIdRecord(localId: localId, serverId: serverId,
                                     conversationId: record.conversationId).insert(db)
            }

            try record.update(db)
            return newState
        }
    }

    private func reconcileBatchSync(_ messages: [IncomingMessage]) throws {
        try dbPool.write { db in
            for msg in messages {
                let existingLocalId = try PendingIdRecord
                    .filter(Column("serverId") == msg.id)
                    .fetchOne(db)?.localId

                if let localId = existingLocalId,
                   var existing = try MessageRecord.fetchOne(db, key: localId) {
                    existing.state = max(existing.state, msg.computedState)
                    existing.content = msg.content
                    existing.updatedAt = Date()
                    try existing.update(db)
                } else {
                    let record = MessageRecord(from: msg)
                    try record.insert(db)
                }
            }
        }
    }

    private func batchDeliverySync(conversationId: String, event: MessageEvent) throws {
        try dbPool.write { db in
            let records = try MessageRecord
                .filter(Column("conversationId") == conversationId)
                .filter([MessageState.sending.rawValue, MessageState.sent.rawValue]
                    .contains(Column("state")))
                .fetchAll(db)

            for var record in records {
                var machine = MessageStateMachine(state: record.state, retryCount: record.retryCount, serverId: record.serverId)
                if let _ = machine.apply(event) {
                    record.state = machine.state
                    record.deliveredAt = machine.deliveredAt
                    record.readAt = machine.readAt
                    record.updatedAt = Date()
                    try record.update(db)
                }
            }
        }
    }

    // MARK: - Translation/Transcription writes

    func saveTranslation(_ translation: TranslationRecord) throws {
        try dbPool.write { db in try translation.save(db) }
    }

    func saveTranscription(_ transcription: TranscriptionRecord) throws {
        try dbPool.write { db in try transcription.save(db) }
    }

    func saveAudioTranslation(_ audio: AudioTranslationRecord) throws {
        try dbPool.write { db in try audio.save(db) }
    }

    // MARK: - Reads (nonisolated, zero contention)

    nonisolated var reader: DatabasePool { dbPool }

    nonisolated func messages(for conversationId: String, before: Date? = nil,
                               after: Date? = nil, limit: Int = 50) throws -> [MessageRecord] {
        try dbPool.read { db in
            var query = MessageRecord
                .filter(Column("conversationId") == conversationId)
                .order(Column("createdAt").desc)
                .limit(limit)
            if let before { query = query.filter(Column("createdAt") < before) }
            if let after { query = query.filter(Column("createdAt") > after) }
            return try query.fetchAll(db)
        }
    }

    nonisolated func translations(for messageLocalId: String) throws -> [TranslationRecord] {
        try dbPool.read { db in
            try TranslationRecord.filter(Column("messageLocalId") == messageLocalId).fetchAll(db)
        }
    }

    nonisolated func resolveServerId(for localId: String) throws -> String? {
        try dbPool.read { db in
            try PendingIdRecord.fetchOne(db, key: localId)?.serverId
        }
    }

    nonisolated func resolveLocalId(forServerId serverId: String) throws -> String? {
        try dbPool.read { db in
            try PendingIdRecord.filter(Column("serverId") == serverId).fetchOne(db)?.localId
        }
    }

    // MARK: - Reactions (in-place update on message record)

    func updateReactions(localId: String, reactionsJson: Data, reactionCount: Int,
                          currentUserReactionsJson: Data?) throws {
        try dbPool.write { db in
            try db.execute(
                sql: """
                    UPDATE messages SET reactionsJson = ?, reactionCount = ?,
                    currentUserReactionsJson = ?, updatedAt = ? WHERE localId = ?
                    """,
                arguments: [reactionsJson, reactionCount, currentUserReactionsJson, Date(), localId]
            )
        }
    }

    // MARK: - Edit / Delete

    func markEdited(localId: String, newContent: String, editedAt: Date) throws {
        try dbPool.write { db in
            try db.execute(
                sql: "UPDATE messages SET content = ?, isEdited = 1, editedAt = ?, updatedAt = ? WHERE localId = ?",
                arguments: [newContent, editedAt, Date(), localId]
            )
        }
    }

    func markDeleted(localId: String, deletedAt: Date) throws {
        try dbPool.write { db in
            try db.execute(
                sql: "UPDATE messages SET deletedAt = ?, content = NULL, updatedAt = ? WHERE localId = ?",
                arguments: [deletedAt, Date(), localId]
            )
        }
    }

    // MARK: - View-once

    func updateViewOnceCount(localId: String, count: Int) throws {
        try dbPool.write { db in
            try db.execute(
                sql: "UPDATE messages SET viewOnceCount = ?, updatedAt = ? WHERE localId = ?",
                arguments: [count, Date(), localId]
            )
        }
    }

    // MARK: - Migration (I5 fix)

    private func migrate() throws {
        var migrator = DatabaseMigrator()

        migrator.registerMigration("v1_messages") { db in
            try db.create(table: "messages") { t in
                t.column("localId", .text).primaryKey()
                t.column("serverId", .text).indexed()
                t.column("conversationId", .text).notNull()
                t.column("senderId", .text).notNull()
                t.column("content", .text)
                t.column("originalLanguage", .text).notNull().defaults(to: "fr")
                t.column("messageType", .text).notNull().defaults(to: "text")
                t.column("messageSource", .text).notNull().defaults(to: "user")
                t.column("contentType", .text).notNull().defaults(to: "text")
                t.column("state", .text).notNull()
                t.column("retryCount", .integer).notNull().defaults(to: 0)
                t.column("lastError", .text)
                t.column("isEncrypted", .boolean).notNull().defaults(to: false)
                t.column("encryptionMode", .text)
                t.column("encryptedPayload", .blob)
                t.column("replyToId", .text)
                t.column("storyReplyToId", .text)
                t.column("forwardedFromId", .text)
                t.column("forwardedFromConversationId", .text)
                t.column("replyToJson", .blob)
                t.column("forwardedFromJson", .blob)
                t.column("expiresAt", .datetime)
                t.column("effectFlags", .integer).notNull().defaults(to: 0)
                t.column("maxViewOnceCount", .integer)
                t.column("viewOnceCount", .integer).notNull().defaults(to: 0)
                t.column("isEdited", .boolean).notNull().defaults(to: false)
                t.column("editedAt", .datetime)
                t.column("deletedAt", .datetime)
                t.column("pinnedAt", .datetime)
                t.column("pinnedBy", .text)
                t.column("senderName", .text)
                t.column("senderUsername", .text)
                t.column("senderColor", .text)
                t.column("senderAvatarURL", .text)
                t.column("deliveredCount", .integer).notNull().defaults(to: 0)
                t.column("readCount", .integer).notNull().defaults(to: 0)
                t.column("deliveredToAllAt", .datetime)
                t.column("readByAllAt", .datetime)
                t.column("createdAt", .datetime).notNull()
                t.column("sentAt", .datetime)
                t.column("deliveredAt", .datetime)
                t.column("readAt", .datetime)
                t.column("updatedAt", .datetime).notNull()
                t.column("attachmentsJson", .blob)
                t.column("reactionsJson", .blob)
                t.column("reactionCount", .integer).notNull().defaults(to: 0)
                t.column("currentUserReactionsJson", .blob)
                t.column("mentionedUsersJson", .blob)
                t.column("cachedBubbleWidth", .double)
                t.column("cachedBubbleHeight", .double)
                t.column("layoutVersion", .integer).notNull().defaults(to: 0)
                t.column("layoutMaxWidth", .double)
            }
            try db.create(index: "idx_msg_conv_date", on: "messages", columns: ["conversationId", "createdAt"])
            try db.create(index: "idx_msg_state", on: "messages", columns: ["state"])
        }

        migrator.registerMigration("v1_pending_ids") { db in
            try db.create(table: "pending_ids") { t in
                t.column("localId", .text).primaryKey()
                t.column("serverId", .text).notNull().indexed()
                t.column("conversationId", .text).notNull()
                t.column("reconciledAt", .datetime)
            }
        }

        migrator.registerMigration("v1_translations") { db in
            try db.create(table: "message_translations") { t in
                t.column("id", .text).primaryKey()
                t.column("messageLocalId", .text).notNull().indexed()
                t.column("messageServerId", .text)
                t.column("targetLanguage", .text).notNull()
                t.column("translatedContent", .text).notNull()
                t.column("translationModel", .text).notNull()
                t.column("confidenceScore", .double)
                t.column("sourceLanguage", .text)
                t.column("receivedAt", .datetime).notNull()
            }
            try db.create(index: "idx_trans_msg_lang", on: "message_translations",
                          columns: ["messageLocalId", "targetLanguage"], unique: true)
        }

        migrator.registerMigration("v1_transcriptions") { db in
            try db.create(table: "message_transcriptions") { t in
                t.column("messageLocalId", .text).primaryKey()
                t.column("messageServerId", .text)
                t.column("language", .text).notNull()
                t.column("text", .text).notNull()
                t.column("segmentsJson", .blob)
                t.column("speakerCount", .integer)
                t.column("receivedAt", .datetime).notNull()
            }
        }

        migrator.registerMigration("v1_audio_translations") { db in
            try db.create(table: "message_audio_translations") { t in
                t.column("id", .text).primaryKey()
                t.column("messageLocalId", .text).notNull().indexed()
                t.column("messageServerId", .text)
                t.column("targetLanguage", .text).notNull()
                t.column("audioUrl", .text)
                t.column("status", .text).notNull()
                t.column("receivedAt", .datetime).notNull()
            }
        }

        migrator.registerMigration("v1_local_attachments") { db in
            try db.create(table: "local_attachments") { t in
                t.column("localId", .text).primaryKey()
                t.column("messageLocalId", .text).notNull().indexed()
                t.column("type", .text).notNull()
                t.column("mimeType", .text).notNull()
                t.column("fileName", .text).notNull()
                t.column("fileSize", .integer).notNull()
                t.column("localPath", .text).notNull()
                t.column("thumbnailPath", .text)
                t.column("width", .double)
                t.column("height", .double)
                t.column("duration", .double)
                t.column("createdAt", .datetime).notNull()
                t.column("remoteUrl", .text)
                t.column("uploadProgress", .double)
                t.column("uploadState", .text).notNull().defaults(to: "pending")
            }
        }

        try migrator.migrate(dbPool)
    }
}
```

### PRAGMA synchronous = NORMAL trade-off (N8)

`PRAGMA synchronous = NORMAL` : donnees perdues seulement en cas de coupure de courant physique (PAS en cas de crash app). Acceptable pour un cache de messages — la source de verite est le serveur. Le `pending_ids` survit aussi aux crash app. Documente ici pour reference.

### SQLCipher WAL (N7)

SQLCipher supporte WAL avec fichiers WAL/SHM chiffres. Ajouter `PRAGMA wal_autocheckpoint = 1000` pour eviter un WAL unbounded pendant les rafales d'ecriture.

---

## Section 3 : MessageStore — Couche de lecture observable

### Backing store (I2 fix)

**Array + lazy index** au lieu de `OrderedDictionary` :

```swift
@Observable
@MainActor
public final class MessageStore {
    private(set) var messages: [MessageRecord] = []
    private var _idIndex: [String: Int]?

    /// O(1) lookup — reconstruit paresseusement apres mutation
    func index(of localId: String) -> Int? {
        if _idIndex == nil {
            var idx = [String: Int](minimumCapacity: messages.count)
            for (i, m) in messages.enumerated() { idx[m.localId] = i }
            _idIndex = idx
        }
        return _idIndex?[localId]
    }

    /// Invalide l'index a chaque mutation
    private func invalidateIndex() { _idIndex = nil }
}
```

Raison : Array + lazy index est le pattern deja eprouve dans le `ConversationViewModel` actuel. `OrderedDictionary` a ~50-100% d'overhead memoire pour peu de gain reel avec 200 items.

### ValueObservation avec DatabaseRegionObservation (I1 fix)

Au lieu de re-query 200 rows a chaque write, on utilise `DatabaseRegionObservation` pour detecter QUELS messages ont change, puis fetch chirurgicalement :

```swift
func startObserving(dbPool: DatabasePool, conversationId: String) {
    // Observer la region "messages WHERE conversationId = X"
    let region = MessageRecord
        .filter(Column("conversationId") == conversationId)
        .databaseRegion

    regionObservation = DatabaseRegionObservation(tracking: region)
        .start(in: dbPool) { [weak self] _ in
            Task { @MainActor in
                await self?.refreshFromDB()
            }
        }
}

private func refreshFromDB() async {
    // Anchor-based query (I3 fix) — pas LIMIT 200 from tail
    let records: [MessageRecord]
    if let anchor = windowAnchor {
        records = try? persistence.reader.read { db in
            try MessageRecord
                .filter(Column("conversationId") == conversationId)
                .filter(Column("createdAt") >= anchor)
                .order(Column("createdAt").asc)
                .limit(Self.windowSize)
                .fetchAll(db)
        }
    } else {
        // Initial load : les 200 plus recents
        records = try? persistence.reader.read { db in
            try MessageRecord
                .filter(Column("conversationId") == conversationId)
                .order(Column("createdAt").desc)
                .limit(Self.windowSize)
                .fetchAll(db)
                .reversed()
        }
    }
    guard let records else { return }
    guard records != messages else { return } // Skip no-op
    messages = records
    invalidateIndex()
    invalidateSections()
}
```

### Anchor-based windowing (I3 fix)

**Probleme v1** : `LIMIT 200` re-fetch les plus recents. Si l'utilisateur est scrolle vers le haut et un nouveau message arrive en bas, la fenetre shift et perd la position de lecture.

**Fix** : `windowAnchor: Date?` = timestamp du message le plus ancien dans la fenetre courante. La query filtre `createdAt >= anchor`. Le anchor ne bouge que quand l'utilisateur scrolle explicitement, pas quand un message arrive.

```swift
/// Anchor = createdAt du message le plus ancien dans la fenetre
private var windowAnchor: Date?

/// Quand un nouveau message arrive (en bas) et qu'on est scrolle vers le haut :
/// -> le message est persiste en GRDB mais n'entre PAS dans la fenetre
/// -> unreadBelowCount++ , badge "X new messages" affiche
/// -> quand l'utilisateur scrolle vers le bas, l'anchor descend et les nouveaux messages entrent

/// Quand l'utilisateur scrolle vers le haut :
func onApproachingTop() async {
    // Deplace l'anchor vers le passe
    let olderRecords = try? persistence.messages(for: conversationId, before: windowAnchor, limit: 50)
    guard let older = olderRecords, !older.isEmpty else { return }
    windowAnchor = older.last?.createdAt
    await refreshFromDB()
}
```

### iOS 17 / iOS 18 compatibility (C5 fix)

```swift
// Dans ConversationView
if #available(iOS 18, *) {
    scrollView
        .scrollPosition($scrollPosition)
        .onScrollTargetVisibilityChange(idType: String.self) { ids in
            viewModel.onVisibleMessagesChanged(ids)
        }
} else {
    // iOS 17 fallback : GeometryReader + preference key pour scroll tracking
    scrollView
        .onScrollGeometryChange(for: CGFloat.self) { geo in geo.contentOffset.y }
        onChange: { _, offset in viewModel.onScrollOffsetChanged(offset) }
}
```

### Layout invalidation strategy (I4 fix)

Les bubble sizes pre-calcules sont invalides par :

| Trigger | Detection | Action |
|---------|-----------|--------|
| Dynamic Type change | `@Environment(\.dynamicTypeSize)` dans root view | `layoutVersion` increment global, GRDB batch update `SET layoutVersion = 0` |
| Device rotation | `maxWidth` change | Recalcul seulement si `layoutMaxWidth != currentMaxWidth` |
| Message edit | `message:edited` event | Recalcul pour ce message seulement |
| Reaction add/remove | `reaction:added/removed` | Recalcul (reaction bar height change) |
| Translation toggle | User switches language | Recalcul (translated text length different) |

```swift
static var currentLayoutVersion: Int = 1

/// Appele quand Dynamic Type change
static func incrementLayoutVersion() {
    currentLayoutVersion += 1
    // Background: UPDATE messages SET layoutVersion = 0 (force recalcul)
}
```

Le `BubbleLayoutCalculator` verifie `record.layoutVersion == currentLayoutVersion && record.layoutMaxWidth == currentMaxWidth` avant de retourner le cache.

---

## Section 4A : RetryEngine — Reactif (I9 fix)

### ValueObservation au lieu de polling

```swift
public actor RetryEngine {
    private var observationCancellable: AnyDatabaseCancellable?

    func start(dbPool: DatabasePool) {
        // Observer les messages en state .queued
        let observation = ValueObservation.tracking { db in
            try MessageRecord
                .filter(Column("state") == MessageState.queued.rawValue)
                .order(Column("createdAt").asc)
                .fetchAll(db)
        }

        observationCancellable = observation.start(in: dbPool) { [weak self] queuedMessages in
            Task { await self?.processQueue(queuedMessages) }
        }
    }
}
```

Zero CPU quand rien a retry. Declenche instantanement quand un message passe en `.queued`.

---

## Section 4B : ReconnectionGapDetector — Pagination (I8 fix)

```swift
private func syncGap(for conversationId: String) async {
    var cursor: Date = lastReceivedTimestamps[conversationId] ?? Date().addingTimeInterval(-3600)
    var totalFetched = 0
    let maxTotal = 1000 // Safety cap

    // Pagination jusqu'a ce que le gap soit comble
    while totalFetched < maxTotal {
        let page = try? await messageService.list(
            conversationId: conversationId,
            after: cursor,
            limit: 100
        )
        guard let messages = page, !messages.isEmpty else { break }

        // Dedup + persist
        let existingIds = try? await persistence.serverIds(for: conversationId)
        let newMessages = messages.filter { !(existingIds ?? []).contains($0.id) }

        if !newMessages.isEmpty {
            await persistence.bufferIncoming(newMessages.map { IncomingMessage(from: $0) })
        }

        cursor = messages.last!.createdAt
        totalFetched += messages.count

        if messages.count < 100 { break } // Derniere page
    }

    lastReceivedTimestamps[conversationId] = cursor
}
```

Plus de cap a 100. Pagine jusqu'a combler le gap, avec un safety cap a 1000 messages.

---

## Section 5 : MediaSnapshotStore + ThumbnailPrefetcher

*Inchange depuis v1 — valide par la review.*

---

## Section 6 : Orchestration

### DependencyContainer coexistence avec singletons (I7 fix)

```swift
public final class DependencyContainer: Sendable {
    static let shared = DependencyContainer() // Singleton global

    let dbPool: DatabasePool                  // NOUVEAU — dedie aux messages
    let persistence: MessagePersistenceActor
    let mediaSnapshots: MediaSnapshotStore
    let retryEngine: RetryEngine
    let gapDetector: ReconnectionGapDetector
    let thumbnailPrefetcher: ThumbnailPrefetcher

    // EXISTANTS — references, pas remplaces
    let socketManager: MessageSocketManager   // = .shared (existant)
    let networkMonitor: NetworkMonitor        // = .shared (existant)

    init() {
        // Le nouveau DatabasePool est SEPARE de l'ancien AppDatabase/GRDBCacheStore
        // L'ancien CacheCoordinator continue de gerer :
        //   - conversations, participants, profiles, feed, stories, notifications
        // Le nouveau MessagePersistenceActor gere SEULEMENT :
        //   - messages, translations, transcriptions, audio_translations, pending_ids, local_attachments
        let encryptionKey = KeychainManager.shared.messageDbKey()
        let dbPath = Self.databasePath()
        self.dbPool = try! DatabasePool(path: dbPath, configuration: Self.dbConfig(key: encryptionKey))
        self.persistence = try! MessagePersistenceActor(dbPool: dbPool)
        // ... rest of init
    }
}
```

**Regle de coexistence** :
- `CacheCoordinator.shared` reste en place pour tout SAUF les messages
- Les methodes message de `CacheCoordinator` sont marquees `@available(*, deprecated)` et redirigent vers `DependencyContainer.shared.persistence`
- Migration progressive : les consumers migrent un par un vers le nouveau système
- A terme (sprint futur), `CacheCoordinator` sera refactorise pour utiliser le meme pattern actor

### Pipeline de decryptage E2EE (I6 fix)

Le decryptage se fait dans le `MessageStore`, entre la lecture GRDB et l'exposition au SwiftUI :

```swift
@Observable
@MainActor
public final class MessageStore {
    private func refreshFromDB() async {
        var records = try? persistence.reader.read { /* ... fetch ... */ }
        guard var records else { return }

        // Decryptage in-place pour les messages E2EE
        for i in records.indices where records[i].isEncrypted {
            if let decrypted = try? await SessionManager.shared.decrypt(
                records[i].encryptedPayload,
                for: conversationId
            ) {
                records[i].content = decrypted
            }
        }

        messages = records
    }
}
```

Le contenu reste chiffre en GRDB (securise). Le decryptage se fait a la lecture, lazy, seulement pour les messages dans la fenetre visible.

### Migration depuis l'ancien schema (I5 fix)

```swift
/// Appele une fois au premier lancement apres update
static func migrateFromLegacyCache() async {
    let legacyCache = CacheCoordinator.shared.messages
    let newPersistence = DependencyContainer.shared.persistence

    // Pour chaque conversation en cache legacy
    for convId in await legacyCache.allKeys() {
        let cached = await legacyCache.load(for: convId)
        guard case .fresh(let messages, _) = cached,
              let messages = messages as? [MeeshyMessage] else { continue }

        // Convertir MeeshyMessage -> MessageRecord
        for msg in messages {
            let record = MessageRecord(fromLegacy: msg)
            try? await newPersistence.insertOptimistic(record)
        }
    }

    // Marquer la migration comme faite
    UserDefaults.standard.set(true, forKey: "message_db_migrated_v1")

    // Purger l'ancien cache messages (garder conversations, profiles, etc.)
    await legacyCache.removeAll()
}
```

- Executee une fois au premier lancement post-update
- Non-bloquante (background)
- L'ancien cache reste lisible pendant la migration
- `UserDefaults` flag empeche la re-execution

---

## Section 7 : Socket Event Coverage (C1 fix)

### Events geres par ConversationSocketHandler refactore

Chaque event ecrit dans le `MessagePersistenceActor` (pas dans le ViewModel). ValueObservation propage vers le MessageStore automatiquement.

| Event | Publisher | Action dans l'Actor | Coalescing |
|-------|-----------|---------------------|------------|
| `message:new` | `messageReceived` | `reconcileIncoming()` + thumbnail prefetch | Non (immediate) |
| `message:edited` | `messageEdited` | `markEdited(localId, newContent, editedAt)` | Non |
| `message:deleted` | `messageDeleted` | `markDeleted(localId, deletedAt)` | Non |
| `reaction:added` | `reactionAdded` | `updateReactions(localId, reactionsJson, count)` | Non |
| `reaction:removed` | `reactionRemoved` | `updateReactions(localId, reactionsJson, count)` | Non |
| `reaction:sync` | `reactionSynced` | Bulk `updateReactions()` pour toute la conversation | Non |
| `read-status:updated` | `readStatusUpdated` | `bufferBatchDelivery(conversationId, event)` | Via AsyncStream |
| `typing:start` | `typingStarted` | Callback ViewModel (pas de persistence) | Non |
| `typing:stop` | `typingStopped` | Callback ViewModel (pas de persistence) | Non |
| `message:translation` | `translationReceived` | `saveTranslation(TranslationRecord)` | `.collect(.byTime, 80ms)` |
| `message:translated` | `translationReceived` | Meme que ci-dessus | `.collect(.byTime, 80ms)` |
| `audio:transcription-ready` | `transcriptionReady` | `saveTranscription(TranscriptionRecord)` | Non |
| `audio:translation-ready` | `audioTranslationReady` | `saveAudioTranslation(AudioTranslationRecord)` | Non |
| `audio:translations-progressive` | `audioTranslationProgressive` | `saveAudioTranslation(status: progressive)` | Non |
| `audio:translations-completed` | `audioTranslationCompleted` | `saveAudioTranslation(status: completed)` | Non |
| `attachment-status:updated` | `attachmentStatusUpdated` | Update `updatedAt` sur le message | Non |
| `message:consumed` | `messageConsumed` | `updateViewOnceCount(localId, count)` + evict media | Non |
| `location:live-started` | `liveLocationStarted` | Callback ViewModel (in-memory) | Non |
| `location:live-updated` | `liveLocationUpdated` | Callback ViewModel (in-memory) | Non |
| `location:live-stopped` | `liveLocationStopped` | Callback ViewModel (in-memory) | Non |
| `conversation:closed` | `conversationClosed` | Callback ViewModel `isConversationClosed = true` | Non |
| `conversation:join-error` | `conversationJoinError` | Callback ViewModel `handleAccessRevoked()` | Non |
| `participant:role-updated` | `participantRoleUpdated` | Callback ViewModel | Non |
| `system:message` | `systemMessageReceived` | `insertOptimistic()` avec `messageSource = .system` | Non |
| `mention:created` | `mentionCreated` | Callback ViewModel (badge) | Non |

### Events geres par CacheCoordinator (INCHANGES)

Ces events ne touchent PAS le MessagePersistenceActor — ils restent dans le CacheCoordinator existant :

| Event | Scope |
|-------|-------|
| `conversation:unread-updated` | Conversation list unread counts |
| `user:status` | Online/offline presence |
| `conversation:updated` | Conversation metadata (title, avatar) |
| `conversation:participant-left` | Participant list |
| `conversation:participant-banned/unbanned` | Participant list |
| `user:preferences-updated` | Pin/mute/archive |
| `conversation:stats` | Member count, message count |
| `notification:*` (4 events) | In-app notifications |
| `conversation:online-stats` | Online user count |

### Events geres par Call system (INCHANGES)

Les 9 events `call:*` restent dans le system WebRTC existant. Hors scope.

### Events geres par SocialSocketManager (INCHANGES)

Les 17 events social (posts, stories, comments) restent dans le SocialSocketManager existant. Hors scope.

---

## Section 8 : Conversation List Reactivity (C4 fix)

### Principe

La conversation list (`ConversationListViewModel`) doit reagir en temps reel aux changements de messages. Le nouveau `MessagePersistenceActor` expose un signal leger pour ca.

### Mecanisme

```swift
/// Signal emis par l'actor quand un message est insere/modifie dans une conversation
/// Utilise par la ConversationList pour mettre a jour lastMessage + unreadCount
extension MessagePersistenceActor {
    /// Observe les changements de "dernier message" par conversation
    nonisolated func observeConversationPreviews() -> DatabaseRegionObservation {
        DatabaseRegionObservation(tracking:
            MessageRecord.select(Column("conversationId"), max(Column("createdAt")))
                .group(Column("conversationId"))
                .databaseRegion
        )
    }
}
```

### Integration avec ConversationListViewModel

```swift
// Dans ConversationListViewModel
private func observeMessageChanges() {
    let observation = DependencyContainer.shared.persistence.observeConversationPreviews()

    observation.start(in: DependencyContainer.shared.dbPool) { [weak self] _ in
        Task { @MainActor in
            // Refresh seulement les previews (lastMessage, unreadCount)
            await self?.refreshConversationPreviews()
        }
    }
}

private func refreshConversationPreviews() async {
    // Query leger : dernier message par conversation (pas 200 messages)
    let previews = try? DependencyContainer.shared.persistence.reader.read { db in
        try MessageRecord
            .select(Column("conversationId"), max(Column("createdAt")).forKey("lastMessageAt"))
            .group(Column("conversationId"))
            .asRequest(of: ConversationPreview.self)
            .fetchAll(db)
    }
    // Merge avec les conversations existantes (update lastMessage + sort)
}
```

### Ce qui NE change PAS dans ConversationListViewModel

- Les subscriptions socket pour `typingStarted/Stopped`, `conversationUpdated`, `userPreferencesUpdated`, `participantBanned/Unbanned`, `didReconnect` restent identiques
- Le `ConversationSyncEngine` reste la source de verite pour la liste des conversations
- Le `CacheCoordinator.conversations` reste pour le cache des metadonnees conversation
- Seule la source de "lastMessage preview" change : `MessagePersistenceActor` au lieu de `CacheCoordinator.messages`

---

## Section 9 : Tests

*Test pyramid et patterns inchanges depuis v1. Ajouts :*

### Tests supplementaires pour les corrections

| Test | Correction | Verifie |
|------|-----------|---------|
| TranslationRecord persiste et requetable par messageLocalId+targetLanguage | C2 | Prisme Linguistique fonctionne offline |
| MessageRecord roundtrip avec tous les 35+ champs | C3 | Pas de champ perdu au encode/decode |
| Anchor-based window ne shift pas quand message arrive en bas | I3 | Scroll position preservee |
| Layout invalide quand Dynamic Type change | I4 | Bulles recalculees |
| Migration legacy MeeshyMessage -> MessageRecord | I5 | Pas de perte au premier lancement |
| Decryptage lazy dans MessageStore.refreshFromDB | I6 | Messages E2EE lisibles |
| RetryEngine declenche instantanement quand message passe en .queued | I9 | Pas de delai polling |
| GapDetector pagine au-dela de 100 messages | I8 | Reconnexion 2h OK |
| ConversationPreview updated quand message insere | C4 | Conversation list reactive |
| AsyncStream buffer traite les ops en ordre serial | C6 | Pas de re-entrancy |

---

## Files to create/modify

### New files (MeeshySDK)

| File | Component |
|------|-----------|
| `MeeshySDK/Models/MessageState.swift` | MessageState + MessageEvent enums |
| `MeeshySDK/Models/MessageStateMachine.swift` | Pure state machine struct |
| `MeeshySDK/Persistence/MessagePersistenceActor.swift` | Actor + GRDB write-through + AsyncStream buffer |
| `MeeshySDK/Persistence/MessageRecord.swift` | GRDB record (35+ fields) |
| `MeeshySDK/Persistence/TranslationRecord.swift` | Translation/Transcription/AudioTranslation records |
| `MeeshySDK/Persistence/PendingIdRecord.swift` | tempId -> serverId mapping |
| `MeeshySDK/Persistence/MessageDatabaseMigrations.swift` | 6 GRDB migrations |
| `MeeshySDK/Persistence/BubbleLayoutCalculator.swift` | Pre-computed layout + invalidation |
| `MeeshySDK/Persistence/RetryEngine.swift` | Reactive retry via ValueObservation |
| `MeeshySDK/Persistence/ReconnectionGapDetector.swift` | Paginated gap sync |
| `MeeshySDK/Persistence/MediaSnapshotStore.swift` | Media snapshot actor |
| `MeeshySDK/Persistence/ThumbnailPrefetcher.swift` | mmap + CGImageSource |
| `MeeshySDK/Persistence/LegacyMigration.swift` | One-time migration from old cache |

### New files (App layer)

| File | Component |
|------|-----------|
| `Meeshy/Core/DependencyContainer.swift` | Root DI (coexists with CacheCoordinator) |
| `Meeshy/Features/Main/Stores/MessageStore.swift` | @Observable + DatabaseRegionObservation + anchor windowing |
| `Meeshy/Features/Main/Coordinators/MediaAttachmentCoordinator.swift` | Upload orchestration |

### Modified files

| File | Changes |
|------|---------|
| `ConversationViewModel.swift` | Strip to orchestrator, delegate to Store/Actor |
| `ConversationSocketHandler.swift` | Write to Actor (all 25 events), callback for non-persisted state |
| `ConversationListViewModel.swift` | Add `observeMessageChanges()` for preview updates |
| `MeeshyApp.swift` | Init DependencyContainer, run legacy migration once |
| `ConversationView.swift` | Use store.messages, iOS 17/18 conditional scroll APIs |
| `CacheCoordinator.swift` | Deprecate message methods, redirect to new actor |

### Removed/replaced

| Target | Reason |
|--------|--------|
| `CacheCoordinator` message methods | Deprecated, redirected to MessagePersistenceActor |
| Dirty-tracking debounce (messages only) | Replaced by write-through |
| In-memory `pendingServerIds` dict | Replaced by GRDB `pending_ids` table |
| In-memory `translationCache`/`transcriptionCache`/`audioTranslationCache` | Replaced by GRDB tables |

### Test files

| File | Tests |
|------|-------|
| `MeeshySDKTests/MessageStateMachineTests.swift` | ~15 tests |
| `MeeshySDKTests/BubbleLayoutCalculatorTests.swift` | ~8 tests (+ invalidation) |
| `MeeshySDKTests/MessagePersistenceActorTests.swift` | ~15 tests (+ translations, reactions, edit/delete) |
| `MeeshySDKTests/MessageRecordTests.swift` | ~5 tests (roundtrip 35+ fields) |
| `MeeshySDKTests/RetryEngineTests.swift` | ~5 tests |
| `MeeshySDKTests/MediaSnapshotStoreTests.swift` | ~5 tests |
| `MeeshySDKTests/LegacyMigrationTests.swift` | ~3 tests |
| `MeeshyTests/Integration/MessagePipelineIntegrationTests.swift` | ~15 tests |
| `MeeshyTests/Integration/ConversationListReactivityTests.swift` | ~5 tests |
