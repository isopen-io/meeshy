package me.meeshy.sdk.model.layout

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Largeur maximale d'une bulle — miroir de `DeviceLayout.bubbleMaxWidth(containerWidth:sizeClass:)` :
 * 70 % du conteneur en largeur compacte ; 62 % plafonnes a 560 dp en Medium / Expanded.
 */
class BubbleWidthLawTest {

    @Test
    fun `a compact window gives seventy percent of the container`() {
        assertThat(BubbleWidthLaw.maxWidthDp(360f, WindowWidthClass.COMPACT)).isWithin(0.001f).of(252f)
    }

    @Test
    fun `a compact window is never capped`() {
        assertThat(BubbleWidthLaw.maxWidthDp(1000f, WindowWidthClass.COMPACT)).isWithin(0.001f).of(700f)
    }

    @Test
    fun `a medium window gives sixty two percent of the container`() {
        assertThat(BubbleWidthLaw.maxWidthDp(700f, WindowWidthClass.MEDIUM)).isWithin(0.001f).of(434f)
    }

    @Test
    fun `an expanded window caps the bubble at five hundred sixty dp`() {
        assertThat(BubbleWidthLaw.maxWidthDp(1280f, WindowWidthClass.EXPANDED)).isWithin(0.001f).of(560f)
    }

    @Test
    fun `the cap applies to a wide medium column too`() {
        assertThat(BubbleWidthLaw.maxWidthDp(1000f, WindowWidthClass.MEDIUM)).isWithin(0.001f).of(560f)
    }

    @Test
    fun `the ratio wins under the cap in an expanded window`() {
        assertThat(BubbleWidthLaw.maxWidthDp(840f, WindowWidthClass.EXPANDED)).isWithin(0.001f).of(520.8f)
    }

    @Test
    fun `a narrow split screen pane follows its own width, not the screen`() {
        // Le conteneur est la colonne reelle : 320 dp donnent 224 dp, quelle que soit la dalle.
        assertThat(BubbleWidthLaw.maxWidthDp(320f, WindowWidthClass.COMPACT)).isWithin(0.001f).of(224f)
    }

    @Test
    fun `an empty, negative or unknown container gives zero`() {
        assertThat(BubbleWidthLaw.maxWidthDp(0f, WindowWidthClass.COMPACT)).isEqualTo(0f)
        assertThat(BubbleWidthLaw.maxWidthDp(-20f, WindowWidthClass.EXPANDED)).isEqualTo(0f)
        assertThat(BubbleWidthLaw.maxWidthDp(Float.NaN, WindowWidthClass.MEDIUM)).isEqualTo(0f)
    }
}
