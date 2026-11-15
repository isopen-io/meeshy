package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FocalFocusChipsLawTest {

    private fun codes(vararg c: String) = c.toList()

    @Test
    fun `cinq drapeaux au plus et l ordre est conserve quand l actif en fait partie`() {
        val kept = FocalFocusChipsLaw.flagWindow(codes("fr", "en", "es", "de", "it", "pt"), activeCode = "es", limit = 5)
        assertThat(kept).containsExactly("fr", "en", "es", "de", "it").inOrder()
    }

    @Test
    fun `l actif hors fenetre prend la tete et chasse le dernier`() {
        val kept = FocalFocusChipsLaw.flagWindow(codes("fr", "en", "es", "de", "it", "pt"), activeCode = "pt", limit = 5)
        assertThat(kept).containsExactly("pt", "fr", "en", "es", "de").inOrder()
    }

    @Test
    fun `sous la limite rien ne change et les doublons de casse disparaissent`() {
        assertThat(FocalFocusChipsLaw.flagWindow(codes("fr", "EN", "en"), activeCode = "en", limit = 5))
            .containsExactly("fr", "EN").inOrder()
    }

    @Test
    fun `l actif est reconnu sans egard a la casse`() {
        val kept = FocalFocusChipsLaw.flagWindow(codes("fr", "en", "es", "de", "it", "PT"), activeCode = "pt", limit = 5)
        assertThat(kept.first()).isEqualTo("PT")
        assertThat(kept).hasSize(5)
    }

    @Test
    fun `l opacite du fond d une puce suit le mode et l etat`() {
        assertThat(FocalFocusChipsLaw.fillOpacity(isDark = false, isActive = false)).isEqualTo(0.14f)
        assertThat(FocalFocusChipsLaw.fillOpacity(isDark = true, isActive = false)).isEqualTo(0.18f)
        assertThat(FocalFocusChipsLaw.fillOpacity(isDark = false, isActive = true)).isEqualTo(0.34f)
        assertThat(FocalFocusChipsLaw.fillOpacity(isDark = true, isActive = true)).isEqualTo(0.42f)
    }

    @Test
    fun `l appui long d une reaction dure 400 ms`() {
        assertThat(FocalFocusChipsLaw.REACTION_LONG_PRESS_MS).isEqualTo(400L)
    }
}
