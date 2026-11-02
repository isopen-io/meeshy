package me.meeshy.core.database.search

import android.database.sqlite.SQLiteException
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * The local full-text index (FTS4), created with raw SQL rather than as Room entities: Room would
 * validate the exact `CREATE VIRTUAL TABLE` text and could not fall back to an older tokenizer
 * option on a device whose system SQLite is too old.
 *
 * - `message_fts` is an EXTERNAL-CONTENT index over `messages.contentText`. Four triggers keep it
 *   in step with every writer of `messages` (upsert, edit, delete, retention sweep, purge of a
 *   conversation, `clearAllTables`), so there is no second writer to race with the cache. The text
 *   is the ORIGINAL message text (the Prisme resolves the language at display time, never here),
 *   and `contentText` is null for every protected message, so those are never indexed.
 * - `conversation_fts` is a standalone index of titles and peer names, fed by the conversation
 *   cache write; a trigger on `conversations` removes the row of a deleted conversation.
 *
 * Both are projections: the cache stays the source of truth and [create] + a rebuild recreates them.
 */
public object SearchIndexSchema {

    public const val MESSAGE_TABLE: String = "message_fts"
    public const val CONVERSATION_TABLE: String = "conversation_fts"

    /** `remove_diacritics=2` needs SQLite 3.27 (API 30+); older system builds take the `1` form. */
    public fun removeDiacriticsFor(sqliteVersion: String): Int {
        val parts = sqliteVersion.split('.').map { it.toIntOrNull() ?: 0 }
        val major = parts.getOrElse(0) { 0 }
        val minor = parts.getOrElse(1) { 0 }
        return if (major > 3 || (major == 3 && minor >= 27)) 2 else 1
    }

    /** The DDL of the whole index for the given tokenizer option, in creation order. */
    public fun statements(removeDiacritics: Int): List<String> = listOf(
        "CREATE VIRTUAL TABLE IF NOT EXISTS `$MESSAGE_TABLE` USING fts4(content=`messages`, `contentText`, " +
            "tokenize=unicode61 `remove_diacritics=$removeDiacritics`)",
        "CREATE TRIGGER IF NOT EXISTS `message_fts_before_update` BEFORE UPDATE OF `contentText` ON `messages` " +
            "WHEN old.`contentText` IS NOT NULL BEGIN DELETE FROM `$MESSAGE_TABLE` WHERE `docid` = old.`rowid`; END",
        "CREATE TRIGGER IF NOT EXISTS `message_fts_before_delete` BEFORE DELETE ON `messages` " +
            "WHEN old.`contentText` IS NOT NULL BEGIN DELETE FROM `$MESSAGE_TABLE` WHERE `docid` = old.`rowid`; END",
        "CREATE TRIGGER IF NOT EXISTS `message_fts_after_update` AFTER UPDATE OF `contentText` ON `messages` " +
            "WHEN new.`contentText` IS NOT NULL BEGIN INSERT INTO `$MESSAGE_TABLE`(`docid`, `contentText`) " +
            "VALUES (new.`rowid`, new.`contentText`); END",
        "CREATE TRIGGER IF NOT EXISTS `message_fts_after_insert` AFTER INSERT ON `messages` " +
            "WHEN new.`contentText` IS NOT NULL BEGIN INSERT INTO `$MESSAGE_TABLE`(`docid`, `contentText`) " +
            "VALUES (new.`rowid`, new.`contentText`); END",
        "CREATE VIRTUAL TABLE IF NOT EXISTS `$CONVERSATION_TABLE` USING fts4(`title`, `peerName`, `conversationId`, " +
            "notindexed=`conversationId`, tokenize=unicode61 `remove_diacritics=$removeDiacritics`)",
        "CREATE TRIGGER IF NOT EXISTS `conversation_fts_after_delete` AFTER DELETE ON `conversations` " +
            "BEGIN DELETE FROM `$CONVERSATION_TABLE` WHERE `conversationId` = old.`id`; END",
    )

    private val triggerNames: List<String> = listOf(
        "message_fts_before_update",
        "message_fts_before_delete",
        "message_fts_after_update",
        "message_fts_after_insert",
        "conversation_fts_after_delete",
    )

    /** Whether [table] belongs to the index (the virtual tables and their FTS shadow tables). */
    public fun owns(table: String): Boolean =
        table.startsWith("${MESSAGE_TABLE}_") || table == MESSAGE_TABLE ||
            table.startsWith("${CONVERSATION_TABLE}_") || table == CONVERSATION_TABLE

    /** Creates the index (idempotent) with the best tokenizer option the running SQLite accepts. */
    public fun create(db: SupportSQLiteDatabase) {
        val preferred = removeDiacriticsFor(sqliteVersion(db))
        try {
            statements(preferred).forEach(db::execSQL)
        } catch (failure: SQLiteException) {
            if (preferred == 1) throw failure
            statements(1).forEach(db::execSQL)
        }
    }

    /** Re-reads every `messages` row into the message index. */
    public fun rebuildMessages(db: SupportSQLiteDatabase) {
        db.execSQL("INSERT INTO `$MESSAGE_TABLE`(`$MESSAGE_TABLE`) VALUES ('rebuild')")
    }

    /** Drops the index; its triggers go with it. The cache tables are not touched. */
    public fun drop(db: SupportSQLiteDatabase) {
        triggerNames.forEach { db.execSQL("DROP TRIGGER IF EXISTS `$it`") }
        db.execSQL("DROP TABLE IF EXISTS `$MESSAGE_TABLE`")
        db.execSQL("DROP TABLE IF EXISTS `$CONVERSATION_TABLE`")
    }

    /** Creates what is missing and re-reads the cache when the message index had to be created. */
    public fun ensure(db: SupportSQLiteDatabase) {
        val present = db.query(
            "SELECT name FROM sqlite_master WHERE name IN ('$MESSAGE_TABLE', '$CONVERSATION_TABLE', " +
                triggerNames.joinToString(",") { "'$it'" } + ")",
        ).use { it.count }
        if (present == triggerNames.size + 2) return
        val messageIndexExisted = db.query("SELECT 1 FROM sqlite_master WHERE name = '$MESSAGE_TABLE'").use { it.count > 0 }
        create(db)
        if (!messageIndexExisted) rebuildMessages(db)
    }

    /** Installs the index on every open: fresh install, destructive reset of an old build, test database. */
    public val callback: RoomDatabase.Callback = object : RoomDatabase.Callback() {
        override fun onOpen(db: SupportSQLiteDatabase) {
            try {
                ensure(db)
            } catch (_: SQLiteException) {
                // Search is a projection: a database that cannot hold it still serves the cache.
            }
        }
    }

    private fun sqliteVersion(db: SupportSQLiteDatabase): String =
        try {
            db.query("SELECT sqlite_version()").use { if (it.moveToFirst()) it.getString(0) else "" }
        } catch (_: SQLiteException) {
            ""
        }
}
