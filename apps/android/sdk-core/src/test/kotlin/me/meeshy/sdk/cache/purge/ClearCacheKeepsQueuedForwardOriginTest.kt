package me.meeshy.sdk.cache.purge

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.core.database.entity.PendingIdEntity
import me.meeshy.sdk.model.mediacache.CacheDataKind
import me.meeshy.sdk.model.mediacache.CacheDomain
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.share.FanoutResolution
import me.meeshy.sdk.share.ShareFanoutOriginResolver
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Audit adversarial du lot #19420 (constat 2) — « Vider le cache » n'est pas une suppression : le message vit sur le
 * serveur. Un transfert de MON message, mis en file après son accusé, nomme son origine par le `cid_` de la bulle et la
 * résout par le pont `pending_ids` au moment de partir (`SendMessageHandler.fanoutOrigin`). Sans le pont, la ligne rend
 * `SendResult.Deferred`, bloque la file FIFO de sa conversation jusqu'à `DEFERRED_MAX_WAIT_MS` (30 min), puis s'épuise ;
 * « Réessayer » ne peut plus jamais la résoudre.
 *
 * Le pont que nomme une ligne de la file survit au vidage ; celui que plus rien ne nomme part avec ses messages (#19440, A3).
 */
@RunWith(RobolectricTestRunner::class)
class ClearCacheKeepsQueuedForwardOriginTest {

    private val db: MeeshyDatabase = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext(),
        MeeshyDatabase::class.java,
    ).allowMainThreadQueries().build()

    private val stores = RoomCachePayloadStores(db)

    @After
    fun tearDown() = db.close()

    @Test
    fun `clearing the cache keeps the id bridge a queued forward still resolves its origin through`() = runTest {
        db.messageDao().upsertAll(
            listOf(MessageEntity(id = "m1", conversationId = "c1", seq = null, payload = "{}", createdAt = 1L, cachedAt = 0L)),
        )
        db.pendingIdDao().upsert(PendingIdEntity("cid_1", "m1", "c1", null))
        db.outboxDao().upsert(queuedForwardOf("cid_1"))

        stores.store(CacheDataKind.MESSAGES, CacheDomain.CONVERSATIONS)!!.clear()

        assertThat(ShareFanoutOriginResolver.resolve("cid_1", db.pendingIdDao().byLocalId("cid_1")?.serverId))
            .isEqualTo(FanoutResolution.Ready("m1"))
    }

    @Test
    fun `clearing the cache still drops a bridge no queued row names`() = runTest {
        db.messageDao().upsertAll(
            listOf(MessageEntity(id = "m1", conversationId = "c1", seq = null, payload = "{}", createdAt = 1L, cachedAt = 0L)),
        )
        db.pendingIdDao().upsert(PendingIdEntity("cid_1", "m1", "c1", null))

        stores.store(CacheDataKind.MESSAGES, CacheDomain.CONVERSATIONS)!!.clear()

        assertThat(db.pendingIdDao().byLocalId("cid_1")).isNull()
    }

    private fun queuedForwardOf(origin: String) = OutboxEntity(
        cmid = "cid_fwd", lane = OutboxLanes.forMessage("c2"), kind = OutboxKind.SEND_MESSAGE.name, targetId = "c2",
        payload = "{\"content\":\"\",\"copyAttachmentsFromMessageId\":\"$origin\"}", dependsOn = null, attempts = 0,
        state = OutboxState.PENDING.name, createdAt = 2L, updatedAt = 2L, lastError = null, ownerId = "A",
    )
}
