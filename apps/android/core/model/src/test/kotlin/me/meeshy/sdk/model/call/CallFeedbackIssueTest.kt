package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFeedbackIssueTest {
    @Test
    fun `wire values match the gateway schema`() {
        assertThat(CallFeedbackIssue.entries.map { it.wire })
            .containsExactly("audio_quality", "video_quality", "echo", "dropped", "sync", "other").inOrder()
    }

    @Test
    fun `rating outside 1 to 5 or blank call is rejected`() {
        assertThat(CallQualityFeedback.of("c", 0, emptyList())).isNull()
        assertThat(CallQualityFeedback.of("c", 6, emptyList())).isNull()
        assertThat(CallQualityFeedback.of("", 3, emptyList())).isNull()
    }

    @Test
    fun `payload omits issues when none and dedupes when present`() {
        assertThat(CallQualityFeedback.of("c", 5, emptyList())!!.socketFields()).containsExactly("callId", "c", "rating", 5)
        val fields = CallQualityFeedback.of("c", 2, listOf(CallFeedbackIssue.ECHO, CallFeedbackIssue.ECHO, CallFeedbackIssue.SYNC))!!.socketFields()
        assertThat(fields["issues"]).isEqualTo(listOf("echo", "sync"))
    }
}
