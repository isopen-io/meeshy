package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ServerTranscriptionWaitTest {

    private val requestedAt = 1_000_000L

    @Test
    fun `waits right after the request`() {
        assertThat(ServerTranscriptionWait.isWaiting(requestedAt, nowMs = requestedAt, hasArrived = false)).isTrue()
    }

    @Test
    fun `still waits one millisecond before the silence ceiling`() {
        assertThat(
            ServerTranscriptionWait.isWaiting(requestedAt, nowMs = requestedAt + 89_999L, hasArrived = false),
        ).isTrue()
    }

    @Test
    fun `stops waiting at ninety seconds of silence`() {
        assertThat(ServerTranscriptionWait.SILENCE_CEILING_MS).isEqualTo(90_000L)
        assertThat(
            ServerTranscriptionWait.isWaiting(requestedAt, nowMs = requestedAt + 90_000L, hasArrived = false),
        ).isFalse()
    }

    @Test
    fun `stops waiting the moment the transcription arrives`() {
        assertThat(ServerTranscriptionWait.isWaiting(requestedAt, nowMs = requestedAt + 1L, hasArrived = true)).isFalse()
    }

    @Test
    fun `a clock that went backwards keeps waiting`() {
        assertThat(ServerTranscriptionWait.isWaiting(requestedAt, nowMs = requestedAt - 5_000L, hasArrived = false)).isTrue()
    }

    @Test
    fun `request state is idle once the transcription arrived, even if it was asked and failed`() {
        assertThat(ServerTranscriptionWait.requestState(requestedAt, requestedAt + 1L, hasArrived = true, failed = true))
            .isEqualTo(MessageTranscriptionFiche.Request.IDLE)
    }

    @Test
    fun `request state is failed when the socket reported a failure and nothing arrived`() {
        assertThat(ServerTranscriptionWait.requestState(requestedAt, requestedAt + 1L, hasArrived = false, failed = true))
            .isEqualTo(MessageTranscriptionFiche.Request.FAILED)
    }

    @Test
    fun `request state is in flight while the wait lasts`() {
        assertThat(ServerTranscriptionWait.requestState(requestedAt, requestedAt + 30_000L, hasArrived = false, failed = false))
            .isEqualTo(MessageTranscriptionFiche.Request.IN_FLIGHT)
    }

    @Test
    fun `request state returns to idle after the silence ceiling so the request can be made again`() {
        assertThat(ServerTranscriptionWait.requestState(requestedAt, requestedAt + 90_000L, hasArrived = false, failed = false))
            .isEqualTo(MessageTranscriptionFiche.Request.IDLE)
    }

    @Test
    fun `request state is idle when nothing was ever requested`() {
        assertThat(ServerTranscriptionWait.requestState(null, requestedAt, hasArrived = false, failed = false))
            .isEqualTo(MessageTranscriptionFiche.Request.IDLE)
    }
}
