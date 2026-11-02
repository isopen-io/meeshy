package me.meeshy.sdk.model.lifecycle

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TrimLevelTest {
    @Test
    fun `constants of ComponentCallbacks2 map to the three levels`() {
        assertThat(TrimLevel.fromComponentCallbacks(20)).isEqualTo(TrimLevel.UI_HIDDEN)
        assertThat(TrimLevel.fromComponentCallbacks(15)).isEqualTo(TrimLevel.RUNNING_CRITICAL)
        assertThat(TrimLevel.fromComponentCallbacks(80)).isEqualTo(TrimLevel.COMPLETE)
    }

    @Test
    fun `background list levels count as ui hidden`() {
        assertThat(TrimLevel.fromComponentCallbacks(40)).isEqualTo(TrimLevel.UI_HIDDEN)
        assertThat(TrimLevel.fromComponentCallbacks(60)).isEqualTo(TrimLevel.UI_HIDDEN)
    }

    @Test
    fun `mild running levels shed nothing`() {
        assertThat(TrimLevel.fromComponentCallbacks(5)).isNull()
        assertThat(TrimLevel.fromComponentCallbacks(10)).isNull()
    }
}
