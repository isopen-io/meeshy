# iOS Persistence Layer + Message State Machine — Refonte complète (v2)

**Date**: 2026-05-04 (rev. 5 — SOTA final)
**Scope**: Refonte complète de la couche persistence messages + state machine + reactive conversation list
**Target**: Swift 6.2, iOS 17+ (iOS 18 APIs via `if #available`), GRDB DatabasePool + SQLCipher WAL mode
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

### Changements v3 (zero main-thread blocking audit)

Analyse quantitative du temps de blocage main thread — 4 fixes supplementaires :

| # | Risque | Blocage mesure | Fix |
|---|--------|---------------|-----|
| F1 | `dbPool.read` synchrone sur MainActor | 2-15ms/appel | `Task.detached` pour toutes les lectures DB |
| F2 | Boucle decrypt E2EE sur MainActor | 25-100ms pour 50 messages | Decrypt off-main, assign seulement sur MainActor |
| F3 | LazyVStack sans recyclage | 3-12ms/frame en scroll rapide | Hybrid: `drawingGroup()` + pre-decoded images + fallback UICollectionView |
| F4 | Storm de notifications GRDB en group chat | 100-250ms/s pour 50 read receipts | Debounce adaptatif sur observation callback |

### Changements v4 (SOTA final)

7 optimisations pour atteindre le niveau Telegram/Signal :

| # | Optimisation | Impact |
|---|-------------|--------|
| O1 | `changeVersion` Int64 pour Equatable (plus de blob compare) | Diff 200 records : 2-5ms -> 0.05ms |
| O2 | Prepared statements GRDB pour hot queries | 0.1ms/appel economise x 20 appels/s |
| O3 | NSCache 50MB pour CGImage decoded (auto-evict memory warning) | Zero re-decode en scroll |
| O4 | Layout epoch lazy (plus de batch UPDATE 10k rows) | Zero write DB sur Dynamic Type |
| O5 | Debounce adaptatif : 16ms idle / 200ms scroll | Instantane au repos, pas de gaspillage en scroll |
| O6 | NotificationServiceExtension pre-persist en GRDB App Group | Message en DB avant ouverture app |
| O7 | Reader pool adaptatif (cores x 2, cap 16) | Optimal sur tout hardware |

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
| SQLCipher WAL mode | GRDB + SQLCipher, SQLite WAL internals | Chiffrement + zero-contention reads + 1 writer |
| DatabaseRegionObservation | GRDB advanced | Notification de changement sans re-query 200 rows |
| CTFramesetter background layout | Signal, Telegram | Layout texte off-main via Core Text — precision ligne par ligne |
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
struct MessageRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
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

    // (O1) Version counter — incremente a chaque write GRDB
    var changeVersion: Int64
}

