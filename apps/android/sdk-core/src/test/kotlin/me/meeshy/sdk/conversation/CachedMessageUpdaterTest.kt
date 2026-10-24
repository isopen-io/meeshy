package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** The read-modify-write every in-place message mutation and enrichment goes through. */
@RunWith(RobolectricTestRunner::class)
class CachedMessageUpdaterTest {

    private fun message(id: String = "m1") =
        ApiMessage(id = id, conversationId = "c1", content = "salut", createdAt = "2026-06-01T10:00:00Z")

    @Test
    fun `find decodes the cached message and knows nothing of an absent one`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        assertThat(harness.updater.find("m1")).isEqualTo(message())
        assertThat(harness.updater.find("ghost")).isNull()
    }

    @Test
    fun `update writes the transformed message back and returns it`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        val updated = harness.updater.update("m1", requireSynced = true) { it.copy(content = "bonjour") }

        assertThat(updated?.content).isEqualTo("bonjour")
        assertThat(harness.cachedMessage("m1").content).isEqualTo("bonjour")
    }

    @Test
    fun `update on an unknown message is a no-op that reports null`() = runHarnessTest { harness ->
        val updated = harness.updater.update("ghost", requireSynced = false) { it.copy(content = "x") }

        assertThat(updated).isNull()
        assertThat(harness.database.messageDao().find("ghost")).isNull()
    }

    @Test
    fun `update refuses an unsent bubble only when it requires a server-acked row`() = runHarnessTest { harness ->
        harness.database.messageDao().upsertAll(
            listOf(MessageEntityFactory.local(message("cid_1"), harness.clock.now, LocalSendState.SENDING)),
        )

        val refused = harness.updater.update("cid_1", requireSynced = true) { it.copy(content = "x") }
        val allowed = harness.updater.update("cid_1", requireSynced = false) { it.copy(content = "x") }

        assertThat(refused).isNull()
        assertThat(allowed?.content).isEqualTo("x")
        assertThat(harness.cachedSendState("cid_1")).isEqualTo(LocalSendState.SENDING.name)
    }

    @Test
    fun `a transform that returns its input skips the Room write`() = runHarnessTest { harness ->
        val untouchedPayload = MessageEntityFactory.cached(message(), harness.clock.now).payload + " "
        harness.database.messageDao().upsertAll(
            listOf(MessageEntityFactory.cached(message(), harness.clock.now).copy(payload = untouchedPayload)),
        )

        val result = harness.updater.update("m1", requireSynced = false) { it }

        assertThat(result).isEqualTo(message())
        assertThat(harness.database.messageDao().find("m1")!!.payload).isEqualTo(untouchedPayload)
    }

    @Test
    fun `an update keeps the row's other columns and re-derives the payload's`() = runHarnessTest { harness ->
        harness.seedSynced(message())
        val before = harness.database.messageDao().find("m1")!!

        harness.updater.update("m1", requireSynced = true) { it.copy(content = "bonjour") }

        val after = harness.database.messageDao().find("m1")!!
        assertThat(after.contentText).isEqualTo("bonjour")
        assertThat(after.changeVersion).isEqualTo(before.changeVersion + 1)
        assertThat(
            after.copy(payload = before.payload, contentText = before.contentText, changeVersion = before.changeVersion),
        ).isEqualTo(before)
    }
}
