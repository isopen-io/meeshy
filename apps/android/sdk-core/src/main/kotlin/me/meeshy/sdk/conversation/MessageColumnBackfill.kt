package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.MeeshyApi

/**
 * Derives the queryable columns of the rows written before they existed, from their payload.
 *
 * Done in Kotlin after the migration rather than in SQL (`json_extract` would couple the schema to
 * the JSON shape and block the first launch): the migration only appends the columns, this
 * pass fills them in small transactions, oldest first, off the main thread. Idempotent — a row is
 * claimed by `columnsBackfilled`, so a second run (or a killed first one) touches nothing twice.
 * A payload that no longer decodes is marked done with its columns left at their defaults: it
 * must not be retried forever, and the revalidation rewrites it from the server.
 */
@Singleton
public class MessageColumnBackfill @Inject internal constructor(
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
) {

    /** Runs to completion; returns how many rows were processed. */
    public suspend fun run(batchSize: Int = DEFAULT_BATCH): Int {
        var processed = 0
        while (true) {
            val batch = database.withTransaction {
                val rows = messageDao.unbackfilled(batchSize)
                if (rows.isNotEmpty()) messageDao.upsertAll(rows.map(::derive))
                rows.size
            }
            if (batch == 0) return processed
            processed += batch
        }
    }

    /** Fire-and-forget entry point for the startup hook. */
    public fun launchIn(scope: CoroutineScope): Job = scope.launch {
        try {
            run()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            // Best effort: the rows left at columnsBackfilled = 0 are retried at the next launch.
        }
    }

    private fun derive(row: MessageEntity): MessageEntity {
        val message = try {
            MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)
        } catch (_: Exception) {
            return row.copy(columnsBackfilled = true)
        }
        return MessageEntityFactory.refreshed(row, message).copy(
            serverId = row.serverId ?: message.id.takeIf { row.sendState == null },
            payload = row.payload,
            viewOnceOpenedAt = row.viewOnceOpenedAt ?: row.cachedAt.takeIf { message.isViewOnceOpenedByMe },
        )
    }

    private companion object {
        const val DEFAULT_BATCH = 200
    }
}
