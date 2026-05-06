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

    // Pre-computed layout (CTFramesetter)
    var cachedBubbleWidth: Double?
    var cachedBubbleHeight: Double?
    var cachedLastLineWidth: Double?  // Largeur derniere ligne (pour timestamp inline)
    var cachedLineCount: Int?         // Nombre exact de lignes
    var cachedTimestampInline: Bool?  // true = timestamp a droite de la derniere ligne
    var layoutVersion: Int
    var layoutMaxWidth: Double?       // (I4) maxWidth utilise pour ce calcul

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
                t.column("cachedLastLineWidth", .double)
                t.column("cachedLineCount", .integer)
                t.column("cachedTimestampInline", .boolean)
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

        // (F2) Decryptage E2EE — off main, PROGRESSIF (Fix Scenario 1)
        // Phase 1 : decrypt les 20 derniers (viewport visible) → render immediat
        // Phase 2 : decrypt les 180 restants → update silencieux
        let encryptedIndices = records.indices.filter { records[$0].isEncrypted }
        if !encryptedIndices.isEmpty {
            let sessionKey = try? await SessionManager.shared.sessionKey(for: convId)
            if let key = sessionKey {
                // Phase 1 : les 20 derniers (bottom of conversation = visible)
                let viewportSize = 20
                let viewportIndices = encryptedIndices.suffix(viewportSize)
                for i in viewportIndices {
                    if let payload = records[i].encryptedPayload,
                       let decrypted = try? CryptoEngine.decrypt(payload, with: key) {
                        records[i].content = String(data: decrypted, encoding: .utf8)
                    }
                }
                // Retourne Phase 1 immediatement pour premier render
                // Phase 2 sera lancee apres l'assignation
                return (records, key, encryptedIndices.dropLast(viewportSize))
            }
        }

        return (records, nil, [])
    }.value

    guard let (newRecords, sessionKey, remainingEncrypted) = result else { return }
    guard newRecords != messages else { return }

    // Assignation Phase 1 — les 20 messages visibles sont decryptes
    messages = newRecords
    invalidateIndex()
    invalidateSections()

    // Phase 2 — decrypt les restants en background, update silencieux
    if let key = sessionKey, !remainingEncrypted.isEmpty {
        Task.detached(priority: .utility) { [weak self] in
            var updated = newRecords
            for i in remainingEncrypted {
                if let payload = updated[i].encryptedPayload,
                   let decrypted = try? CryptoEngine.decrypt(payload, with: key) {
                    updated[i].content = String(data: decrypted, encoding: .utf8)
                }
            }
            await MainActor.run { [weak self] in
                self?.messages = updated
                self?.invalidateIndex()
            }
        }
    }
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

### Message List : UICollectionView hybrid (WhatsApp-level scroll)

**Decision** : `UICollectionView` pour la message list (hot path scroll), SwiftUI pour tout le reste.
C'est le pattern Signal/Telegram : UIKit la ou la performance de scroll est critique.

#### Architecture

```
ConversationView (SwiftUI)
  └─ MessageListView (UIViewControllerRepresentable)
       └─ MessageListViewController (UIKit)
            ├─ UICollectionView + CompositionalLayout
            ├─ UICollectionViewDiffableDataSource<DateSection, String>
            ├─ Cell types: TextBubbleCell, MediaBubbleCell, AudioBubbleCell, SystemCell
            └─ Prefetching: UICollectionViewDataSourcePrefetching
  └─ InputBar (SwiftUI) — en bas
  └─ TypingIndicator (SwiftUI) — overlay
```

#### MessageListViewController

