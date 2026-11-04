package me.meeshy.core.database.migration

import androidx.sqlite.db.SupportSQLiteDatabase

/** Tables whose rows are the only copy of user intent: a migration may never drop or empty them. */
internal object DurableTables {
    val names: Set<String> = setOf("outbox", "media_blob", "tus_upload_checkpoint", "sync_meta", "e2ee_plaintext_erasures")

    /** #14655 — la seule trace d'un clair à retirer du coffre E2EE : vidée, elle laisserait ce clair sur l'appareil. */
    const val plaintextErasuresSql: String =
        "CREATE TABLE IF NOT EXISTS `e2ee_plaintext_erasures` (`account` TEXT NOT NULL, `kind` TEXT NOT NULL, " +
            "`itemId` TEXT NOT NULL, `clientMessageId` TEXT, `senderId` TEXT, `recordedAt` INTEGER NOT NULL, " +
            "`acknowledgedAt` INTEGER, PRIMARY KEY(`account`, `kind`, `itemId`))"

    const val plaintextErasuresIndexSql: String =
        "CREATE INDEX IF NOT EXISTS `index_e2ee_plaintext_erasures_acknowledgedAt` ON `e2ee_plaintext_erasures` (`acknowledgedAt`)"

    /**
     * Les tables durables purement additives, créées si elles manquent et jamais vidées : une migration en échec
     * (rendue par [CacheReset]) laisse ainsi la base dans la forme que Room valide, sans toucher une ligne existante.
     */
    fun ensureAdditive(db: SupportSQLiteDatabase) {
        db.execSQL(plaintextErasuresSql)
        db.execSQL(plaintextErasuresIndexSql)
    }
}

internal data class CacheTableDefinition(
    val name: String,
    val createSql: String,
    val indexSql: List<String> = emptyList(),
)

private fun payloadTable(name: String, key: String, extra: String) = CacheTableDefinition(
    name = name,
    createSql = "CREATE TABLE IF NOT EXISTS `$name` (`$key` TEXT NOT NULL, `payload` TEXT NOT NULL, $extra PRIMARY KEY(`$key`))",
)

/**
 * Tables rebuilt from the network by the SWR layer. The list is exhaustive (DurableTablesGuardTest
 * classifies every table of the live schema) and mirrors the CURRENT schema, so [CacheReset] leaves
 * a database in the shape Room validates. Extend it in the same commit as the entity.
 */
internal object CacheTables {

    val ephemeralReceipts = CacheTableDefinition(
        name = "ephemeral_receipts",
        createSql = "CREATE TABLE IF NOT EXISTS `ephemeral_receipts` (`messageId` TEXT NOT NULL, `conversationId` TEXT NOT NULL, `receivedAt` INTEGER NOT NULL, `expiresAt` INTEGER, PRIMARY KEY(`messageId`))",
        indexSql = listOf("CREATE INDEX IF NOT EXISTS `index_ephemeral_receipts_conversationId` ON `ephemeral_receipts` (`conversationId`)"),
    )

    val editRevisions = CacheTableDefinition(
        name = "message_edit_revisions",
        createSql = "CREATE TABLE IF NOT EXISTS `message_edit_revisions` (`messageId` TEXT NOT NULL, `revision` INTEGER NOT NULL, `content` TEXT NOT NULL, `editedAt` INTEGER NOT NULL, PRIMARY KEY(`messageId`, `revision`))",
    )

    val directoryContacts = payloadTable(
        "directory_contacts", "contactId", "`sortIndex` INTEGER NOT NULL, `cachedAt` INTEGER NOT NULL,",
    )

    val mediaIndex = CacheTableDefinition(
        name = "media_index",
        createSql = "CREATE TABLE IF NOT EXISTS `media_index` (`attachmentId` TEXT NOT NULL, `conversationId` TEXT NOT NULL, `kind` TEXT NOT NULL, `messageId` TEXT NOT NULL, `createdAt` INTEGER NOT NULL, `payload` TEXT NOT NULL, PRIMARY KEY(`attachmentId`))",
        indexSql = listOf("CREATE INDEX IF NOT EXISTS `index_media_index_conversationId_kind_createdAt` ON `media_index` (`conversationId`, `kind`, `createdAt`)"),
    )

