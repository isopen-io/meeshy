package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiPostReplyTarget
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MessageIngestCitationTest {

    private fun reply(postReplyTo: ApiPostReplyTarget? = null, storyReplyToId: String? = null) =
        ApiMessage(id = "m1", conversationId = "c1", postReplyTo = postReplyTo, storyReplyToId = storyReplyToId)

    @Test
    fun `a reply whose story snapshot did not travel is engraved as an unavailable story`() = runHarnessTest { harness ->
        MessageIngestPipeline(harness.database).ingest(listOf(reply(storyReplyToId = "s1")), harness.clock.now)

        assertThat(harness.cachedMessage("m1").postReplyTo).isEqualTo(ApiPostReplyTarget(id = "s1", unavailable = true))
    }

    @Test
    fun `a mood snapshot is engraved with its emoji and survives a lighter echo`() = runHarnessTest { harness ->
        val pipeline = MessageIngestPipeline(harness.database)
        val mood = ApiPostReplyTarget(id = "p1", moodEmoji = "😀", previewText = "Heureux", createdAt = "2026-10-01T10:00:00Z")
        pipeline.ingest(listOf(reply(postReplyTo = mood, storyReplyToId = "p1")), harness.clock.now)

        pipeline.ingest(listOf(reply(storyReplyToId = "p1")), harness.clock.now + 1)

        assertThat(harness.cachedMessage("m1").postReplyTo).isEqualTo(mood)
    }
}
