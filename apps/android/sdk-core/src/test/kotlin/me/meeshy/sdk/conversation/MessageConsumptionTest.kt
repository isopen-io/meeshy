package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.ConsumeAfterReadPayload
import me.meeshy.sdk.outbox.ConsumeViewOncePayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13995 — la flamme-œil consommée à la sortie quitte le cache AVANT de partir vers le serveur
 * par l'outbox (iOS `AfterReadConsumption`), et la vue unique refermée consomme son compteur.
 */
@RunWith(RobolectricTestRunner::class)
class MessageConsumptionTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var outbox: OutboxRepository

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        outbox = OutboxRepository(db, db.outboxDao())
    }

    @After
    fun tearDown() = db.close()

    private class Recorder {
        val expired = mutableListOf<List<String>>()
        var flushes = 0
    }

    private fun TestScope.sut(recorder: Recorder) = MessageConsumption(
        outbox = outbox,
        expireLocally = { recorder.expired += it },
        flush = { recorder.flushes++ },
        scope = backgroundScope,
    )

    @Test
    fun `after read expires locally then queues one consumption per conversation`() = runTest {
        val recorder = Recorder()
        sut(recorder).consumeAfterReadNow("c1", listOf("m1", "m2"))

        assertThat(recorder.expired).containsExactly(listOf("m1", "m2"))
        val rows = outbox.observeAll().first()
        assertThat(rows.map { it.kind }).containsExactly(OutboxKind.CONSUME_AFTER_READ.name)
        assertThat(rows.single().lane).isEqualTo(OutboxLanes.CONSUMPTION)
        assertThat(rows.single().targetId).isEqualTo("c1")
        assertThat(MeeshyApi.json.decodeFromString(ConsumeAfterReadPayload.serializer(), rows.single().payload).messageIds)
            .containsExactly("m1", "m2").inOrder()
        assertThat(recorder.flushes).isEqualTo(1)
    }

    @Test
    fun `nothing seen queues nothing`() = runTest {
        val recorder = Recorder()
        sut(recorder).consumeAfterReadNow("c1", emptyList())

        assertThat(recorder.expired).isEmpty()
        assertThat(outbox.observeAll().first()).isEmpty()
        assertThat(recorder.flushes).isEqualTo(0)
    }

    @Test
    fun `more than the route admits is split into chunks of 200`() = runTest {
        val recorder = Recorder()
        val ids = (1..450).map { "m$it" }
        sut(recorder).consumeAfterReadNow("c1", ids)

        val sizes = outbox.observeAll().first()
            .map { MeeshyApi.json.decodeFromString(ConsumeAfterReadPayload.serializer(), it.payload).messageIds.size }
        assertThat(sizes.sorted()).containsExactly(50, 200, 200)
    }

    @Test
    fun `a closed view once queues its consumption with its conversation`() = runTest {
        val recorder = Recorder()
        sut(recorder).consumeViewOnceNow("c1", "m9")

        val row = outbox.observeAll().first().single()
        assertThat(row.kind).isEqualTo(OutboxKind.CONSUME_VIEW_ONCE.name)
        assertThat(row.targetId).isEqualTo("m9")
        assertThat(MeeshyApi.json.decodeFromString(ConsumeViewOncePayload.serializer(), row.payload).conversationId)
            .isEqualTo("c1")
        assertThat(recorder.expired).isEmpty()
        assertThat(recorder.flushes).isEqualTo(1)
    }
}
