package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostTranslationSheetStateTest {

    private val missing = setOf("de", "ja")

    @Test
    fun `a language nobody asked for is idle`() {
        assertThat(PostTranslationSheetState().statusOf("de", translating = emptySet())).isEqualTo(PostTranslationStatus.IDLE)
    }

    @Test
    fun `a language just asked is shown requested until the request is in flight`() {
        val state = PostTranslationSheetState().asked("de")

        assertThat(state.statusOf("de", translating = emptySet())).isEqualTo(PostTranslationStatus.REQUESTED)
        assertThat(state.statusOf("ja", translating = emptySet())).isEqualTo(PostTranslationStatus.IDLE)
    }

    @Test
    fun `a request in flight is translating whatever was asked here`() {
        assertThat(PostTranslationSheetState().statusOf("de", translating = setOf("DE"))).isEqualTo(PostTranslationStatus.TRANSLATING)
    }

    @Test
    fun `a request that ends with the language still missing is failed and can be asked again`() {
        val inFlight = PostTranslationSheetState().asked("de").observing(translating = setOf("de"), missing = missing)
        val ended = inFlight.observing(translating = emptySet(), missing = missing)

        assertThat(ended.statusOf("de", translating = emptySet())).isEqualTo(PostTranslationStatus.FAILED)
        assertThat(ended.asked("de").statusOf("de", translating = emptySet())).isEqualTo(PostTranslationStatus.REQUESTED)
    }

    @Test
    fun `a request that lands removes the language from the missing ones and leaves no failure behind`() {
        val inFlight = PostTranslationSheetState().asked("de").observing(translating = setOf("de"), missing = missing)
        val landed = inFlight.observing(translating = emptySet(), missing = setOf("ja"))

        assertThat(landed.statusOf("de", translating = emptySet())).isEqualTo(PostTranslationStatus.IDLE)
    }

    @Test
    fun `a request started elsewhere that fails is not blamed on this sheet`() {
        val ended = PostTranslationSheetState()
            .observing(translating = setOf("ja"), missing = missing)
            .observing(translating = emptySet(), missing = missing)

        assertThat(ended.statusOf("ja", translating = emptySet())).isEqualTo(PostTranslationStatus.IDLE)
    }

    @Test
    fun `the confidence is a whole percent and absent without a score`() {
        assertThat(postTranslationConfidencePercent(0.876)).isEqualTo(88)
        assertThat(postTranslationConfidencePercent(null)).isNull()
    }
}
