package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerHashtagsTest {

    @Test
    fun `les balises sont derivees du texte, dedoublonnees sans egard a la casse`() {
        assertThat(ComposerHashtags.tags("Hello #Voyage et #voyage puis #été_2026"))
            .containsExactly("Voyage", "été_2026").inOrder()
    }

    @Test
    fun `un diese colle a un mot n'est pas une balise`() {
        assertThat(ComposerHashtags.tags("a#b page#section #ok")).containsExactly("ok")
    }

    @Test
    fun `inserer ecrit dans le texte avec une espace si besoin et sans doublon`() {
        assertThat(ComposerHashtags.inserting("voyage", "Salut")).isEqualTo("Salut #voyage")
        assertThat(ComposerHashtags.inserting("#voyage", "Salut ")).isEqualTo("Salut #voyage")
        assertThat(ComposerHashtags.inserting("voyage", "")).isEqualTo("#voyage")
        assertThat(ComposerHashtags.inserting("Voyage", "x #voyage")).isEqualTo("x #voyage")
        assertThat(ComposerHashtags.inserting("  # ", "x")).isEqualTo("x")
    }

    @Test
    fun `retirer ne touche pas une balise plus longue`() {
        assertThat(ComposerHashtags.removing("voy", "a #voyage #voy b")).isEqualTo("a #voyage b")
        assertThat(ComposerHashtags.removing("VOYAGE", "a #voyage")).isEqualTo("a")
    }

    @Test
    fun `la prose est le texte sans ses balises`() {
        assertThat(ComposerHashtags.prose("#a #b")).isEmpty()
        assertThat(ComposerHashtags.prose("Salut #a")).isEqualTo("Salut")
    }

    @Test
    fun `bascule pour revenir en arriere rejoue la difference symetrique`() {
        assertThat(ComposerHashtags.togglesRestoring(actual = listOf("a", "B"), before = listOf("b", "c")))
            .containsExactly("a", "c").inOrder()
    }
}
