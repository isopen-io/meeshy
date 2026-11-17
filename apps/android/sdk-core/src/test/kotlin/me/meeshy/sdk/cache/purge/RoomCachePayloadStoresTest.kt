package me.meeshy.sdk.cache.purge

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.entity.StoryEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.model.mediacache.CacheDataKind
import me.meeshy.sdk.model.mediacache.CacheDomain
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #19050 — a purged store no longer believes itself fresh: its `sync_meta` (freshness, watermark, `ETag`) goes with the
 * rows it described. Kept, the first conditional request after the purge was answered 304 and confirmed an EMPTY cache
 * as fresh; a kept freshness alone made an emptied list look settled until it went stale.
 */
@RunWith(RobolectricTestRunner::class)
class RoomCachePayloadStoresTest {

    private val db: MeeshyDatabase = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext(),
        MeeshyDatabase::class.java,
    ).allowMainThreadQueries().build()

    private val stores = RoomCachePayloadStores(db)

    @After
    fun tearDown() = db.close()

    private suspend fun meta(key: String) =
        db.syncMetaDao().upsert(SyncMetaEntity(key, lastSyncedAt = 1L, contentWatermarkMillis = 2L, etag = "\"$key\"", etagRequestKey = null))

    @Test
    fun `purging the messages drops the freshness and the validator of every thread, and of nothing else`() = runTest {
        db.messageDao().upsertAll(
            listOf(MessageEntity(id = "m1", conversationId = "c1", seq = null, payload = "{}", createdAt = 1L, cachedAt = 0L)),
        )
        meta("messages:c1")
        meta("messages:c2")
        meta("conversations")

        stores.store(CacheDataKind.MESSAGES, CacheDomain.CONVERSATIONS)!!.clear()

        assertThat(db.messageDao().find("m1")).isNull()
        assertThat(db.syncMetaDao().lastSyncedAt("messages:c1")).isNull()
        assertThat(db.syncMetaDao().etag("messages:c2")).isNull()
        assertThat(db.syncMetaDao().etag("conversations")).isEqualTo("\"conversations\"")
    }

    @Test
    fun `purging the conversations drops the freshness, the watermark and the validator of the list`() = runTest {
        meta("conversations")
        meta("messages:c1")

        stores.store(CacheDataKind.PAYLOADS, CacheDomain.CONVERSATIONS)!!.clear()

        assertThat(db.syncMetaDao().lastSyncedAt("conversations")).isNull()
        assertThat(db.syncMetaDao().watermark("conversations")).isNull()
        assertThat(db.syncMetaDao().etag("conversations")).isNull()
        assertThat(db.syncMetaDao().etag("messages:c1")).isEqualTo("\"messages:c1\"")
    }

    @Test
    fun `purging the stories drops their freshness`() = runTest {
        db.storyDao().upsertAll(listOf(StoryEntity(id = "s1", payload = "{}", createdAt = 1L, cachedAt = 0L)))
        meta("stories")

        stores.store(CacheDataKind.PAYLOADS, CacheDomain.STORIES)!!.clear()

        assertThat(db.storyDao().payloadBytes()).isEqualTo(0L)
        assertThat(db.syncMetaDao().lastSyncedAt("stories")).isNull()
    }
}