```swift
/// UIKit message list — cell recycling, ~15 cells en memoire, WhatsApp-level scroll
final class MessageListViewController: UIViewController {
    private var collectionView: UICollectionView!
    private var dataSource: UICollectionViewDiffableDataSource<DateSection, String>!
    private let store: MessageStore
    private var storeObservation: AnyCancellable?

    // MARK: - Section model
    struct DateSection: Hashable {
        let year: Int, month: Int, day: Int
    }

    init(store: MessageStore) {
        self.store = store
        super.init(nibName: nil, bundle: nil)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureCollectionView()
        configureDataSource()
        observeStore()
    }

    // MARK: - Collection View Setup

    private func configureCollectionView() {
        let layout = UICollectionViewCompositionalLayout { _, env in
            // Single column, full width, estimated height
            let itemSize = NSCollectionLayoutSize(
                widthDimension: .fractionalWidth(1.0),
                heightDimension: .estimated(60) // CTFramesetter pre-computed override below
            )
            let item = NSCollectionLayoutItem(layoutSize: itemSize)
            let group = NSCollectionLayoutGroup.vertical(layoutSize: itemSize, subitems: [item])
            let section = NSCollectionLayoutSection(group: group)
            section.interGroupSpacing = 2

            // Date header
            let headerSize = NSCollectionLayoutSize(
                widthDimension: .fractionalWidth(1.0),
                heightDimension: .estimated(32)
            )
            section.boundarySupplementaryItems = [
                .init(layoutSize: headerSize, elementKind: UICollectionView.elementKindSectionHeader, alignment: .top)
            ]
            return section
        }

        // Inverted (messages from bottom)
        layout.configuration.scrollDirection = .vertical

        collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)
        collectionView.transform = CGAffineTransform(scaleX: 1, y: -1) // Flip for bottom-up
        collectionView.keyboardDismissMode = .interactive
        collectionView.prefetchDataSource = self
        view.addSubview(collectionView)
        // ... constraints
    }

    // MARK: - Diffable Data Source

    private func configureDataSource() {
        // Cell registrations (UIKit modern API — no register/dequeue ceremony)
        let textCellReg = UICollectionView.CellRegistration<TextBubbleCell, String> {
            [weak self] cell, indexPath, localId in
            guard let record = self?.store.message(for: localId) else { return }
            cell.configure(with: record)
            cell.contentView.transform = CGAffineTransform(scaleX: 1, y: -1) // Un-flip
        }

        let mediaCellReg = UICollectionView.CellRegistration<MediaBubbleCell, String> {
            [weak self] cell, indexPath, localId in
            guard let record = self?.store.message(for: localId) else { return }
            cell.configure(with: record, imageCache: ThumbnailPrefetcher.shared.decodedImageCache)
            cell.contentView.transform = CGAffineTransform(scaleX: 1, y: -1)
        }

        let audioCellReg = UICollectionView.CellRegistration<AudioBubbleCell, String> {
            [weak self] cell, indexPath, localId in
            guard let record = self?.store.message(for: localId) else { return }
            cell.configure(with: record)
            cell.contentView.transform = CGAffineTransform(scaleX: 1, y: -1)
        }

        let systemCellReg = UICollectionView.CellRegistration<SystemMessageCell, String> {
            [weak self] cell, indexPath, localId in
            guard let record = self?.store.message(for: localId) else { return }
            cell.configure(with: record)
            cell.contentView.transform = CGAffineTransform(scaleX: 1, y: -1)
        }

        dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) {
            [weak self] collectionView, indexPath, localId in
            guard let record = self?.store.message(for: localId) else { return nil }
            switch record.messageType {
            case "image", "video": return collectionView.dequeueConfiguredReusableCell(using: mediaCellReg, for: indexPath, item: localId)
            case "audio": return collectionView.dequeueConfiguredReusableCell(using: audioCellReg, for: indexPath, item: localId)
            case _ where record.messageSource == "system": return collectionView.dequeueConfiguredReusableCell(using: systemCellReg, for: indexPath, item: localId)
            default: return collectionView.dequeueConfiguredReusableCell(using: textCellReg, for: indexPath, item: localId)
            }
        }
    }

    // MARK: - Observe MessageStore changes

    private func observeStore() {
        storeObservation = store.$messagesDidChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                self?.applySnapshot()
                self?.onNewMessageWhileScrolledUp()
            }
    }

    // MARK: - Infinite Scroll UP (load older messages)

    /// Flipped UICollectionView : "scroll up" = scroll vers index 0 visuellement en HAUT
    /// mais vers les items les plus anciens (prepend).
    /// DiffableDataSource gere automatiquement l'insertion.
    /// Le contentOffset est preserve par UICollectionView quand on insere AVANT le viewport.

    /// Detecte l'approche du haut (messages anciens) via delegate
    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        let offsetY = scrollView.contentOffset.y
        let contentHeight = scrollView.contentSize.height
        let frameHeight = scrollView.frame.height

        // FLIPPED : offset proche de contentHeight = visuellement en HAUT
        let distanceFromTop = contentHeight - offsetY - frameHeight
        if distanceFromTop < 500 && !isLoadingOlder { // 500pt threshold
            loadOlderMessages()
        }
    }

    private var isLoadingOlder = false

    private func loadOlderMessages() {
        guard let oldestDate = store.messages.first?.createdAt else { return }
        isLoadingOlder = true

        Task {
            let hasMore = await store.loadOlder(before: oldestDate)
            await MainActor.run {
                isLoadingOlder = false
                if hasMore {
                    // applySnapshot() sera appele via store observation
                    // DiffableDataSource insere les items en haut
                    // UICollectionView preserve contentOffset automatiquement
                    // car les nouveaux items sont AVANT le viewport visible
                }
            }
        }
    }

    /// applySnapshot() gere le diff — les nouveaux messages anciens
    /// sont prepend dans le snapshot, DiffableDataSource anime l'insertion
    private func applySnapshot() {
        var snapshot = NSDiffableDataSourceSnapshot<DateSection, String>()
        let calendar = Calendar.current

        // Les sections sont ordonnees chronologiquement
        // FLIPPED : la section la plus recente est visuellement en BAS (index 0 flipped)
        for section in store.sections {
            let dateSection = DateSection(
                year: section.date.year!, month: section.date.month!, day: section.date.day!
            )
            snapshot.appendSections([dateSection])
            snapshot.appendItems(section.messageIds, toSection: dateSection)
        }

        // animatingDifferences: true pour animations fluides
        // NSDiffableDataSourceSnapshot calcule le diff automatiquement
        // Les items prepend (anciens) s'inserent sans jump de scroll
        dataSource.apply(snapshot, animatingDifferences: true)
    }

    // MARK: - Scroll to bottom (Fix Scenario 2)

    func scrollToBottom(animated: Bool = true) {
        // FLIPPED : le "bottom" visuel = index 0 dans le data source
        collectionView.scrollToItem(
            at: IndexPath(item: 0, section: 0),
            at: .top,  // .top because flipped
            animated: animated
        )
    }

    // MARK: - New messages indicator

    /// Quand un message arrive et l'utilisateur est scrolle vers le haut
    /// on ne force PAS le scroll — on affiche un badge "N new messages"
    func onNewMessageWhileScrolledUp() {
        let isAtBottom = collectionView.contentOffset.y < 100 // FLIPPED: small offset = at bottom
        if !isAtBottom {
            // Callback vers le ViewModel pour afficher le badge
            onNewMessagesBadge?(store.unreadBelowCount)
        } else {
            // Auto-scroll vers le nouveau message
            scrollToBottom(animated: true)
        }
    }

    var onNewMessagesBadge: ((Int) -> Void)?
}

// MARK: - Prefetching (remplace le prefetch directionnel SwiftUI)

extension MessageListViewController: UICollectionViewDataSourcePrefetching {
    func collectionView(_ collectionView: UICollectionView, prefetchItemsAt indexPaths: [IndexPath]) {
        let localIds = indexPaths.compactMap { dataSource.itemIdentifier(for: $0) }
        let records = localIds.compactMap { store.message(for: $0) }

        // Prefetch thumbnails pour les messages media
        let mediaRecords = records.filter { ["image", "video"].contains($0.messageType) }
        Task {
            await ThumbnailPrefetcher.shared.prefetchBatch(mediaRecords.map(\.localId))
        }
    }

    func collectionView(_ collectionView: UICollectionView, cancelPrefetchingForItemsAt indexPaths: [IndexPath]) {
        // Cancel in-flight thumbnail downloads si scroll direction change
    }
}
```

#### Cell types — Pre-sized via CTFramesetter cache

```swift
/// Text bubble cell — utilise les dimensions pre-calculees par CTFramesetter
final class TextBubbleCell: UICollectionViewCell {
    private let bubbleView = UIView()
    private let textLabel = UILabel()
    private let timestampLabel = UILabel()
    private let deliveryIcon = UIImageView()

    func configure(with record: MessageRecord) {
        textLabel.text = record.content
        timestampLabel.text = DateFormatter.shortTime.string(from: record.createdAt)

        // Delivery indicator (clock → check → double-check → blue)
        deliveryIcon.image = deliveryImage(for: record.state)
        deliveryIcon.tintColor = record.state == .read ? .systemBlue : .secondaryLabel

        // (CTFramesetter) Timestamp inline si assez de place sur la derniere ligne
        if record.cachedTimestampInline == true {
            // Timestamp a droite de la derniere ligne
            timestampLabel.frame.origin.x = CGFloat(record.cachedLastLineWidth ?? 0) + 8
        } else {
            // Timestamp sur sa propre ligne en bas a droite
            timestampLabel.frame.origin.y = CGFloat(record.cachedBubbleHeight ?? 44) - 20
        }
    }

    override func preferredLayoutAttributesFitting(
        _ layoutAttributes: UICollectionViewLayoutAttributes
    ) -> UICollectionViewLayoutAttributes {
        // Utilise les dimensions pre-calculees — ZERO Auto Layout calculation
        // CTFramesetter a deja fait le travail off-main
        let attrs = super.preferredLayoutAttributesFitting(layoutAttributes)
        if let record = currentRecord {
            attrs.size.height = CGFloat(record.cachedBubbleHeight ?? 44)
        }
        return attrs
    }
}

/// Media bubble cell — utilise NSCache pour les CGImage decoded
final class MediaBubbleCell: UICollectionViewCell {
    private let imageView = UIImageView()
    private let progressView = UIProgressView()

    func configure(with record: MessageRecord, imageCache: NSCache<NSString, CGImageRef>) {
        // Dimensions pre-calculees → frame fixe, zero reflow
        let width = CGFloat(record.cachedBubbleWidth ?? 200)
        let height = CGFloat(record.cachedBubbleHeight ?? 200)
        imageView.frame = CGRect(x: 0, y: 0, width: width, height: height - 24)

        // Check NSCache (O(1)) — si cache hit, zero async
        if let cached = imageCache.object(forKey: record.localId as NSString) {
            imageView.image = UIImage(cgImage: cached.image)
        } else {
            // Placeholder gris + async decode
            imageView.backgroundColor = .systemGray5
            Task {
                let decoded = await ThumbnailPrefetcher.shared.get(key: record.localId)
                if let decoded {
                    await MainActor.run { imageView.image = UIImage(cgImage: decoded) }
                }
            }
        }
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        imageView.image = nil  // Cell recycling — libere la reference CGImage
        imageView.backgroundColor = .systemGray5
    }
}
```