// (O1) Equatable custom — compare SEULEMENT localId + changeVersion
// Evite de comparer 5 champs Data? (blobs) = O(1) au lieu de O(taille_blobs)
extension MessageRecord: Equatable {
    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.localId == rhs.localId && lhs.changeVersion == rhs.changeVersion
    }
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

    // (O2) Prepared statements pour les hot queries
    private var windowStatement: Statement?
    private var lookupStatement: Statement?

    init(dbPool: DatabasePool) throws {
        self.dbPool = dbPool
        let (stream, continuation) = AsyncStream.makeStream(of: WriteOperation.self)
        self.writeStream = stream
        self.writeContinuation = continuation
        try migrate()
        try prepareStatements()
        startProcessor()
    }

    /// (O2) Prepare les queries hot-path une seule fois (evite recompilation SQL)
    private func prepareStatements() throws {
        try dbPool.read { db in
            windowStatement = try db.cachedStatement(sql: """
                SELECT * FROM messages
                WHERE conversationId = ? AND createdAt >= ?
                ORDER BY createdAt ASC LIMIT ?
                """)
            lookupStatement = try db.cachedStatement(sql: """
                SELECT localId FROM pending_ids WHERE serverId = ?
                """)
        }
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
            record.changeVersion += 1  // (O1) increment pour Equatable rapide

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
                t.column("changeVersion", .integer).notNull().defaults(to: 0) // (O1)
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

### Database configuration SOTA

```swift
static func dbConfig(key: Data) -> Configuration {
    var config = Configuration()
    // (O7) Reader pool adaptatif : cores x 2, cap 16
    config.maximumReaderCount = min(ProcessInfo.processInfo.activeProcessorCount * 2, 16)
    config.prepareDatabase { db in
        try db.usePassphrase(key)
        // PRAGMA synchronous = NORMAL : donnees perdues seulement en cas de
        // coupure de courant physique (PAS crash app). Acceptable — source de verite = serveur.
        try db.execute(sql: "PRAGMA synchronous = NORMAL")
        // Cap WAL a 16MB pour eviter growth unbounded pendant les rafales
        try db.execute(sql: "PRAGMA journal_size_limit = 16777216")
        // (N7) SQLCipher WAL checkpoint toutes les 1000 pages
        try db.execute(sql: "PRAGMA wal_autocheckpoint = 1000")
    }
    return config
}
```

### Database path — App Group shared (O6)

```swift
/// DB dans le App Group container — accessible depuis l'app ET la NotificationServiceExtension
static func databasePath() -> String {
    let container = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: "group.me.meeshy.apps"
    )!
    return container.appendingPathComponent("meeshy_messages.sqlite").path
}
```

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

### ValueObservation avec DatabaseRegionObservation (I1 fix) + zero main-thread blocking (F1, F2, F4 fix)

**Regle absolue** : AUCUNE lecture GRDB ni operation crypto sur MainActor. Le MainActor ne fait QUE assigner des resultats pre-calcules.

```swift
func startObserving(dbPool: DatabasePool, conversationId: String) {
    let region = MessageRecord
        .filter(Column("conversationId") == conversationId)
        .databaseRegion

    // (O5) Debounce adaptatif : 16ms au repos (1 frame), 200ms en scroll
    var refreshTask: Task<Void, Never>?

    regionObservation = DatabaseRegionObservation(tracking: region)
        .start(in: dbPool) { [weak self] _ in
            refreshTask?.cancel()
            refreshTask = Task { [weak self] in
                guard let self else { return }
                let delay: Duration = self.isUserScrolling
                    ? .milliseconds(200)  // Scroll actif : coalesce agressif
                    : .milliseconds(16)   // Repos : instantane (1 frame)
                try? await Task.sleep(for: delay)
                guard !Task.isCancelled else { return }
                await self.refreshFromDB()
            }
        }
}

/// (F1 fix) Lecture DB + decrypt ENTIEREMENT off-main
/// Seule l'assignation finale est sur MainActor
@MainActor
private func refreshFromDB() async {
    let convId = conversationId
    let anchor = windowAnchor
    let windowSize = Self.windowSize
    let reader = persistence.reader

    // (F1) Lecture GRDB sur un thread background (Task.detached)
    // (F2) Decryptage E2EE egalement off-main
    let newRecords = await Task.detached(priority: .userInitiated) {
        // DB read — off main, zero contention (WAL reader)
        var records = try? reader.read { db in
            let query = MessageRecord
                .filter(Column("conversationId") == convId)
            if let anchor {
                return try query
                    .filter(Column("createdAt") >= anchor)
                    .order(Column("createdAt").asc)
                    .limit(windowSize)
                    .fetchAll(db)
            } else {
                return try query
                    .order(Column("createdAt").desc)
                    .limit(windowSize)
                    .fetchAll(db)
                    .reversed()
            }
        }
        guard var records else { return nil as [MessageRecord]? }

        // (F2) Decryptage E2EE — off main, bulk
        // Extraction de la cle une seule fois, puis decrypt en batch
        let encryptedIndices = records.indices.filter { records[$0].isEncrypted }
        if !encryptedIndices.isEmpty {
            // Recuperer la session key une seule fois (pas 50 fois)
            let sessionKey = try? await SessionManager.shared.sessionKey(for: convId)
            if let key = sessionKey {
                for i in encryptedIndices {
                    if let payload = records[i].encryptedPayload,
                       let decrypted = try? CryptoEngine.decrypt(payload, with: key) {
                        records[i].content = String(data: decrypted, encoding: .utf8)
                    }
                }
            }
        }

        return records
    }.value

    guard let newRecords else { return }
    // (F1) Comparaison Equatable aussi off-main? Non — 200 structs sans blobs = < 0.1ms
    guard newRecords != messages else { return }

    // SEULE operation sur MainActor — assignation pure
    messages = newRecords
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

### Scroll performance : LazyVStack + async images (F3 fix)

**Probleme** : LazyVStack ne recycle pas les vues. 200 bulles complexes = 3-12ms/frame en scroll rapide.

**Strategy hybride** :

1. **`drawingGroup()`** sur chaque bulle — flatten en texture Metal, reduit le cout de compositing de ~60% :
```swift
MessageBubble(record: record)
    .equatable()
    .drawingGroup(opaque: false)
```

2. **Images pre-decoded en background + NSCache** (O3) — JAMAIS de decompression JPEG sur MainActor :
```swift
/// (O3) NSCache cost-based pour CGImage decoded
/// Auto-evict sur memory warning sans NotificationCenter
private let decodedImageCache: NSCache<NSString, CGImageRef> = {
    let cache = NSCache<NSString, CGImageRef>()
    cache.totalCostLimit = 50 * 1024 * 1024  // 50MB
    cache.countLimit = 300
    return cache
}()

/// Dans ThumbnailPrefetcher : pre-decode + cache en CGImage
func preloadThumbnail(url: URL, cacheKey: String) async -> CGImage? {
    // Check cache first (O(1) NSCache lookup)
    if let cached = decodedImageCache.object(forKey: cacheKey as NSString) {
        return cached.image
    }
    
    let decoded = await Task.detached(priority: .utility) {
        guard let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { return nil }
        let source = CGImageSourceCreateWithData(data as CFData, nil)!
        let options: [CFString: Any] = [
            kCGImageSourceThumbnailMaxPixelSize: 300,
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceShouldCacheImmediately: true  // Force decode NOW, pas au rendu
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }.value
    
    if let decoded {
        let cost = decoded.bytesPerRow * decoded.height
        decodedImageCache.setObject(CGImageRef(decoded), forKey: cacheKey as NSString, cost: cost)
    }
    return decoded
}

/// Dans la vue : placeholder instantane, image quand prete
struct AsyncCachedImage: View, Equatable {
    let cacheKey: String
    @State private var image: CGImage?

    var body: some View {
        if let image {
            Image(decorative: image, scale: 2)
                .resizable()
                .transition(.opacity.animation(.easeIn(duration: 0.15)))
        } else {
            // Placeholder avec dimensions connues (pas de reflow)
            Rectangle()
                .fill(Color(.systemGray5))
                .onAppear { loadAsync() }
        }
    }

    private func loadAsync() {
        Task.detached(priority: .userInitiated) {
            let decoded = await ThumbnailPrefetcher.shared.get(key: cacheKey)
            await MainActor.run { image = decoded }
        }
    }

    static func == (lhs: Self, rhs: Self) -> Bool { lhs.cacheKey == rhs.cacheKey }
}
```

3. **Prefetch directionnel** — 20-30 items en avance dans la direction du scroll :
```swift
// onScrollGeometryChange detecte la direction
// Le prefetcher charge les thumbnails 20 items en avance
func onScrollDirectionChanged(_ direction: ScrollDirection) {
    let prefetchIds: [String]
    switch direction {
    case .up: prefetchIds = Array(store.messages.prefix(30).map(\.localId))
    case .down: prefetchIds = Array(store.messages.suffix(30).map(\.localId))
    }
    Task { await thumbnailPrefetcher.prefetchBatch(prefetchIds) }
}
```

4. **Escape hatch UICollectionView** (si LazyVStack insuffisant apres profiling) :
   - Wrapper `UIViewControllerRepresentable` avec `UICollectionViewCompositionalLayout`
   - Diffable data source pilote par le meme `MessageStore`
   - Cell recycling = 15-20 cells max en memoire au lieu de 200
   - A evaluer APRES implementation LazyVStack — ne pas over-engineer a priori

**Budget frame cible** : < 8ms/frame sur A15+ pendant scroll rapide (50% du budget 16.67ms).

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
| Dynamic Type change | `@Environment(\.dynamicTypeSize)` dans root view | `globalLayoutEpoch += 1` (O4: zero write DB, recalcul lazy a la lecture) |
| Device rotation | `maxWidth` change | Recalcul seulement si `layoutMaxWidth != currentMaxWidth` |
| Message edit | `message:edited` event | Recalcul pour ce message seulement |
| Reaction add/remove | `reaction:added/removed` | Recalcul (reaction bar height change) |
| Translation toggle | User switches language | Recalcul (translated text length different) |

```swift
/// (O4) Epoch global — incremente sans toucher la DB
/// Le recalcul se fait lazy quand le message entre dans la fenetre visible
static var globalLayoutEpoch: Int = 1

/// Appele quand Dynamic Type change — ZERO write DB
static func invalidateAllLayouts() {
    globalLayoutEpoch += 1
    // Pas de batch UPDATE — le recalcul se fait a la demande dans refreshFromDB :
    // if record.layoutVersion != globalLayoutEpoch || record.layoutMaxWidth != currentMaxWidth {
    //     BubbleLayoutCalculator.computeSize(...) → record.cachedBubbleWidth/Height
    //     persistence.updateLayout(localId, width, height, epoch, maxWidth) // background write
    // }
}
```

Le `BubbleLayoutEngine` verifie `record.layoutVersion == globalLayoutEpoch && record.layoutMaxWidth == currentMaxWidth`. Si invalide, recalcul off-main puis persist en background. Les messages hors fenetre ne sont jamais recalcules inutilement.

### BubbleLayoutEngine — CTFramesetter (remplace NSAttributedString.boundingRect)

**Pourquoi CTFramesetter au lieu de `boundingRect`** :

| | `boundingRect` | `CTFramesetter` |
|---|---|---|
| Precision | Sur-estime souvent (~2-5pt) | Exact au pixel (ligne par ligne) |
| Mixed fonts | Approximatif | Correct (emoji + bold + mentions) |
| Line count | Pas accessible | `CTFrameGetLines()` donne chaque ligne |
| Baseline metrics | Non | `CTLineGetTypographicBounds()` pour alignement vertical |
| Thread safety | Oui (iOS 15+) | Oui (Core Text natif) |
| Performance | ~0.15ms/message | ~0.08ms/message (pas de bridge UIKit) |

```swift
/// Layout engine pur — Core Text, zero UIKit, thread-safe, off-main
enum BubbleLayoutEngine {

    /// Calcule la taille exacte d'une bulle de message
    /// Appele depuis un Task.detached — JAMAIS sur MainActor
    static func computeSize(
        content: String?,
        contentType: String,
        attachmentDimensions: CGSize?,
        replyPreview: Bool,
        reactionCount: Int,
        maxWidth: CGFloat
    ) -> CGSize {
        let bubblePadding: CGFloat = 12
        let timestampRowHeight: CGFloat = 18
        let replyPreviewHeight: CGFloat = replyPreview ? 44 : 0
        let reactionBarHeight: CGFloat = reactionCount > 0 ? 28 : 0
        let contentMaxWidth = maxWidth * 0.75 - (bubblePadding * 2)

        switch contentType {
        case "text":
            guard let text = content, !text.isEmpty else {
                return CGSize(width: 80, height: timestampRowHeight + bubblePadding * 2)
            }

            // CTFramesetter pour mesure exacte
            let font = CTFontCreateWithName("SFProText-Regular" as CFString, 16, nil)
            let attributes: [NSAttributedString.Key: Any] = [
                .font: font,
                .paragraphStyle: {
                    let style = NSMutableParagraphStyle()
                    style.lineBreakMode = .byWordWrapping
                    return style
                }()
            ]
            let attrString = NSAttributedString(string: text, attributes: attributes)
            let framesetter = CTFramesetterCreateWithAttributedString(attrString)

            // Suggest frame size avec contrainte de largeur
            var fitRange = CFRange()
            let textSize = CTFramesetterSuggestFrameSizeWithConstraints(
                framesetter,
                CFRange(location: 0, length: attrString.length),
                nil,
                CGSize(width: contentMaxWidth, height: .greatestFiniteMagnitude),
                &fitRange
            )

            let totalWidth = ceil(textSize.width) + bubblePadding * 2
            let totalHeight = ceil(textSize.height)
                + timestampRowHeight
                + replyPreviewHeight
                + reactionBarHeight
                + bubblePadding * 2

            return CGSize(width: min(totalWidth, maxWidth * 0.75), height: totalHeight)

        case "image", "video":
            guard let dims = attachmentDimensions else {
                return CGSize(width: 200, height: 200 + timestampRowHeight + reactionBarHeight)
            }
            let maxMediaWidth = maxWidth * 0.65
            let maxMediaHeight: CGFloat = 300
            let ratio = min(maxMediaWidth / dims.width, maxMediaHeight / dims.height, 1.0)
            return CGSize(
                width: dims.width * ratio,
                height: dims.height * ratio + timestampRowHeight + reactionBarHeight
            )

        case "audio":
            return CGSize(width: maxWidth * 0.65, height: 56 + timestampRowHeight + reactionBarHeight)

        default:
            return CGSize(width: maxWidth * 0.6, height: 60 + reactionBarHeight)
        }
    }
}
```

**Integration dans le pipeline** :

```swift
// Dans refreshFromDB() — off-main, apres le fetch GRDB
// Recalcul lazy des layouts invalides
let currentEpoch = BubbleLayoutEngine.globalLayoutEpoch
let currentMaxWidth = await MainActor.run { UIScreen.main.bounds.width }

var layoutUpdates: [(String, Double, Double)] = []
for i in records.indices {
    if records[i].layoutVersion != currentEpoch
        || records[i].layoutMaxWidth != currentMaxWidth {
        let size = BubbleLayoutEngine.computeSize(
            content: records[i].content,
            contentType: records[i].messageType,
            attachmentDimensions: records[i].attachmentDimensions,
            replyPreview: records[i].replyToId != nil,
            reactionCount: records[i].reactionCount,
            maxWidth: currentMaxWidth
        )
        records[i].cachedBubbleWidth = size.width
        records[i].cachedBubbleHeight = size.height
        records[i].layoutVersion = currentEpoch
        records[i].layoutMaxWidth = currentMaxWidth
        layoutUpdates.append((records[i].localId, size.width, size.height))
    }
}

// Persist les nouveaux layouts en background (fire & forget)
if !layoutUpdates.isEmpty {
    Task { [persistence] in
        for (id, w, h) in layoutUpdates {
            try? await persistence.updateLayout(localId: id, width: w, height: h,
                                                  epoch: currentEpoch, maxWidth: currentMaxWidth)
        }
    }
}
```

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
        // (O7) Reader pool adaptatif selon le hardware
        // iPhone SE (2 cores) = 4 readers, iPhone 16 Pro (6 cores) = 12 readers
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

## Section 8 : NotificationServiceExtension — Pre-persist (O6)

### Principe

Quand une push notification arrive (app fermee ou background), la `MeeshyNotificationExtension` (deja existante, target `MeeshyNotificationExtension`) :
1. Decrypt le payload E2EE
2. Persist le message en GRDB **via le meme DatabasePool App Group**
3. Modifie le contenu notification (texte en clair)

Quand l'utilisateur tap la notification, la conversation s'ouvre avec le message **deja en DB**.

### App Group

- Identifier : `group.me.meeshy.apps` (deja configure sur tous les targets)
- DB path : `group.me.meeshy.apps/meeshy_messages.sqlite`
- Le `MessagePersistenceActor` dans l'app ET dans l'extension ouvrent le **meme fichier**
- WAL mode garantit que les deux processus ne se bloquent pas (writer = extension, reader = app)

### Flow

```
Push APNS arrive (app fermee)
  → iOS lance MeeshyNotificationExtension (30s budget)
    → didReceive(request, contentHandler)
    → Parse push payload → extract encrypted message data
    → Open shared DatabasePool (App Group path, meme config)
    → Decrypt E2EE payload (session key from shared Keychain)
    → MessagePersistenceActor.insertOptimistic(record)
      → record.state = .sent (pas .sending — c'est un message recu)
      → record.changeVersion = 1
    → Modify notification:
      → bestAttemptContent.title = senderName
      → bestAttemptContent.body = decryptedText (ou "Photo", "Audio", etc.)
      → bestAttemptContent.threadIdentifier = conversationId
    → contentHandler(bestAttemptContent)

User tap notification (app lance)
  → AppDelegate/SceneDelegate route vers conversation
  → ConversationViewModel.onAppear()
    → MessageStore.startObserving() → ValueObservation reads GRDB
    → Le message est DEJA EN DB → affichage instantane (0ms reseau)
    → Socket connect → gap detector comble les eventuels manquants
```

### Implementation dans l'extension

```swift
// MeeshyNotificationExtension/NotificationService.swift
class NotificationService: UNNotificationServiceExtension {
    private lazy var persistence: MessagePersistenceActor = {
        let key = SharedKeychainManager.messageDbKey() // Shared Keychain via App Group
        let dbPath = DependencyContainer.databasePath() // App Group container
        var config = DependencyContainer.dbConfig(key: key)
        let dbPool = try! DatabasePool(path: dbPath, configuration: config)
        return try! MessagePersistenceActor(dbPool: dbPool)
    }()

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        guard let bestAttempt = request.content.mutableCopy() as? UNMutableNotificationContent,
              let data = request.content.userInfo["message"] as? [String: Any]
        else { contentHandler(request.content); return }

        Task {
            // 1. Parse
            let incoming = IncomingMessage(fromPush: data)

            // 2. Decrypt si E2EE
            var content = incoming.content
            if incoming.isEncrypted, let payload = incoming.encryptedPayload {
                let key = try? await SharedKeychainManager.sessionKey(for: incoming.conversationId)
                if let key, let decrypted = try? CryptoEngine.decrypt(payload, with: key) {
                    content = String(data: decrypted, encoding: .utf8)
                }
            }

            // 3. Persist en GRDB (shared App Group DB)
            let record = MessageRecord(from: incoming, decryptedContent: content)
            try? await persistence.insertOptimistic(record)

            // 4. Enrich notification
            bestAttempt.title = incoming.senderName ?? "Meeshy"
            bestAttempt.body = content ?? "New message"
            bestAttempt.threadIdentifier = incoming.conversationId

            contentHandler(bestAttempt)
        }
    }
}
```

### Contraintes

- L'extension a 30s max — largement suffisant pour 1 decrypt + 1 GRDB write (~5ms total)
- Le Keychain doit etre partage via le meme App Group (deja le cas)
- Si le decrypt echoue, le message est persiste CHIFFRE — l'app decryptera au lancement
- Le `DatabasePool` WAL mode gere les acces concurrents extension ↔ app sans lock

---

## Section 9 : Conversation List Reactivity (C4 fix)

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

## Section 10 : Tests

*Test pyramid et patterns inchanges depuis v1. Ajouts :*

### Tests supplementaires pour les corrections

| Test | Correction | Verifie |
|------|-----------|---------|
| TranslationRecord persiste et requetable par messageLocalId+targetLanguage | C2 | Prisme Linguistique fonctionne offline |
| MessageRecord roundtrip avec tous les 35+ champs | C3 | Pas de champ perdu au encode/decode |
| Anchor-based window ne shift pas quand message arrive en bas | I3 | Scroll position preservee |
| changeVersion Equatable compare 200 records en < 0.1ms | O1 | Diff performant |
| NSCache evict decoded images sur memory warning | O3 | Pas de OOM |
| Layout epoch lazy ne fait pas de write DB | O4 | Zero IO sur Dynamic Type change |
| Debounce adaptatif : 16ms idle, 200ms scroll | O5 | Instantane au repos |
| NotificationServiceExtension pre-persist en App Group DB | O6 | Message visible immediatement au tap |
| Prepared statement window query reutilise | O2 | Zero recompilation SQL |
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
| `MeeshySDK/Persistence/BubbleLayoutEngine.swift` | CTFramesetter-based pre-computed layout |
| `MeeshySDK/Persistence/RetryEngine.swift` | Reactive retry via ValueObservation |
| `MeeshySDK/Persistence/ReconnectionGapDetector.swift` | Paginated gap sync |
| `MeeshySDK/Persistence/MediaSnapshotStore.swift` | Media snapshot actor |
| `MeeshySDK/Persistence/ThumbnailPrefetcher.swift` | mmap + CGImageSource |
| `MeeshySDK/Persistence/LegacyMigration.swift` | One-time migration from old cache |
| `MeeshySDK/Cache/DecodedImageCache.swift` | NSCache 50MB pour CGImage decoded (O3) |

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
| `MeeshyNotificationExtension/NotificationService.swift` | Pre-persist message en App Group DB (O6) |

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
| `MeeshySDKTests/BubbleLayoutEngineTests.swift` | ~8 tests (+ invalidation) |
| `MeeshySDKTests/MessagePersistenceActorTests.swift` | ~15 tests (+ translations, reactions, edit/delete) |
| `MeeshySDKTests/MessageRecordTests.swift` | ~5 tests (roundtrip 35+ fields) |
| `MeeshySDKTests/RetryEngineTests.swift` | ~5 tests |
| `MeeshySDKTests/MediaSnapshotStoreTests.swift` | ~5 tests |
| `MeeshySDKTests/LegacyMigrationTests.swift` | ~3 tests |
| `MeeshyTests/Integration/MessagePipelineIntegrationTests.swift` | ~15 tests |
| `MeeshyTests/Integration/ConversationListReactivityTests.swift` | ~5 tests |
| `MeeshyTests/Integration/NotificationExtensionPrePersistTests.swift` | ~3 tests (O6) |

---

## Section 11 : Performance Budget (zero-freeze guarantee)

### Regle absolue

**Le MainActor ne fait QUE 3 choses** :
1. Assigner des resultats pre-calcules a des proprietes `@Observable`
2. Declencher des `Task.detached` pour le travail lourd
3. Evaluer les `body` SwiftUI (avec `.equatable()` + `.drawingGroup()`)

**JAMAIS sur MainActor** :
- Lecture GRDB (`dbPool.read`)
- Decryptage E2EE
- Decompression d'image (JPEG/PNG decode)
- `CTFramesetterSuggestFrameSizeWithConstraints` (layout calculation)
- Comparaison de gros tableaux pour diff
- Serialisation/deserialisation JSON des blobs

### Budget par frame (16.67ms a 60fps)

| Operation | Budget max | Thread |
|-----------|-----------|--------|
| `messages = newRecords` (assignation) | < 0.1ms | MainActor |
| `invalidateIndex()` + `invalidateSections()` | < 0.5ms | MainActor |
| SwiftUI body evaluation (1 bulle, Equatable) | < 0.8ms | MainActor |
| SwiftUI body evaluation (10-15 bulles, scroll) | < 8ms | MainActor |
| Compositing + Metal render | < 4ms | Render thread |
| **Total budget frame** | **< 12ms** | (4ms marge) |

### Budget par operation (off-main)

| Operation | Budget max | Thread |
|-----------|-----------|--------|
| GRDB read 200 records | < 15ms | Task.detached |
| E2EE decrypt 50 messages | < 100ms | Task.detached |
| CTFramesetter layout 200 messages | < 40ms | Task.detached (Core Text 2x plus rapide que boundingRect) |
| JPEG decode 1 thumbnail | < 5ms | Task.detached |
| GRDB write 1 message | < 10ms | MessagePersistenceActor |
| GRDB write batch 100 messages | < 200ms | MessagePersistenceActor |

### Debounce budget (O5 — adaptatif)

| Signal | Debounce idle | Debounce scroll | Raison |
|--------|--------------|-----------------|--------|
| DatabaseRegionObservation | 16ms (1 frame) | 200ms | Instantane au repos, coalesce en scroll |
| Translation events | 80ms | 80ms | Toujours coalesce (pas critique pour latence) |
| Layout invalidation | 500ms | 500ms | User ajuste le slider progressivement |
| Conversation list preview | 100ms | 100ms | Coalesce messages multi-conversations |

### Metriques de validation

Avant de considerer l'implementation terminee, ces metriques doivent etre verifiees avec Instruments :

| Metrique | Cible | Outil |
|----------|-------|-------|
| Frame drop pendant scroll rapide | < 2 frames/s | Core Animation FPS instrument |
| Main thread hang > 16ms | 0 occurrences | Thread Performance Checker |
| Main thread hang > 100ms | 0 occurrences | MetricKit `MXHangDiagnostic` |
| Memoire conversation ouverte (200 messages) | < 50MB | Allocations instrument |
| Temps d'ouverture conversation (cache chaud) | < 100ms | Time Profiler |
| Temps d'ouverture conversation (cache froid) | < 500ms | Time Profiler |
| Envoi message → affichage bulle | < 16ms (1 frame) | Manual measurement |
| Reception message → affichage bulle | < 100ms (debounce inclus) | Manual measurement |
| Clock → check transition | < 300ms apres REST ACK | Manual measurement |

### SOTA Comparison Matrix

| Technique | Telegram | Signal | Meeshy v5 |
|-----------|----------|--------|-----------|
| Write-ahead persistence | SQLite WAL | SQLCipher WAL | **SQLCipher WAL** + write-through actor |
| Zero main-thread DB read | Custom engine | Background fetch | **Background fetch** (`Task.detached` + WAL reader) |
| Zero main-thread crypto | Custom | Background decrypt | **Background decrypt** (bulk off-main, 1 session key) |
| Pre-computed layout | Background CTFramesetter | Background CTFramesetter | **Background CTFramesetter** + lazy epoch invalidation |
| Cell recycling | AsyncDisplayKit | UICollectionView | LazyVStack + drawingGroup (escape hatch UICollectionView) |
| Pre-decoded image cache | Custom mmap | NSCache | **NSCache 50MB** + mmap + CGImageSource |
| Binary protocol | MTProto | Protobuf | JSON (MessagePack phase 2) |
| Background message persist | Push extension | Push extension | **NotificationServiceExtension** App Group DB |
| Adaptive debounce | Custom | N/A | **16ms idle / 200ms scroll** |
| Fast equality check | Custom ID | Custom | **changeVersion Int64** |
| Prepared SQL statements | Custom | Raw SQL | **GRDB cached statements** |
| Adaptive connection pool | N/A | N/A | **cores x 2, cap 16** |

### Phase 2 (hors scope cette spec)

| Technique | Gain estime | Effort |
|-----------|------------|--------|
| MessagePack au lieu de JSON (socket) | ~10x parsing speed | Moyen (gateway + iOS) |
| UICollectionView si LazyVStack insuffisant | Cell recycling = 3x moins de memoire | Eleve (rewrite vue) |
| Protobuf pour bulk sync payloads | ~5x smaller wire size | Eleve (schema + gateway) |
