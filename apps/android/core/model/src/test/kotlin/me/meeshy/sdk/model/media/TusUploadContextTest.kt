package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [TusUploadContext.fromWire] is the round-trip inverse of [TusUploadContext.wire] —
 * the durable outbox (`MediaUploadPayload`, `OutboxFlushWorker`) persists the wire
 * string and must recover the exact enum constant on drain, potentially after an app
 * upgrade shipped between enqueue and drain. Mirrors gateway
 * `isPostMediaUploadContext` (`services/gateway/src/services/posts/mediaOwnership.ts`)
 * — those four strings are the only ones the server accepts.
 */
class TusUploadContextTest {

    @Test
    fun `fromWire recovers every context from its own wire string`() {
        TusUploadContext.entries.forEach { context ->
            assertThat(TusUploadContext.fromWire(context.wire)).isEqualTo(context)
        }
    }

    @Test
    fun `fromWire is unknown-safe`() {
        assertThat(TusUploadContext.fromWire("message")).isNull()
        assertThat(TusUploadContext.fromWire("")).isNull()
        assertThat(TusUploadContext.fromWire("STORY")).isNull()
    }
}