#### NSCache pour images decoded (O3)

```swift
/// (O3) NSCache cost-based pour CGImage decoded
/// Auto-evict sur memory warning sans NotificationCenter
/// Partage entre ThumbnailPrefetcher et les cells
let decodedImageCache: NSCache<NSString, CGImageRef> = {
    let cache = NSCache<NSString, CGImageRef>()
    cache.totalCostLimit = 50 * 1024 * 1024  // 50MB
    cache.countLimit = 300
    return cache
}()

/// Wrapper pour stocker CGImage dans NSCache (NSObject required)
final class CGImageRef: NSObject {
    let image: CGImage
    init(_ image: CGImage) { self.image = image }
}
```

#### SwiftUI bridge

```swift
/// Bridge SwiftUI ↔ UIKit pour la message list
struct MessageListView: UIViewControllerRepresentable {
    let store: MessageStore
    let onVisibleMessagesChanged: ([String]) -> Void

    func makeUIViewController(context: Context) -> MessageListViewController {
        MessageListViewController(store: store)
    }

    func updateUIViewController(_ vc: MessageListViewController, context: Context) {
        // Les updates passent par le store (observation) — pas par le bridge
    }
}

// Utilisation dans ConversationView (SwiftUI)
struct ConversationView: View {
    @State var viewModel: ConversationViewModel

    var body: some View {
        VStack(spacing: 0) {
            // Header (SwiftUI)
            ConversationHeader(conversation: viewModel.conversation)

            // Message list (UIKit — cell recycling, WhatsApp-level perf)
            MessageListView(
                store: viewModel.store,
                onVisibleMessagesChanged: viewModel.onVisibleMessagesChanged
            )

            // Typing indicator (SwiftUI overlay)
            if !viewModel.typingUsernames.isEmpty {
                TypingBanner(usernames: viewModel.typingUsernames)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Input bar (SwiftUI)
            InputBar(onSend: viewModel.send, onTextChanged: viewModel.onTextChanged)
        }
        .task { await viewModel.onAppear() }
        .onDisappear { viewModel.onDisappear() }
    }
}
```

#### Performance budget UICollectionView vs LazyVStack

| Metrique | LazyVStack (ancien) | UICollectionView (nouveau) |
|----------|--------------------|-----------------------------|
| Cells en memoire | 200 (toutes vivantes) | **15-20 (recyclees)** |
| Memoire conversation media | 50-100MB lineaire | **~15MB constant** |
| View creation scroll rapide | 0.8ms/cell (create) | **0.3ms/cell (reuse)** |
| Cout par frame scroll rapide | 8-12ms | **2-4ms** |
| Frame drops A11 (iPhone 8/X) | 3-6/s | **0** |
| Frame drops A15+ | 0-2/s | **0** |
| Prefetch natif | Non (custom) | **`prefetchItemsAt` natif** |
| Diff animations | Manual | **DiffableDataSource automatique** |

**Budget frame cible** : < 4ms/frame sur A15+ pendant scroll rapide (25% du budget 16.67ms).
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
static var globalLayoutEpoch: Int = 1

/// (Fix Scenario 7) Appele quand Dynamic Type change
/// Strategie hybride : sync pour les ~15 visibles, async pour le reste
/// Cout sync : 15 x 0.15ms = ~2.25ms sur MainActor (dans le budget 16ms)
@MainActor
static func invalidateAllLayouts(store: MessageStore, maxWidth: CGFloat) {
    globalLayoutEpoch += 1

    // Phase 1 (SYNC) : recalcul immediat des ~15 messages visibles
    // Evite le layout jump — l'utilisateur ne voit aucun saut
    let visibleIds = store.currentVisibleMessageIds // Set par onScrollTargetVisibilityChange
    for i in store.messages.indices {
        guard visibleIds.contains(store.messages[i].localId) else { continue }
        let result = BubbleLayoutEngine.computeLayout(
            content: store.messages[i].content,
            contentType: store.messages[i].messageType,
            attachmentDimensions: store.messages[i].attachmentDimensions,
            replyPreview: store.messages[i].replyToId != nil,
            reactionCount: store.messages[i].reactionCount,
            maxWidth: maxWidth
        )
        store.messages[i].cachedBubbleWidth = result.size.width
        store.messages[i].cachedBubbleHeight = result.size.height
        store.messages[i].cachedLastLineWidth = result.lastLineWidth
        store.messages[i].cachedLineCount = result.lineCount
        store.messages[i].cachedTimestampInline = result.timestampInline
        store.messages[i].layoutVersion = globalLayoutEpoch
        store.messages[i].layoutMaxWidth = maxWidth
    }
    // SwiftUI re-render immediatement avec les bonnes tailles

    // Phase 2 (ASYNC) : recalcul du reste via refreshFromDB normal
    // Le prochain cycle d'observation recalcule les messages hors viewport
    // Ils seront corrects quand l'utilisateur scrolle vers eux
}
```

Le `BubbleLayoutEngine` verifie `record.layoutVersion == globalLayoutEpoch && record.layoutMaxWidth == currentMaxWidth`. Si invalide, recalcul off-main puis persist en background. Les messages hors fenetre ne sont jamais recalcules inutilement.

### BubbleLayoutEngine — CTFramesetter (remplace NSAttributedString.boundingRect)

**Pourquoi CTFramesetter au lieu de `boundingRect`** :

`boundingRect` appelle `CTFramesetter` en interne (c'est un wrapper UIKit sur Core Text).
Le delta perf est ~15-20% (pas 2x). Le vrai avantage est l'acces aux **metriques par ligne**.

| | `boundingRect` | `CTFramesetter` |
|---|---|---|
| Performance | ~0.18ms/message | ~0.15ms/message (~15-20% plus rapide) |
| Precision hauteur | Sur-estime ~2-5pt (dilemme usesFontLeading) | Exact au pixel |
| **Timestamp inline** | **Impossible** (pas d'acces a la derniere ligne) | **`CTLineGetTypographicBounds`** sur la derniere ligne |
| **Line count** | Approximatif (height / lineHeight) | **Exact** via `CTFrameGetLines().count` |
| Mixed fonts (emoji + bold + @mention) | Correct globalement | Pixel-perfect par segment |
| Baseline metrics | Non | `CTLineGetTypographicBounds(ascent, descent, leading)` |
| Thread safety | Oui (iOS 15+) | Oui (Core Text natif) |

**L'argument decisif** : les apps messaging modernes (WhatsApp, Telegram, iMessage) placent
le timestamp a droite de la derniere ligne quand il y a assez d'espace, sinon il descend.
Ca necessite de connaitre la largeur exacte de la derniere ligne — seul CTFramesetter donne ca.

```swift
/// Layout engine pur — Core Text, zero UIKit, thread-safe, off-main
enum BubbleLayoutEngine {

