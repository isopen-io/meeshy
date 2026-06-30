package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the composer's bottom-band state machine — the pure value-type
 * port of iOS `BandStateMachine`. The band is a tools drawer that is either hidden
 * (only the Contenu / Effets FABs show) or open on one [BandCategory]'s tiles. Every
 * transition (tap a FAB, swipe the band down to dismiss, swipe horizontally to swap
 * category) is total and deterministic — no Compose, no I/O — so the toolbar
 * Composable stays declarative glue.
 */
@RunWith(JUnit4::class)
class ComposerBandStateTest {

    private val hidden = ComposerBandState.Hidden
    private val contenu = ComposerBandState.Tiles(BandCategory.CONTENU)
    private val effets = ComposerBandState.Tiles(BandCategory.EFFETS)

    // --- BandCategory.swapped ------------------------------------------------

    @Test
    fun `contenu swaps to effets and back`() {
        assertThat(BandCategory.CONTENU.swapped).isEqualTo(BandCategory.EFFETS)
        assertThat(BandCategory.EFFETS.swapped).isEqualTo(BandCategory.CONTENU)
    }

    // --- ComposerContentTile.category ---------------------------------------

    @Test
    fun `the content tiles all belong to the contenu category`() {
        assertThat(ComposerContentTile.TEXT.category).isEqualTo(BandCategory.CONTENU)
        assertThat(ComposerContentTile.MEDIA.category).isEqualTo(BandCategory.CONTENU)
        assertThat(ComposerContentTile.STICKER.category).isEqualTo(BandCategory.CONTENU)
    }

    // --- activeCategory / isVisible -----------------------------------------

    @Test
    fun `hidden has no active category and is not visible`() {
        assertThat(hidden.activeCategory).isNull()
        assertThat(hidden.isVisible).isFalse()
    }

    @Test
    fun `an open band exposes its category and is visible`() {
        assertThat(contenu.activeCategory).isEqualTo(BandCategory.CONTENU)
        assertThat(contenu.isVisible).isTrue()
        assertThat(effets.activeCategory).isEqualTo(BandCategory.EFFETS)
        assertThat(effets.isVisible).isTrue()
    }

    // --- tapFab --------------------------------------------------------------

    @Test
    fun `tapping a FAB while hidden opens that category`() {
        assertThat(hidden.tapFab(BandCategory.CONTENU)).isEqualTo(contenu)
        assertThat(hidden.tapFab(BandCategory.EFFETS)).isEqualTo(effets)
    }

    @Test
    fun `tapping the FAB of the open category closes the band`() {
        assertThat(contenu.tapFab(BandCategory.CONTENU)).isEqualTo(hidden)
        assertThat(effets.tapFab(BandCategory.EFFETS)).isEqualTo(hidden)
    }

    @Test
    fun `tapping the other FAB switches category instead of closing`() {
        assertThat(contenu.tapFab(BandCategory.EFFETS)).isEqualTo(effets)
        assertThat(effets.tapFab(BandCategory.CONTENU)).isEqualTo(contenu)
    }

    // --- swipeDown -----------------------------------------------------------

    @Test
    fun `swiping the band down dismisses it from any state`() {
        assertThat(contenu.swipeDown()).isEqualTo(hidden)
        assertThat(effets.swipeDown()).isEqualTo(hidden)
        assertThat(hidden.swipeDown()).isEqualTo(hidden)
    }

    // --- swipeHorizontal -----------------------------------------------------

    @Test
    fun `swiping horizontally swaps the open category`() {
        assertThat(contenu.swipeHorizontal()).isEqualTo(effets)
        assertThat(effets.swipeHorizontal()).isEqualTo(contenu)
    }

    @Test
    fun `swiping horizontally is inert while the band is hidden`() {
        assertThat(hidden.swipeHorizontal()).isEqualTo(hidden)
    }

    // --- ComposerBand.contentTiles ------------------------------------------

    @Test
    fun `the contenu band lists the text, media and sticker tiles in order`() {
        assertThat(ComposerBand.contentTiles).containsExactly(
            ComposerContentTile.TEXT,
            ComposerContentTile.MEDIA,
            ComposerContentTile.STICKER,
        ).inOrder()
    }
}