    val cacheEntries = CacheTableDefinition(
        name = "cache_entries",
        createSql = "CREATE TABLE IF NOT EXISTS `cache_entries` (`namespace` TEXT NOT NULL, `key` TEXT NOT NULL, `itemId` TEXT NOT NULL, `position` INTEGER NOT NULL, `contentHash` TEXT NOT NULL, `lastFetchedAt` INTEGER NOT NULL, `payload` TEXT NOT NULL, PRIMARY KEY(`namespace`, `key`, `itemId`))",
    )

    val keyedJsonCache = CacheTableDefinition(
        name = "keyed_json_cache",
        createSql = "CREATE TABLE IF NOT EXISTS `keyed_json_cache` (`namespace` TEXT NOT NULL, `key` TEXT NOT NULL, `payload` TEXT NOT NULL, `fetchedAt` INTEGER NOT NULL, PRIMARY KEY(`namespace`, `key`))",
    )

    /** Version 24 : la liste des notifications (portée « all »), servie au premier cadre avant tout réseau. */
    val notifications = CacheTableDefinition(
        name = "notifications",
        createSql = "CREATE TABLE IF NOT EXISTS `notifications` (`id` TEXT NOT NULL, `scopeKey` TEXT NOT NULL, `payload` TEXT NOT NULL, `createdAt` INTEGER NOT NULL, `isRead` INTEGER NOT NULL, `cachedAt` INTEGER NOT NULL, PRIMARY KEY(`id`))",
        indexSql = listOf("CREATE INDEX IF NOT EXISTS `index_notifications_scopeKey_createdAt` ON `notifications` (`scopeKey`, `createdAt`)"),
    )

    /** Version 25 : le journal des tentatives d'envoi d'un message sortant (une ligne par tentative). */
    val sendAttempts = CacheTableDefinition(
        name = "send_attempts",
        createSql = "CREATE TABLE IF NOT EXISTS `send_attempts` (`localId` TEXT NOT NULL, `attemptNumber` INTEGER NOT NULL, `transport` TEXT NOT NULL, `startedAt` INTEGER NOT NULL, `finishedAt` INTEGER, `outcome` TEXT NOT NULL, `errorMessage` TEXT, PRIMARY KEY(`localId`, `attemptNumber`))",
    )

    /** Version 26 : les traductions de texte déjà reçues, uniques par (message, langue). */
    val messageTranslations = CacheTableDefinition(
        name = "message_translations",
        createSql = "CREATE TABLE IF NOT EXISTS `message_translations` (`messageId` TEXT NOT NULL, `language` TEXT NOT NULL, `content` TEXT NOT NULL, `sourceLanguage` TEXT NOT NULL, `model` TEXT, `confidence` REAL, `updatedAt` INTEGER NOT NULL, PRIMARY KEY(`messageId`, `language`))",
    )

    /** Version 26 : les transcriptions déjà reçues, uniques par (message, pièce jointe). */
    val messageTranscriptions = CacheTableDefinition(
        name = "message_transcriptions",
        createSql = "CREATE TABLE IF NOT EXISTS `message_transcriptions` (`messageId` TEXT NOT NULL, `attachmentId` TEXT NOT NULL, `text` TEXT NOT NULL, `language` TEXT, `confidence` REAL, `durationMs` INTEGER, `updatedAt` INTEGER NOT NULL, PRIMARY KEY(`messageId`, `attachmentId`))",
    )

    /** Version 26 : les pistes audio traduites déjà reçues, uniques par (message, pièce jointe, langue). */
    val messageAudioTranslations = CacheTableDefinition(
        name = "message_audio_translations",
        createSql = "CREATE TABLE IF NOT EXISTS `message_audio_translations` (`messageId` TEXT NOT NULL, `attachmentId` TEXT NOT NULL, `language` TEXT NOT NULL, `url` TEXT NOT NULL, `transcription` TEXT NOT NULL, `durationMs` INTEGER, `format` TEXT, `cloned` INTEGER NOT NULL, `quality` REAL, `voiceModelId` TEXT, `ttsModel` TEXT, `updatedAt` INTEGER NOT NULL, PRIMARY KEY(`messageId`, `attachmentId`, `language`))",
    )

    /** Version 27 : les personnes et les réactions d'une ligne du journal d'appels, vides par défaut. */
    val callHistory = CacheTableDefinition(
        name = "call_history",
        createSql = "CREATE TABLE IF NOT EXISTS `call_history` (`callId` TEXT NOT NULL, `payload` TEXT NOT NULL, `startedAt` INTEGER NOT NULL, `cachedAt` INTEGER NOT NULL, `participants` TEXT NOT NULL DEFAULT '[]', `reactionCounts` TEXT NOT NULL DEFAULT '{}', PRIMARY KEY(`callId`))",
    )

