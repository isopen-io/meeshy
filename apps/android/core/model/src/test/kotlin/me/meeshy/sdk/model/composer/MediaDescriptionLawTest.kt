package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaDescriptionLawTest {

    @Test
    fun `seules les cles non vides d'un media present partent`() {
        val wire = MediaDescriptionLaw.wire(
            raw = mapOf("m1" to "  un chat  ", "m2" to "   ", "gone" to "x"),
            mediaIds = listOf("m1", "m2"),
        )
        assertThat(wire).containsExactly("m1", "un chat")
    }

    @Test
    fun `rien a dire donne null et jamais une carte vide`() {
        assertThat(MediaDescriptionLaw.wire(mapOf("m1" to " "), listOf("m1"))).isNull()
        assertThat(MediaDescriptionLaw.wire(emptyMap(), listOf("m1"))).isNull()
    }

    @Test
    fun `une description est bornee a 1000 caracteres comme la passerelle`() {
        val wire = MediaDescriptionLaw.wire(mapOf("m1" to "x".repeat(1500)), listOf("m1"))!!
        assertThat(wire.getValue("m1")).hasLength(MediaDescriptionLaw.MAX_LENGTH)
    }

    @Test
    fun `les medias non decrits sont listes dans l'ordre`() {
        assertThat(MediaDescriptionLaw.undescribed(listOf("a", "b", "c"), mapOf("b" to "ok", "c" to " ")))
            .containsExactly("a", "c").inOrder()
    }

    @Test
    fun `ecrire une description vide la retire`() {
        assertThat(MediaDescriptionLaw.with(mapOf("a" to "x"), "a", "  ")).isEmpty()
        assertThat(MediaDescriptionLaw.with(emptyMap(), "a", "x")).containsExactly("a", "x")
    }

    @Test
    fun `retirer un media purge sa description`() {
        assertThat(MediaDescriptionLaw.pruned(mapOf("a" to "x", "b" to "y"), listOf("b"))).containsExactly("b", "y")
    }
}
