package me.meeshy.core.database.dao

import android.database.sqlite.SQLiteException
import androidx.sqlite.db.SupportSQLiteDatabase
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.search.SearchIndexSchema

/** A cached message found by the local index; [text] is the original text, never a translation. */
public data class MessageSearchRow(
    val messageId: String,
    val conversationId: String,
    val createdAt: Long,
    val text: String,
)

/**
 * Reads and writes the local FTS index (see [SearchIndexSchema]). Not a Room `@Dao`: the index
 * tables are raw SQL, which Room's query verifier does not know.
 *
 * The message index has no write method on purpose: it follows `messages` through triggers. The
 * conversation index is written by [replaceConversation], called from the transaction that writes
 * the conversation cache. Queries are the `MATCH` expressions produced by `FtsQuerySanitizer`.
 */
public class SearchIndexDao @Inject constructor(private val database: MeeshyDatabase) {

    /** Replaces the entry of [conversationId]; the texts are expected already folded by the caller. */
    public fun replaceConversation(conversationId: String, title: String, peerName: String) {
        try {
            val db = database.openHelper.writableDatabase
            db.execSQL("DELETE FROM `${SearchIndexSchema.CONVERSATION_TABLE}` WHERE `conversationId` = ?", arrayOf<Any?>(conversationId))
            if (title.isBlank() && peerName.isBlank()) return
            db.execSQL(
                "INSERT INTO `${SearchIndexSchema.CONVERSATION_TABLE}`(`title`, `peerName`, `conversationId`) VALUES (?, ?, ?)",
                arrayOf<Any?>(title, peerName, conversationId),
            )
        } catch (_: SQLiteException) {
            // The index is a projection: a failure here must never fail the cache write around it.
        }
    }

    /** The newest [limit] indexed messages matching [match], most recent first. */
    public suspend fun searchMessages(match: String, limit: Int): List<MessageSearchRow> = onDisk { db ->
        db.query(
            "SELECT m.`id`, m.`conversationId`, m.`createdAt`, m.`contentText` FROM `${SearchIndexSchema.MESSAGE_TABLE}` " +
                "JOIN `messages` m ON m.`rowid` = `${SearchIndexSchema.MESSAGE_TABLE}`.`docid` " +
                "WHERE `${SearchIndexSchema.MESSAGE_TABLE}` MATCH ? AND m.`deletedAt` IS NULL " +
                "ORDER BY m.`createdAt` DESC LIMIT ?",
            arrayOf<Any?>(match, limit),
        ).use { cursor ->
            generateSequence { if (cursor.moveToNext()) cursor else null }
                .map { MessageSearchRow(it.getString(0), it.getString(1), it.getLong(2), it.getString(3).orEmpty()) }
                .toList()
        }
    }

    /** The ids of the cached conversations matching [match], most recently active first. */
    public suspend fun searchConversations(match: String, limit: Int): List<String> = onDisk { db ->
        db.query(
            "SELECT c.`id` FROM `${SearchIndexSchema.CONVERSATION_TABLE}` " +
                "JOIN `conversations` c ON c.`id` = `${SearchIndexSchema.CONVERSATION_TABLE}`.`conversationId` " +
                "WHERE `${SearchIndexSchema.CONVERSATION_TABLE}` MATCH ? ORDER BY c.`updatedAt` DESC LIMIT ?",
            arrayOf<Any?>(match, limit),
        ).use { cursor ->
            generateSequence { if (cursor.moveToNext()) cursor.getString(0) else null }.toList()
        }
    }

    /** Re-reads the whole cache into the message index (forced rebuild). */
    public suspend fun rebuildMessages() {
        onDisk { SearchIndexSchema.rebuildMessages(database.openHelper.writableDatabase) }
    }

    private suspend fun <T> onDisk(block: (SupportSQLiteDatabase) -> T): T =
        withContext(Dispatchers.IO) { block(database.openHelper.readableDatabase) }
}