    /** Version 27 : le journal réseau d'un appel, local à l'appareil, par compte. */
    val callNetworkJournal = CacheTableDefinition(
        name = "call_network_journal",
        createSql = "CREATE TABLE IF NOT EXISTS `call_network_journal` (`account` TEXT NOT NULL, `callId` TEXT NOT NULL, `startedAt` INTEGER NOT NULL, `payload` TEXT NOT NULL, `updatedAt` INTEGER NOT NULL, PRIMARY KEY(`account`, `callId`))",
        indexSql = listOf("CREATE INDEX IF NOT EXISTS `index_call_network_journal_account_startedAt` ON `call_network_journal` (`account`, `startedAt`)"),
    )

    /** Version 27 : les segments de transcription d'un appel, uniques par (appel, wireId). */
    val callTranscript = CacheTableDefinition(
        name = "call_transcript",
        createSql = "CREATE TABLE IF NOT EXISTS `call_transcript` (`callId` TEXT NOT NULL, `wireId` TEXT NOT NULL, `conversationId` TEXT NOT NULL, `callStartedAt` INTEGER NOT NULL, `speakerId` TEXT NOT NULL, `speakerName` TEXT NOT NULL, `isLocal` INTEGER NOT NULL, `text` TEXT NOT NULL, `translatedText` TEXT, `translatedLanguage` TEXT, `language` TEXT, `capturedAt` INTEGER NOT NULL, PRIMARY KEY(`callId`, `wireId`))",
        indexSql = listOf("CREATE INDEX IF NOT EXISTS `index_call_transcript_callId_capturedAt` ON `call_transcript` (`callId`, `capturedAt`)"),
    )

    /** Version 28 : les comptages (vue, impression, ouverture, durée) en attente d'envoi, une ligne par événement. */
    val pendingCountingEvents = CacheTableDefinition(
        name = "pending_counting_events",
        createSql = "CREATE TABLE IF NOT EXISTS `pending_counting_events` (`eventId` TEXT NOT NULL, `owner` TEXT NOT NULL, `queueKey` TEXT NOT NULL, `kind` TEXT NOT NULL, `payload` TEXT NOT NULL, `createdAt` INTEGER NOT NULL, PRIMARY KEY(`eventId`))",
        indexSql = listOf("CREATE INDEX IF NOT EXISTS `index_pending_counting_events_owner_queueKey_createdAt` ON `pending_counting_events` (`owner`, `queueKey`, `createdAt`)"),
    )

    /** Version 28 : les événements sociaux v2 en attente d'envoi, conservés tels quels. */
    val socialEventsV2Outbox = CacheTableDefinition(
        name = "social_events_v2_outbox",
        createSql = "CREATE TABLE IF NOT EXISTS `social_events_v2_outbox` (`eventId` TEXT NOT NULL, `owner` TEXT NOT NULL, `payload` TEXT NOT NULL, `createdAt` INTEGER NOT NULL, PRIMARY KEY(`eventId`))",
        indexSql = listOf("CREATE INDEX IF NOT EXISTS `index_social_events_v2_outbox_owner_createdAt` ON `social_events_v2_outbox` (`owner`, `createdAt`)"),
    )

    /** Version 28 : la liste des liens de suivi, servie avant tout réseau. */
    val trackingLinksCache = payloadTable("tracking_links_cache", "cacheKey", "`cachedAt` INTEGER NOT NULL,")

    /** The columns version 20 appended to `messages`, exactly as Room declares them. */
    val messageColumnsAddedIn20: List<String> = listOf(
        "`serverId` TEXT",
        "`senderId` TEXT",
        "`messageType` TEXT NOT NULL DEFAULT 'text'",
        "`deletedAt` INTEGER",
        "`expiresAt` INTEGER",
        "`pinnedAt` INTEGER",
        "`isEncrypted` INTEGER NOT NULL DEFAULT 0",
        "`encryptionMode` TEXT",
        "`encryptedPayload` TEXT",
        "`contentText` TEXT",
        "`deliveredCount` INTEGER NOT NULL DEFAULT 0",
        "`readCount` INTEGER NOT NULL DEFAULT 0",
        "`recipientCount` INTEGER NOT NULL DEFAULT 0",
        "`retryCount` INTEGER NOT NULL DEFAULT 0",
        "`lastError` TEXT",
        "`viewOnceOpenedAt` INTEGER",
        "`changeVersion` INTEGER NOT NULL DEFAULT 0",
        "`columnsBackfilled` INTEGER NOT NULL DEFAULT 0",
    )

