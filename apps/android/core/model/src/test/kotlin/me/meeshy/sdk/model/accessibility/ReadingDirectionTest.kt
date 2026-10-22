package me.meeshy.sdk.model.accessibility

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReadingDirectionTest {
    @Test fun `en LTR le delta est l identite`() {
        assertThat(ReadingDirection.readingDelta(-60f, isRtl = false)).isEqualTo(-60f)
    }

    @Test fun `en RTL le delta est inverse`() {
        assertThat(ReadingDirection.readingDelta(-60f, isRtl = true)).isEqualTo(60f)
    }

    @Test fun `un glissement nul reste un zero positif en RTL`() {
        assertThat(ReadingDirection.readingDelta(0f, isRtl = true)).isEqualTo(0f)
    }
}
