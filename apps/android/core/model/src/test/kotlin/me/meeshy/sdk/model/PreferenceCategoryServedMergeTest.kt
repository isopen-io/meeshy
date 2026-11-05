package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Test

class PreferenceCategoryServedMergeTest {

    private val codec = PreferenceCategoryCodecs.video

    @Test
    fun `the served block wins field by field`() {
        val merged = codec.mergeServed(
            local = VideoPreferences(mirrorLocalVideo = true),
            served = VideoPreferences(mirrorLocalVideo = false),
        )

        assertThat(merged.mirrorLocalVideo).isFalse()
    }

    @Test
    fun `an unknown key held only locally survives the merge`() {
        val merged = codec.mergeServed(
            local = VideoPreferences(extras = mapOf("futureLocal" to JsonPrimitive(1))),
            served = VideoPreferences(),
        )

        assertThat(merged.extras).containsKey("futureLocal")
    }

    @Test
    fun `an unknown key served by the gateway is kept and wins over the local one`() {
        val merged = codec.mergeServed(
            local = VideoPreferences(extras = mapOf("flag" to JsonPrimitive(1))),
            served = VideoPreferences(extras = mapOf("flag" to JsonPrimitive(2), "other" to JsonPrimitive(3))),
        )

        assertThat(merged.extras["flag"]).isEqualTo(JsonPrimitive(2))
        assertThat(merged.extras["other"]).isEqualTo(JsonPrimitive(3))
    }

    @Test
    fun `merged extras travel flat in the next PATCH body`() {
        val merged = codec.mergeServed(VideoPreferences(), VideoPreferences(extras = mapOf("flag" to JsonPrimitive(2))))

        assertThat(codec.snapshot(merged)).containsKey("flag")
    }

    @Test
    fun `the application consent stamps are read but never sent`() {
        val application = PreferenceCategoryCodecs.application
        val merged = application.mergeServed(ApplicationPreferences(), ApplicationPreferences(dataProcessingConsentAt = "2026-01-01"))

        assertThat(merged.dataProcessingConsentAt).isEqualTo("2026-01-01")
        assertThat(application.snapshot(merged)).doesNotContainKey("dataProcessingConsentAt")
    }
}