    val messagesIndexes: List<String> = listOf(
        "CREATE INDEX IF NOT EXISTS `index_messages_serverId` ON `messages` (`serverId`)",
        "CREATE INDEX IF NOT EXISTS `index_messages_expiresAt` ON `messages` (`expiresAt`)",
        "CREATE INDEX IF NOT EXISTS `index_messages_pinnedAt` ON `messages` (`pinnedAt`)",
    )

    /** #13821 — version 22 : la fenêtre récente d'un fil (`ORDER BY createdAt DESC LIMIT n`) sans tri temporaire. */
    val messagesTimelineIndex: String =
        "CREATE INDEX IF NOT EXISTS `index_messages_conversationId_createdAt` ON `messages` (`conversationId`, `createdAt`)"

    val messages = CacheTableDefinition(
        name = "messages",
        createSql = "CREATE TABLE IF NOT EXISTS `messages` (`id` TEXT NOT NULL, `conversationId` TEXT NOT NULL, `seq` INTEGER, `payload` TEXT NOT NULL, `createdAt` INTEGER NOT NULL, `cachedAt` INTEGER NOT NULL, `sendState` TEXT, " +
            messageColumnsAddedIn20.joinToString(", ") + ", PRIMARY KEY(`id`))",
        indexSql = listOf("CREATE INDEX IF NOT EXISTS `index_messages_conversationId` ON `messages` (`conversationId`)") +
            messagesIndexes + messagesTimelineIndex,
    )

    val pendingIds = CacheTableDefinition(
        name = "pending_ids",
        createSql = "CREATE TABLE IF NOT EXISTS `pending_ids` (`localId` TEXT NOT NULL, `serverId` TEXT NOT NULL, `conversationId` TEXT NOT NULL, `reconciledAt` INTEGER, PRIMARY KEY(`localId`))",
        indexSql = listOf("CREATE INDEX IF NOT EXISTS `index_pending_ids_serverId` ON `pending_ids` (`serverId`)"),
    )

    val all: List<CacheTableDefinition> = listOf(
        payloadTable("conversations", "id", "`updatedAt` INTEGER NOT NULL, `cachedAt` INTEGER NOT NULL, `unreadCount` INTEGER NOT NULL,"),
        messages,
        payloadTable("stories", "id", "`createdAt` INTEGER NOT NULL, `cachedAt` INTEGER NOT NULL,"),
        callHistory,
        payloadTable("friends", "userId", "`sortIndex` INTEGER NOT NULL, `cachedAt` INTEGER NOT NULL,"),
        payloadTable("discover_suggestions", "userId", "`sortIndex` INTEGER NOT NULL, `cachedAt` INTEGER NOT NULL,"),
        payloadTable("profile_stats_cache", "cacheKey", "`cachedAt` INTEGER NOT NULL,"),
        payloadTable("status_bar_cache", "cacheKey", "`cachedAt` INTEGER NOT NULL,"),
        CacheTableDefinition(
            name = "friend_requests",
            createSql = "CREATE TABLE IF NOT EXISTS `friend_requests` (`id` TEXT NOT NULL, `direction` TEXT NOT NULL, `payload` TEXT NOT NULL, `sortIndex` INTEGER NOT NULL, `cachedAt` INTEGER NOT NULL, PRIMARY KEY(`id`))",
        ),
        payloadTable("blocked_users", "userId", "`sortIndex` INTEGER NOT NULL, `cachedAt` INTEGER NOT NULL,"),
        ephemeralReceipts,
        editRevisions,
        directoryContacts,
        mediaIndex,
        cacheEntries,
        keyedJsonCache,
        pendingIds,
        notifications,
        sendAttempts,
        messageTranslations,
        messageTranscriptions,
        messageAudioTranslations,
        callNetworkJournal,
        callTranscript,
        pendingCountingEvents,
        socialEventsV2Outbox,
        trackingLinksCache,
    )

    val names: Set<String> = all.map { it.name }.toSet()
}

internal fun SupportSQLiteDatabase.createCacheTable(definition: CacheTableDefinition) {
    execSQL(definition.createSql)
    definition.indexSql.forEach(::execSQL)
}
