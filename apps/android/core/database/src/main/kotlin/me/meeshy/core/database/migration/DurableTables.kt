package me.meeshy.core.database.migration

import androidx.sqlite.db.SupportSQLiteDatabase

/** Tables whose rows are the only copy of user intent: a migration may never drop or empty them. */
internal object DurableTables {
    val names: Set<String> = setOf("outbox", "media_blob", "tus_upload_checkpoint", "sync_meta")
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

    val messages = CacheTableDefinition(
        name = "messages",
        createSql = "CREATE TABLE IF NOT EXISTS `messages` (`id` TEXT NOT NULL, `conversationId` TEXT NOT NULL, `seq` INTEGER, `payload` TEXT NOT NULL, `createdAt` INTEGER NOT NULL, `cachedAt` INTEGER NOT NULL, `sendState` TEXT, " +
            messageColumnsAddedIn20.joinToString(", ") + ", PRIMARY KEY(`id`))",
        indexSql = listOf("CREATE INDEX IF NOT EXISTS `index_messages_conversationId` ON `messages` (`conversationId`)") + messagesIndexes,
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
        payloadTable("call_history", "callId", "`startedAt` INTEGER NOT NULL, `cachedAt` INTEGER NOT NULL,"),
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
    )

    val names: Set<String> = all.map { it.name }.toSet()
}

internal fun SupportSQLiteDatabase.createCacheTable(definition: CacheTableDefinition) {
    execSQL(definition.createSql)
    definition.indexSql.forEach(::execSQL)
}
