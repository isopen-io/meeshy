package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallRecord
import org.junit.Test

class CallHistoryContentTest {

    private val row = CallRecord(
        callId = "c1", conversationId = "conv1", conversationType = "direct", mode = "p2p",
        status = "ended", direction = "missed", isVideo = false, startedAt = "2026-07-01T10:00:00Z", durationSec = 0,
    )

    @Test
    fun `a cold start that fails offline says so instead of claiming there is no call`() {
        assertThat(CallHistoryContent.of(CallHistoryUiState(errorMessage = "offline"))).isEqualTo(CallHistoryContent.ERROR)
    }

    @Test
    fun `cached rows stay on screen when a later page fails`() {
        assertThat(CallHistoryContent.of(CallHistoryUiState(records = listOf(row), errorMessage = "offline")))
            .isEqualTo(CallHistoryContent.LIST)
    }

    @Test
    fun `the missed filter still paging shows the list footer, not an empty state`() {
        assertThat(CallHistoryContent.of(CallHistoryUiState(missedOnly = true, hasMore = true)))
            .isEqualTo(CallHistoryContent.LIST)
    }

    @Test
    fun `an exhausted journal with nothing to show is empty`() {
        assertThat(CallHistoryContent.of(CallHistoryUiState(missedOnly = true, hasMore = false))).isEqualTo(CallHistoryContent.EMPTY)
        assertThat(CallHistoryContent.of(CallHistoryUiState(hasMore = true))).isEqualTo(CallHistoryContent.EMPTY)
    }

    @Test
    fun `the skeleton wins on a cold empty cache`() {
        assertThat(CallHistoryContent.of(CallHistoryUiState(showSkeleton = true))).isEqualTo(CallHistoryContent.SKELETON)
    }
}
