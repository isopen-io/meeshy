package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallChromeStow
import org.junit.Test

/**
 * A1.4 — le journal déplié sous la bulle entre et sort en fondu glissé (transformation + opacité, jamais la hauteur) ;
 * « Réduire les animations » le remplace par un fondu court, sans glissement (iOS `BubbleCallJournalUnderCard` :
 * `.opacity.combined(with: .move(edge: .top))`, `easeOut(0.15)` réduit).
 */
class FocalCallJournalMotionTest {

    @Test fun `le journal glisse depuis le haut, c'est-a-dire depuis la bulle, en fondu`() {
        assertThat(FocalCallJournalMotion.hiddenOffsetDp(reduceMotion = false)).isLessThan(0f)
        assertThat(FocalCallJournalMotion.fadeMillis(reduceMotion = false)).isGreaterThan(CallChromeStow.REDUCED_FADE_MILLIS)
    }

    @Test fun `reduire les animations ne garde qu'un fondu court, sans glissement`() {
        assertThat(FocalCallJournalMotion.hiddenOffsetDp(reduceMotion = true)).isEqualTo(0f)
        assertThat(FocalCallJournalMotion.fadeMillis(reduceMotion = true)).isEqualTo(CallChromeStow.REDUCED_FADE_MILLIS)
    }
}
