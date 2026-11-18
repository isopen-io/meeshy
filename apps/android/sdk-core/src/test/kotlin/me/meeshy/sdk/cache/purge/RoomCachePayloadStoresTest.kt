package me.meeshy.sdk.cache.purge

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.EditRevisionEntity
import me.meeshy.core.database.entity.EphemeralReceiptEntity
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.entity.MessageTranslationEntity
import me.meeshy.core.database.entity.PendingIdEntity
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

    private fun row(id: String, sendState: String? = null) =
        MessageEntity(id = id, conversationId = "c1", seq = null, payload = "{}", createdAt = 1L, cachedAt = 0L, sendState = sendState)

    /**
     * #19440 — « Vider le cache » removes message rows by the same rule as every other gate ([MessageChildRows]): the past
     * texts of an edited message, its id bridge, its ephemeral receipt and its retained translations leave with it. A bubble still waiting to be
     * sent is not purgeable, and keeps its own.
     */
    @Test
    fun `purging the messages takes the edit history, the id bridge, the receipt and the translations of the purged rows only`() = runTest {
        db.messageDao().upsertAll(listOf(row("m1"), row("cid_2", sendState = "SENDING")))
        listOf("m1", "cid_2").forEach { id ->
            db.editRevisionDao().upsert(EditRevisionEntity(id, 1, "texte antérieur de $id", 1L))
            db.messageTranslationDao().upsertText(MessageTranslationEntity(id, "fr", "traduit $id", "en", null, null, 1L))
        }
        db.pendingIdDao().upsert(PendingIdEntity("cid_1", "m1", "c1", null))
        db.ephemeralReceiptDao().insertIfAbsent(EphemeralReceiptEntity("m1", "c1", 1L, null))

        stores.store(CacheDataKind.MESSAGES, CacheDomain.CONVERSATIONS)!!.clear()

        assertThat(db.messageDao().find("m1")).isNull()
        assertThat(db.editRevisionDao().forMessage("m1")).isEmpty()
        assertThat(db.messageTranslationDao().textsFor(listOf("m1"))).isEmpty()
        assertThat(db.pendingIdDao().byServerId("m1")).isNull()
        assertThat(db.ephemeralReceiptDao().find("m1")).isNull()
        assertThat(db.messageDao().find("cid_2")).isNotNull()
        assertThat(db.editRevisionDao().forMessage("cid_2")).hasSize(1)
        assertThat(db.messageTranslationDao().textsFor(listOf("cid_2"))).hasSize(1)
    }
}