    struct LayoutResult: Sendable {
        let size: CGSize
        let lastLineWidth: CGFloat    // Pour savoir si le timestamp tient inline
        let lineCount: Int
        let timestampInline: Bool     // true = timestamp a droite de la derniere ligne
    }

    static let timestampWidth: CGFloat = 52  // "12:34" + delivery indicator
    static let timestampInlineGap: CGFloat = 8

    /// Calcule la taille exacte d'une bulle de message
    /// Appele depuis un Task.detached — JAMAIS sur MainActor
    static func computeLayout(
        content: String?,
        contentType: String,
        attachmentDimensions: CGSize?,
        replyPreview: Bool,
        reactionCount: Int,
        maxWidth: CGFloat
    ) -> LayoutResult {
        let bubblePadding: CGFloat = 12
        let timestampRowHeight: CGFloat = 18
        let replyPreviewHeight: CGFloat = replyPreview ? 44 : 0
        let reactionBarHeight: CGFloat = reactionCount > 0 ? 28 : 0
        let contentMaxWidth = maxWidth * 0.75 - (bubblePadding * 2)

        switch contentType {
        case "text":
            guard let text = content, !text.isEmpty else {
                return LayoutResult(
                    size: CGSize(width: 80, height: timestampRowHeight + bubblePadding * 2),
                    lastLineWidth: 0, lineCount: 0, timestampInline: false
                )
            }

            // CTFramesetter pour mesure exacte + metriques par ligne
            let font = CTFontCreateWithName("SFProText-Regular" as CFString, 16, nil)
            let attrString = CFAttributedStringCreate(
                nil,
                text as CFString,
                [kCTFontAttributeName: font] as CFDictionary
            )!
            let framesetter = CTFramesetterCreateWithAttributedString(attrString)

            // Suggest frame size
            var fitRange = CFRange()
            let textSize = CTFramesetterSuggestFrameSizeWithConstraints(
                framesetter,
                CFRange(location: 0, length: CFAttributedStringGetLength(attrString)),
                nil,
                CGSize(width: contentMaxWidth, height: .greatestFiniteMagnitude),
                &fitRange
            )

            // Creer le frame pour acceder aux lignes
            let path = CGPath(
                rect: CGRect(origin: .zero, size: CGSize(width: contentMaxWidth, height: textSize.height + 100)),
                transform: nil
            )
            let frame = CTFramesetterCreateFrame(
                framesetter,
                CFRange(location: 0, length: CFAttributedStringGetLength(attrString)),
                path, nil
            )
            let lines = CTFrameGetLines(frame) as! [CTLine]
            let lineCount = lines.count

            // Largeur de la derniere ligne — pour decidir si le timestamp tient inline
            var lastLineWidth: CGFloat = 0
            if let lastLine = lines.last {
                var ascent: CGFloat = 0, descent: CGFloat = 0, leading: CGFloat = 0
                lastLineWidth = CGFloat(CTLineGetTypographicBounds(lastLine, &ascent, &descent, &leading))
            }

            // Timestamp inline si assez de place sur la derniere ligne
            let spaceForTimestamp = contentMaxWidth - lastLineWidth
            let timestampInline = spaceForTimestamp >= (timestampWidth + timestampInlineGap)

            let textHeight = ceil(textSize.height)
            let totalHeight = textHeight
                + (timestampInline ? 0 : timestampRowHeight)  // Pas de ligne extra si inline
                + replyPreviewHeight
                + reactionBarHeight
                + bubblePadding * 2

            let totalWidth = ceil(max(
                textSize.width,
                timestampInline ? lastLineWidth + timestampWidth + timestampInlineGap : timestampWidth
            )) + bubblePadding * 2

            return LayoutResult(
                size: CGSize(width: min(totalWidth, maxWidth * 0.75), height: totalHeight),
                lastLineWidth: lastLineWidth,
                lineCount: lineCount,
                timestampInline: timestampInline
            )

        case "image", "video":
            guard let dims = attachmentDimensions else {
                return LayoutResult(
                    size: CGSize(width: 200, height: 200 + timestampRowHeight + reactionBarHeight),
                    lastLineWidth: 200, lineCount: 0, timestampInline: true
                )
            }
            let maxMediaWidth = maxWidth * 0.65
            let maxMediaHeight: CGFloat = 300
            let ratio = min(maxMediaWidth / dims.width, maxMediaHeight / dims.height, 1.0)
            return LayoutResult(
                size: CGSize(width: dims.width * ratio,
                             height: dims.height * ratio + timestampRowHeight + reactionBarHeight),
                lastLineWidth: dims.width * ratio,
                lineCount: 0,
                timestampInline: true  // Toujours overlay sur media
            )

        case "audio":
            return LayoutResult(
                size: CGSize(width: maxWidth * 0.65, height: 56 + timestampRowHeight + reactionBarHeight),
                lastLineWidth: maxWidth * 0.65,
                lineCount: 0,
                timestampInline: true
            )

        default:
            return LayoutResult(
                size: CGSize(width: maxWidth * 0.6, height: 60 + reactionBarHeight),
                lastLineWidth: maxWidth * 0.6,
                lineCount: 0,
                timestampInline: false
            )
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

var layoutUpdates: [(String, BubbleLayoutEngine.LayoutResult)] = []
for i in records.indices {
    if records[i].layoutVersion != currentEpoch
        || records[i].layoutMaxWidth != currentMaxWidth {
        let result = BubbleLayoutEngine.computeLayout(
            content: records[i].content,
            contentType: records[i].messageType,
            attachmentDimensions: records[i].attachmentDimensions,
            replyPreview: records[i].replyToId != nil,
            reactionCount: records[i].reactionCount,
            maxWidth: currentMaxWidth
        )
        records[i].cachedBubbleWidth = result.size.width
        records[i].cachedBubbleHeight = result.size.height
        records[i].cachedLastLineWidth = result.lastLineWidth
        records[i].cachedLineCount = result.lineCount
        records[i].cachedTimestampInline = result.timestampInline
        records[i].layoutVersion = currentEpoch
        records[i].layoutMaxWidth = currentMaxWidth
        layoutUpdates.append((records[i].localId, result))
    }
}

// Persist les layouts en background (fire & forget)
if !layoutUpdates.isEmpty {
    Task { [persistence] in
        for (id, result) in layoutUpdates {
            try? await persistence.updateLayout(
                localId: id, width: result.size.width, height: result.size.height,
                lastLineWidth: result.lastLineWidth, lineCount: result.lineCount,
                timestampInline: result.timestampInline,
                epoch: currentEpoch, maxWidth: currentMaxWidth
            )
        }
    }
}

// La vue utilise timestampInline pour placer le timestamp :
// if record.cachedTimestampInline == true {
//     HStack { Text(content); Spacer(); DeliveryIndicator() }  // inline
// } else {
//     VStack { Text(content); HStack { Spacer(); DeliveryIndicator() } }  // ligne separee
// }
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

    // (Fix Scenario 5) Semaphore limite a 3 conversations concurrentes
    private let syncSemaphore = AsyncSemaphore(limit: 3)

    // Pagination jusqu'a ce que le gap soit comble
    await syncSemaphore.wait()
    defer { syncSemaphore.signal() }
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
| `typing:start` | `typingStarted` | Callback ViewModel (pas de persistence). (Fix S3) Collapse > 3 users en "N people typing" | Non |
| `typing:stop` | `typingStopped` | Callback ViewModel. (Fix S3) Remove from typing list | Non |
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
            // (Fix Scenario 6) IMPORTANT : si decrypt reussi, stocker avec isEncrypted = false
            // pour eviter double-decrypt dans l'app
            let decryptSucceeded = (content != nil && incoming.isEncrypted)
            let record = MessageRecord(
                from: incoming,
                decryptedContent: content,
                isEncrypted: decryptSucceeded ? false : incoming.isEncrypted,
                encryptedPayload: decryptSucceeded ? nil : incoming.encryptedPayload
            )
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

## Section 10 : Feed UICollectionView — Posts + Infinite Scroll

### Principe

Le feed est le 2eme hot path apres les messages : scroll infini, media-heavy (images, videos, audio),
reactions en temps reel. Meme architecture que la message list : UICollectionView + DiffableDataSource,
mais avec des cells plus complexes (media carousels, quoted reposts, reaction bars).

### Architecture

```
FeedView (SwiftUI)
  └─ FeedListView (UIViewControllerRepresentable)
       └─ FeedListViewController (UIKit)
            ├─ UICollectionView + CompositionalLayout
            ├─ UICollectionViewDiffableDataSource<FeedSection, String>
            ├─ Cell types: TextPostCell, MediaPostCell, RepostCell, AudioPostCell
            ├─ Supplementary: SectionHeader (date/category)
            └─ Prefetching: UICollectionViewDataSourcePrefetching
  └─ CreatePostButton (SwiftUI) — FAB overlay
  └─ NewPostsBanner (SwiftUI) — "N new posts" sticky banner
```

### FeedPersistenceActor

Meme pattern que `MessagePersistenceActor` — write-through, SQLCipher WAL, meme DatabasePool.

```swift
public actor FeedPersistenceActor {
    private let dbPool: DatabasePool  // MEME dbPool que MessagePersistenceActor (shared)

    // Tables: feed_posts, feed_comments, feed_translations

    // Write-through
    func insertPost(_ record: PostRecord) throws {
        try dbPool.write { db in
            try record.save(db) // upsert
        }
    }

    func insertPosts(_ records: [PostRecord]) throws {
        try dbPool.write { db in
            for record in records { try record.save(db) }
        }
    }

    func updateLikeCount(postId: String, count: Int, isLikedByMe: Bool) throws {
        try dbPool.write { db in
            try db.execute(
                sql: "UPDATE feed_posts SET likeCount = ?, isLikedByMe = ?, changeVersion = changeVersion + 1 WHERE id = ?",
                arguments: [count, isLikedByMe, postId]
            )
        }
    }

    func updateCommentCount(postId: String, count: Int) throws {
        try dbPool.write { db in
            try db.execute(
                sql: "UPDATE feed_posts SET commentCount = ?, changeVersion = changeVersion + 1 WHERE id = ?",
                arguments: [count, postId]
            )
        }
    }

    func deletePost(id: String) throws {
        try dbPool.write { db in
            try db.execute(sql: "DELETE FROM feed_posts WHERE id = ?", arguments: [id])
        }
    }

    func saveTranslation(_ translation: PostTranslationRecord) throws {
        try dbPool.write { db in try translation.save(db) }
    }

    // Comments
    func insertComment(_ record: CommentRecord) throws {
        try dbPool.write { db in try record.save(db) }
    }

    func deleteComment(id: String) throws {
        try dbPool.write { db in
            try db.execute(sql: "DELETE FROM feed_comments WHERE id = ?", arguments: [id])
        }
    }

    // Reads (nonisolated, zero contention)
    nonisolated func posts(cursor: Date? = nil, limit: Int = 20) throws -> [PostRecord] {
        try dbPool.read { db in
            var query = PostRecord.order(Column("createdAt").desc).limit(limit)
            if let cursor { query = query.filter(Column("createdAt") < cursor) }
            return try query.fetchAll(db)
        }
    }

    nonisolated func comments(forPostId postId: String, parentId: String? = nil,
                               cursor: Date? = nil, limit: Int = 20) throws -> [CommentRecord] {
        try dbPool.read { db in
            var query = CommentRecord
                .filter(Column("postId") == postId)
                .order(Column("createdAt").desc)
                .limit(limit)
            if let parentId {
                query = query.filter(Column("parentId") == parentId)
            } else {
                query = query.filter(Column("parentId") == nil) // Top-level only
            }
            if let cursor { query = query.filter(Column("createdAt") < cursor) }
            return try query.fetchAll(db)
        }
    }
}
```

### PostRecord (GRDB)

```swift
struct PostRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "feed_posts"

    var id: String                  // PK
    var authorId: String
    var authorUsername: String?
    var authorDisplayName: String?
    var authorAvatarURL: String?
    var type: String?               // post, story, status
    var content: String?
    var originalLanguage: String?
    var visibility: String?
    var likeCount: Int
    var commentCount: Int
    var repostCount: Int
    var viewCount: Int
    var bookmarkCount: Int
    var shareCount: Int
    var isLikedByMe: Bool
    var isPinned: Bool
    var isEdited: Bool
    var isQuote: Bool
    var moodEmoji: String?
    var audioUrl: String?
    var audioDuration: Int?
    var mediaJson: Data?            // JSON [FeedMedia]
    var reactionSummaryJson: Data?  // JSON [String: Int]
    var repostOfJson: Data?         // JSON RepostContent
    var mentionedUsersJson: Data?   // JSON [MentionedUser]
    var translationsJson: Data?     // JSON [String: PostTranslation]
    var createdAt: Date
    var updatedAt: Date?
    var changeVersion: Int64        // (O1) Pour Equatable rapide
}

extension PostRecord: Equatable {
    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.id == rhs.id && lhs.changeVersion == rhs.changeVersion
    }
}
```

### CommentRecord (GRDB)

```swift
struct CommentRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "feed_comments"

    var id: String                  // PK
    var postId: String              // FK
    var parentId: String?           // Nested replies
    var authorId: String
    var authorUsername: String?
    var authorDisplayName: String?
    var authorAvatarURL: String?
    var content: String
    var originalLanguage: String?
    var translatedContent: String?
    var likeCount: Int
    var replyCount: Int
    var effectFlags: Int
    var createdAt: Date
    var changeVersion: Int64
}

extension CommentRecord: Equatable {
    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.id == rhs.id && lhs.changeVersion == rhs.changeVersion
    }
}
```

### FeedStore (@Observable)

Meme pattern que MessageStore — observe GRDB via DatabaseRegionObservation, off-main reads.

```swift
@Observable
@MainActor
final class FeedStore {
    private(set) var posts: [PostRecord] = []
    private var _idIndex: [String: Int]?
    private var regionObservation: DatabaseCancellable?
    private var isUserScrolling = false

    func startObserving(dbPool: DatabasePool) {
        let region = PostRecord.databaseRegion
        var refreshTask: Task<Void, Never>?

        regionObservation = DatabaseRegionObservation(tracking: region)
            .start(in: dbPool) { [weak self] _ in
                refreshTask?.cancel()
                refreshTask = Task { [weak self] in
                    guard let self else { return }
                    let delay: Duration = self.isUserScrolling ? .milliseconds(200) : .milliseconds(16)
                    try? await Task.sleep(for: delay)
                    guard !Task.isCancelled else { return }
                    await self.refreshFromDB()
                }
            }
    }

    private func refreshFromDB() async {
        let newPosts = await Task.detached(priority: .userInitiated) { [persistence] in
            try? persistence.posts(limit: 50)
        }.value
        guard let newPosts, newPosts != posts else { return }
        posts = newPosts
        _idIndex = nil
    }

    func loadMore(before cursor: Date) async -> Bool {
        let older = await Task.detached(priority: .userInitiated) { [persistence] in
            try? persistence.posts(cursor: cursor, limit: 20)
        }.value
        guard let older, !older.isEmpty else { return false }
        posts.append(contentsOf: older)
        _idIndex = nil
        return true
    }
}
```

### FeedListViewController (UICollectionView)

```swift
final class FeedListViewController: UIViewController {
    private var collectionView: UICollectionView!
    private var dataSource: UICollectionViewDiffableDataSource<Int, String>!
    private let store: FeedStore

    override func viewDidLoad() {
        super.viewDidLoad()
        configureLayout()
        configureDataSource()
        observeStore()
    }

    private func configureLayout() {
        let layout = UICollectionViewCompositionalLayout { _, env in
            let itemSize = NSCollectionLayoutSize(
                widthDimension: .fractionalWidth(1.0),
                heightDimension: .estimated(400) // Posts are taller than messages
            )
            let item = NSCollectionLayoutItem(layoutSize: itemSize)
            let group = NSCollectionLayoutGroup.vertical(layoutSize: itemSize, subitems: [item])
            let section = NSCollectionLayoutSection(group: group)
            section.interGroupSpacing = 8
            return section
        }
        collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)
        collectionView.prefetchDataSource = self
        // NOT flipped (feed is top-to-bottom, unlike messages)
        view.addSubview(collectionView)
    }

    private func configureDataSource() {
        let textPostReg = UICollectionView.CellRegistration<TextPostCell, String> {
            [weak self] cell, indexPath, postId in
            guard let record = self?.store.post(for: postId) else { return }
            cell.configure(with: record)
        }

        let mediaPostReg = UICollectionView.CellRegistration<MediaPostCell, String> {
            [weak self] cell, indexPath, postId in
            guard let record = self?.store.post(for: postId) else { return }
            cell.configure(with: record, imageCache: ThumbnailPrefetcher.shared.decodedImageCache)
        }

        dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) {
            [weak self] cv, indexPath, postId in
            guard let record = self?.store.post(for: postId) else { return nil }
            let hasMedia = record.mediaJson != nil
            if hasMedia {
                return cv.dequeueConfiguredReusableCell(using: mediaPostReg, for: indexPath, item: postId)
            }
            return cv.dequeueConfiguredReusableCell(using: textPostReg, for: indexPath, item: postId)
        }
    }

    private func applySnapshot() {
        var snapshot = NSDiffableDataSourceSnapshot<Int, String>()
        snapshot.appendSections([0])
        snapshot.appendItems(store.posts.map(\.id), toSection: 0)
        dataSource.apply(snapshot, animatingDifferences: true)
    }
}

extension FeedListViewController: UICollectionViewDataSourcePrefetching {
    func collectionView(_ cv: UICollectionView, prefetchItemsAt indexPaths: [IndexPath]) {
        let postIds = indexPaths.compactMap { dataSource.itemIdentifier(for: $0) }
        Task { await ThumbnailPrefetcher.shared.prefetchBatch(postIds) }

        // Infinite scroll trigger
        if let last = indexPaths.last, last.item > store.posts.count - 5 {
            Task {
                guard let cursor = store.posts.last?.createdAt else { return }
                _ = await store.loadMore(before: cursor)
            }
        }
    }
}
```

### Socket events — FeedSocketHandler

```swift
/// Gere les events socket pour le feed — ecrit dans FeedPersistenceActor
final class FeedSocketHandler {
    private let persistence: FeedPersistenceActor
    private let socialSocket: SocialSocketManager
    private var cancellables: Set<AnyCancellable> = []

    func arm() {
        socialSocket.postCreated.sink { [persistence] apiPost in
            Task { try? await persistence.insertPost(PostRecord(from: apiPost)) }
        }.store(in: &cancellables)

        socialSocket.postUpdated.sink { [persistence] apiPost in
            Task { try? await persistence.insertPost(PostRecord(from: apiPost)) } // upsert
        }.store(in: &cancellables)

        socialSocket.postDeleted.sink { [persistence] postId in
            Task { try? await persistence.deletePost(id: postId) }
        }.store(in: &cancellables)

        socialSocket.postLiked.sink { [persistence] event in
            Task { try? await persistence.updateLikeCount(
                postId: event.postId, count: event.likeCount, isLikedByMe: event.isMe) }
        }.store(in: &cancellables)

        socialSocket.postUnliked.sink { [persistence] event in
            Task { try? await persistence.updateLikeCount(
                postId: event.postId, count: event.likeCount, isLikedByMe: false) }
        }.store(in: &cancellables)

        socialSocket.commentAdded.sink { [persistence] event in
            Task {
                try? await persistence.insertComment(CommentRecord(from: event))
                try? await persistence.updateCommentCount(
                    postId: event.postId, count: event.commentCount)
            }
        }.store(in: &cancellables)

        socialSocket.commentDeleted.sink { [persistence] event in
            Task {
                try? await persistence.deleteComment(id: event.commentId)
                try? await persistence.updateCommentCount(
                    postId: event.postId, count: event.commentCount)
            }
        }.store(in: &cancellables)

        socialSocket.postTranslationUpdated.sink { [persistence] event in
            Task { try? await persistence.saveTranslation(
                PostTranslationRecord(from: event)) }
        }.store(in: &cancellables)
    }
}
```

### Performance profile Feed vs Messages

| Aspect | Message list | Feed list |
|--------|-------------|-----------|
| Cell height | ~44-300px (variable) | ~200-600px (tres variable) |
| Media per cell | 0-1 | 0-10 (carousel) |
| Cell complexity | Moyenne | Elevee (reaction bar, author header, media grid) |
| Scroll pattern | Rapide (flick up to read history) | Modere (scroll down to discover) |
| Cells visibles | 5-8 | 2-4 |
| Prefetch window | 20-30 items | 5-10 items (cells plus grandes) |
| Infinite scroll | Anchor-based window | Cursor-based pagination |

---

## Section 11 : Comments UICollectionView — Nested threads

### Architecture

```
PostDetailView (SwiftUI)
  └─ PostHeader (SwiftUI) — post content, media, reactions
  └─ CommentListView (UIViewControllerRepresentable)
       └─ CommentListViewController (UIKit)
            ├─ UICollectionView + CompositionalLayout
            ├─ UICollectionViewDiffableDataSource<CommentSection, CommentItem>
            ├─ Cell types: TopLevelCommentCell, ReplyCell, LoadMoreRepliesCell
            └─ Section per top-level comment (with expandable replies)
  └─ CommentInputBar (SwiftUI) — input + replyTo preview
```

### Section model pour nested threads

```swift
/// Chaque section = un top-level comment + ses replies
enum CommentSection: Hashable {
    case topLevel(commentId: String)
}

/// Items dans une section
enum CommentItem: Hashable {
    case comment(id: String)               // Top-level ou reply
    case loadMoreReplies(parentId: String, remaining: Int)  // "Load N more replies"
}
```

### CommentListViewController

```swift
final class CommentListViewController: UIViewController {
    private let store: CommentStore
    private var collectionView: UICollectionView!
    private var dataSource: UICollectionViewDiffableDataSource<CommentSection, CommentItem>!

    private func configureLayout() {
        let layout = UICollectionViewCompositionalLayout { sectionIndex, env in
            let itemSize = NSCollectionLayoutSize(
                widthDimension: .fractionalWidth(1.0),
                heightDimension: .estimated(80)
            )
            let item = NSCollectionLayoutItem(layoutSize: itemSize)
            let group = NSCollectionLayoutGroup.vertical(layoutSize: itemSize, subitems: [item])
            let section = NSCollectionLayoutSection(group: group)
            section.interGroupSpacing = 0
            section.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 0, bottom: 12, trailing: 0)
            return section
        }
        collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)
        view.addSubview(collectionView)
    }

    private func applySnapshot() {
        var snapshot = NSDiffableDataSourceSnapshot<CommentSection, CommentItem>()

        for comment in store.topLevelComments {
            let section = CommentSection.topLevel(commentId: comment.id)
            snapshot.appendSections([section])
            snapshot.appendItems([.comment(id: comment.id)], toSection: section)

            // Replies (si thread expande)
            if store.expandedThreads.contains(comment.id) {
                let replies = store.replies(for: comment.id)
                for reply in replies {
                    snapshot.appendItems([.comment(id: reply.id)], toSection: section)
                }
                // "Load more" si il reste des replies non-chargees
                let remaining = comment.replyCount - replies.count
                if remaining > 0 {
                    snapshot.appendItems(
                        [.loadMoreReplies(parentId: comment.id, remaining: remaining)],
                        toSection: section
                    )
                }
            } else if comment.replyCount > 0 {
                // Thread collapse — affiche "View N replies"
                snapshot.appendItems(
                    [.loadMoreReplies(parentId: comment.id, remaining: comment.replyCount)],
                    toSection: section
                )
            }
        }

        dataSource.apply(snapshot, animatingDifferences: true)
    }
}
```

### ReplyCell — indentation pour nested threads

```swift
final class ReplyCell: UICollectionViewCell {
    private let avatarView = UIImageView()
    private let authorLabel = UILabel()
    private let contentLabel = UILabel()
    private let timestampLabel = UILabel()
    private let likeButton = UIButton()

    func configure(with record: CommentRecord, depth: Int) {
        // Indentation : 40pt par niveau de profondeur
        contentView.layoutMargins.left = CGFloat(depth) * 40 + 16

        authorLabel.text = record.authorDisplayName ?? record.authorUsername
        contentLabel.text = record.translatedContent ?? record.content // Prisme Linguistique
        timestampLabel.text = DateFormatter.relative.string(from: record.createdAt)
        likeButton.setTitle("\(record.likeCount)", for: .normal)

        // Author color (denormalized)
        let color = UIColor(hex: DynamicColorGenerator.colorForId(record.authorId))
        avatarView.backgroundColor = color
    }
}
```

### CommentStore (@Observable)

```swift
@Observable
@MainActor
final class CommentStore {
    let postId: String
    private let persistence: FeedPersistenceActor
    private(set) var topLevelComments: [CommentRecord] = []
    private(set) var repliesMap: [String: [CommentRecord]] = [:]
    var expandedThreads: Set<String> = []

    func replies(for parentId: String) -> [CommentRecord] {
        repliesMap[parentId] ?? []
    }

    func loadInitial() async {
        let comments = await Task.detached(priority: .userInitiated) { [persistence, postId] in
            try? persistence.comments(forPostId: postId, parentId: nil, limit: 20)
        }.value
        guard let comments else { return }
        topLevelComments = comments
    }

    func loadReplies(for commentId: String) async {
        let replies = await Task.detached(priority: .userInitiated) { [persistence, postId] in
            try? persistence.comments(forPostId: postId, parentId: commentId, limit: 20)
        }.value
        guard let replies else { return }
        repliesMap[commentId] = replies
        expandedThreads.insert(commentId)
    }

    func toggleThread(_ commentId: String) async {
        if expandedThreads.contains(commentId) {
            expandedThreads.remove(commentId)
        } else {
            if repliesMap[commentId] == nil {
                await loadReplies(for: commentId)
            } else {
                expandedThreads.insert(commentId)
            }
        }
    }
}
```

---

## Section 12 : Hybrid Strategy — UIKit vs SwiftUI par screen

| Screen | Implementation | Raison |
|--------|---------------|--------|
| **Message list** | UICollectionView | Cell recycling, media-heavy, scroll rapide |
| **Feed/Posts** | UICollectionView | Infinite scroll, media carousels, cell recycling |
| **Comments** | UICollectionView | Nested threads, expand/collapse, pagination |
| Conversation list | SwiftUI List | Scroll modere, 50-200 items, pas media-heavy |
| Conversation header | SwiftUI | Statique |
| Input bar | SwiftUI | Interactions clavier, pas de scroll |
| Typing indicator | SwiftUI | Simple overlay |
| Settings | SwiftUI | Navigation stack standard |
| Profile | SwiftUI | Peu d'items |
| Story viewer | SwiftUI (custom) | Full-screen, gestes custom |
| Notifications | SwiftUI List | Scroll modere |
| Communities list | SwiftUI List | Peu d'items |
| Create post | SwiftUI | Formulaire |

### GRDB tables — schema complet final

```
Messages layer (MessagePersistenceActor):
  messages                    — 35+ champs, PK localId
  pending_ids                 — tempId → serverId mapping
  message_translations        — traductions texte
  message_transcriptions      — transcriptions audio Whisper
  message_audio_translations  — traductions audio TTS
  local_attachments           — snapshots media avant upload

Feed layer (FeedPersistenceActor):
  feed_posts                  — posts/stories/statuses, PK id
  feed_comments               — comments + nested replies, PK id
  feed_translations           — traductions posts/comments

Shared:
  Toutes les tables dans le MEME DatabasePool (App Group)
  SQLCipher WAL, reader pool adaptatif
```

---

## Section 13 : Tests

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
| Progressive decrypt : 20 visibles d'abord, 180 apres | Fix S1 | Premier render < 60ms |
| AsyncCachedImage onDisappear nil-out image | Fix S4 | Memoire constante en scroll |
| Layout sync 15 visibles sur Dynamic Type change | Fix S7 | Zero layout jump |
| Gap detector max 3 conversations concurrentes | Fix S5 | Pas de flood reseau |
| NSE stocke isEncrypted=false apres decrypt | Fix S6 | Pas de double-decrypt |
| Typing collapse > 3 users en "N typing" | Fix S3 | Pas de 50 animations |
| Scroll-to-bottom apres envoi message | Fix S2 | Bulle visible immediatement |
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
| `MeeshySDK/Persistence/FeedPersistenceActor.swift` | Actor write-through pour posts + comments |
| `MeeshySDK/Persistence/PostRecord.swift` | GRDB record posts |
| `MeeshySDK/Persistence/CommentRecord.swift` | GRDB record comments + nested replies |
| `MeeshySDK/Persistence/PostTranslationRecord.swift` | GRDB record traductions posts |

### New files (App layer)

| File | Component |
|------|-----------|
| `Meeshy/Core/DependencyContainer.swift` | Root DI (coexists with CacheCoordinator) |
| `Meeshy/Features/Main/Stores/MessageStore.swift` | @Observable + DatabaseRegionObservation + anchor windowing |
| `Meeshy/Features/Main/Views/MessageListViewController.swift` | UICollectionView + CompositionalLayout + DiffableDataSource |
| `Meeshy/Features/Main/Views/MessageListView.swift` | UIViewControllerRepresentable bridge |
| `Meeshy/Features/Main/Views/Cells/TextBubbleCell.swift` | Text bubble avec timestamp inline |
| `Meeshy/Features/Main/Views/Cells/MediaBubbleCell.swift` | Image/video bubble avec NSCache |
| `Meeshy/Features/Main/Views/Cells/AudioBubbleCell.swift` | Audio waveform bubble |
| `Meeshy/Features/Main/Views/Cells/SystemMessageCell.swift` | System message (joined, left, etc.) |
| `Meeshy/Features/Main/Coordinators/MediaAttachmentCoordinator.swift` | Upload orchestration |
| `Meeshy/Features/Main/Stores/FeedStore.swift` | @Observable + DatabaseRegionObservation feed |
| `Meeshy/Features/Main/Stores/CommentStore.swift` | @Observable + nested threads |
| `Meeshy/Features/Main/Views/FeedListViewController.swift` | UICollectionView feed infinite scroll |
| `Meeshy/Features/Main/Views/FeedListView.swift` | UIViewControllerRepresentable bridge feed |
| `Meeshy/Features/Main/Views/CommentListViewController.swift` | UICollectionView nested comments |
| `Meeshy/Features/Main/Views/CommentListView.swift` | UIViewControllerRepresentable bridge comments |
| `Meeshy/Features/Main/Views/Cells/TextPostCell.swift` | Text-only post cell |
| `Meeshy/Features/Main/Views/Cells/MediaPostCell.swift` | Post avec media carousel |
| `Meeshy/Features/Main/Views/Cells/TopLevelCommentCell.swift` | Comment cell |
| `Meeshy/Features/Main/Views/Cells/ReplyCell.swift` | Nested reply cell (indented) |
| `Meeshy/Features/Main/Views/Cells/LoadMoreRepliesCell.swift` | "View N replies" cell |
| `Meeshy/Features/Main/ViewModels/FeedSocketHandler.swift` | Socket events → FeedPersistenceActor |

### Modified files

| File | Changes |
|------|---------|
| `ConversationViewModel.swift` | Strip to orchestrator, delegate to Store/Actor |
| `ConversationSocketHandler.swift` | Write to Actor (all 25 events), callback for non-persisted state |
| `ConversationListViewModel.swift` | Add `observeMessageChanges()` for preview updates |
| `MeeshyApp.swift` | Init DependencyContainer, run legacy migration once |
| `ConversationView.swift` | Use MessageListView (UIKit bridge) |
| `FeedView.swift` | Use FeedListView (UIKit bridge) |
| `PostDetailView.swift` | Use CommentListView (UIKit bridge) |
| `FeedViewModel.swift` | Strip to orchestrator, delegate to FeedStore/Actor |
| `PostDetailViewModel.swift` | Strip to orchestrator, delegate to CommentStore/Actor |
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
| `MeeshySDKTests/FeedPersistenceActorTests.swift` | ~10 tests (CRUD posts + comments) |
| `MeeshySDKTests/PostRecordTests.swift` | ~5 tests (roundtrip, Equatable) |
| `MeeshySDKTests/CommentRecordTests.swift` | ~5 tests (nested threads, parentId) |
| `MeeshyTests/Integration/FeedPipelineIntegrationTests.swift` | ~8 tests (actor → store → UICollectionView) |
| `MeeshyTests/Integration/CommentThreadIntegrationTests.swift` | ~5 tests (expand/collapse, pagination) |

---

## Section 14 : Performance Budget (zero-freeze guarantee)

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
| CTFramesetter layout 200 messages | < 35ms | Task.detached (~15-20% plus rapide que boundingRect + metriques ligne) |
| JPEG decode 1 thumbnail | < 5ms | Task.detached |
| GRDB write 1 message | < 10ms | MessagePersistenceActor |
| GRDB write batch 100 messages | < 200ms | MessagePersistenceActor |

### Debounce budget (O5 — adaptatif)

| Signal | Debounce idle | Debounce scroll | Raison |
|--------|--------------|-----------------|--------|
| DatabaseRegionObservation | 16ms (1 frame) | 200ms | Instantane au repos, coalesce en scroll |
| Translation events | 80ms | 80ms | Toujours coalesce (pas critique pour latence) |
| Layout invalidation | 16ms (sync visible) | 16ms | Sync ~15 visibles (2.25ms) + async reste |
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
| Envoi message → affichage bulle | < 50ms (3 frames) | Manual measurement |
| Reception message → affichage bulle | < 100ms (debounce inclus) | Manual measurement |
| Clock → check transition | < 300ms apres REST ACK | Manual measurement |

### SOTA Comparison Matrix

| Technique | Telegram | Signal | Meeshy v5 |
|-----------|----------|--------|-----------|
| Write-ahead persistence | SQLite WAL | SQLCipher WAL | **SQLCipher WAL** + write-through actor |
| Zero main-thread DB read | Custom engine | Background fetch | **Background fetch** (`Task.detached` + WAL reader) |
| Zero main-thread crypto | Custom | Background decrypt | **Background decrypt** (bulk off-main, 1 session key) |
| Pre-computed layout | Background CTFramesetter | Background CTFramesetter | **Background CTFramesetter** + lazy epoch invalidation |
| Cell recycling | AsyncDisplayKit | UICollectionView | **UICollectionView** (message list) + SwiftUI (reste) |
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
