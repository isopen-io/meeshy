package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.flow.first
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.api.MessageApi
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #18915 (AND-09) — a thread is judged fresh or stale on ONE window, the messages one (2 min, iOS's): the stream used
 * the default 5 min while the preview (`isCacheFresh`) judged with 2 min, so a thread synced four minutes ago reopened
 * « fresh » without revalidating while its preview found it stale. The stream reads the system clock (`cacheFirstFlow`
 * takes no clock from the reader): the sync instant is seeded against it.
 */
@RunWith(RobolectricTestRunner::class)
class MessageStreamFreshnessTest {

    @Test
    fun `a thread synced three minutes ago opens stale, so it revalidates`() = runHarnessTest { harness ->
        harness.seedSynced(ApiMessage(id = "m1", conversationId = CONVERSATION, content = "salut", createdAt = "2026-06-01T10:00:00Z"))
        harness.database.syncMetaDao().upsert(SyncMetaEntity("messages:$CONVERSATION", System.currentTimeMillis() - THREE_MINUTES))
        val api = mockk<MessageApi> {
            coEvery { listConditional(CONVERSATION, any()) } throws IOException("offline")
        }
        val repo = MessageRepository(
            api,
            mockk(relaxed = true),
            harness.database,
            harness.database.messageDao(),
            harness.database.syncMetaDao(),
            harness.outbox,
            harness.clock,
            regime = EndToEndRegimeKeeper(EndToEndRegimeLedger.None, harness.database),
        )

        val first = repo.messagesStream(CONVERSATION).first()

        assertThat(first).isInstanceOf(CacheResult.Stale::class.java)
    }

    private companion object {
        const val CONVERSATION = "c1"
        const val THREE_MINUTES = 180_000L
    }
}
