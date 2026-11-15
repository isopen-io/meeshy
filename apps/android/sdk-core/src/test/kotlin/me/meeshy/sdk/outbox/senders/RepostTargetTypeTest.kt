package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.RepostPayload
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.story.StoryRepository
import org.junit.Test

class RepostTargetTypeTest {

    @Test
    fun `a queued repost without its target type is never sent, the gateway fallback would make a permanent post of an ephemeral source`() = runTest {
        val handler = RepostPostHandler(mockk<PostApi>(), senderJson, mockk<StoryRepository>(relaxed = true))
        val withoutType = outboxRow(OutboxKind.REPOST_POST, targetId = "s1", payload = """{"isQuote":false}""")

        assertThat(handler.send(withoutType)).isInstanceOf(SendResult.PermanentFailure::class.java)
    }

    @Test
    fun `the payload always writes its target type`() {
        val json = senderJson.encodeToString(RepostPayload.serializer(), RepostPayload(targetType = "STORY"))

        assertThat(json).contains("\"targetType\":\"STORY\"")
    }
}
