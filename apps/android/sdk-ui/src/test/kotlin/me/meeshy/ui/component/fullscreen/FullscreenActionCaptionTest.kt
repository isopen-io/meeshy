package me.meeshy.ui.component.fullscreen

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Recette S8 2026-11-01 : « Enregis… », « Republi… » — le nom d'une action tient en entier sous son bouton. */
class FullscreenActionCaptionTest {

    @Test
    fun anActionNameIsTreatedAsAName_neverAsACount() {
        assertThat(FloatingCaption.namesAction("Enregistrer")).isTrue()
        assertThat(FloatingCaption.namesAction("Erneut posten")).isTrue()
    }

    @Test
    fun aCountKeepsTheCountStyle() {
        assertThat(FloatingCaption.namesAction("12")).isFalse()
        assertThat(FloatingCaption.namesAction("1,2 k")).isFalse()
    }
}
