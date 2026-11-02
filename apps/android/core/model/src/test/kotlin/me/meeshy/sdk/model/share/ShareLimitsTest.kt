package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Les plafonds sont ceux de `SHARE_LIMITS` (packages/shared) et de `ShareLimits` (iOS), valeur pour valeur. */
class ShareLimitsTest {

    @Test
    fun `the shared share ceilings match the typescript and swift mirrors`() {
        assertThat(ShareLimits.MAX_FILES).isEqualTo(100)
        assertThat(ShareLimits.MAX_TOTAL_BYTES).isEqualTo(5_368_709_120L)
        assertThat(ShareLimits.MAX_RECIPIENTS).isEqualTo(10)
        assertThat(ShareLimits.MAX_PUBLICATION_MEDIA).isEqualTo(10)
        assertThat(ShareLimits.MAX_CAPTION_LENGTH).isEqualTo(5000)
    }
}
