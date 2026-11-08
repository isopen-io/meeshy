package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #15192 : la scène ne se réduit que pour le clavier ou une vraie feuille qui monte du bas.
 * Les options d'un outil, posées à plat dans le rail ou dans une bande au bas, se posent par-dessus une scène pleine.
 */
class ComposerSceneReductionTest {

    private fun reduced(
        keyboardUp: Boolean = false,
        sheetRaised: Boolean = false,
        bottomPanelOpen: Boolean = false,
        subject: ComposerSelectionSubject = ComposerSelectionSubject.NONE,
    ) = ComposerSceneReduction.sceneIsReduced(ComposerSceneReduction.State(keyboardUp, sheetRaised, bottomPanelOpen, subject))

    @Test
    fun `a tool whose options take the bottom or the rail leaves the scene full`() {
        assertThat(reduced(bottomPanelOpen = true)).isFalse()
        assertThat(reduced(bottomPanelOpen = true, subject = ComposerSelectionSubject.OBJECT)).isFalse()
        assertThat(reduced(bottomPanelOpen = true, subject = ComposerSelectionSubject.BACKGROUND)).isFalse()
    }

    @Test
    fun `a selection leaves the scene full`() {
        assertThat(reduced(subject = ComposerSelectionSubject.OBJECT)).isFalse()
        assertThat(reduced(subject = ComposerSelectionSubject.BACKGROUND)).isFalse()
    }

    @Test
    fun `the keyboard reduces the scene`() {
        assertThat(reduced(keyboardUp = true)).isTrue()
        assertThat(reduced(keyboardUp = true, subject = ComposerSelectionSubject.OBJECT)).isTrue()
    }

    @Test
    fun `a rising sheet reduces the scene, a panel under it or not`() {
        assertThat(reduced(sheetRaised = true)).isTrue()
        assertThat(reduced(sheetRaised = true, bottomPanelOpen = true, subject = ComposerSelectionSubject.OBJECT)).isTrue()
    }

    @Test
    fun `at rest the scene is full`() {
        assertThat(reduced()).isFalse()
    }
}
