package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VoiceStackPlanTest {

    @Test
    fun `chaque rangee de la pile sait sa place, de un a n`() {
        val rows = VoiceStackPlan.rows(listOf("a", "b", "c"))

        assertThat(rows).containsExactly(
            VoiceStackRow("a", position = 1, count = 3),
            VoiceStackRow("b", position = 2, count = 3),
            VoiceStackRow("c", position = 3, count = 3),
        ).inOrder()
    }

    @Test
    fun `une pile vide n'a aucune rangee`() {
        assertThat(VoiceStackPlan.rows(emptyList())).isEmpty()
    }

    @Test
    fun `le pied partage porte l'union ordonnee des langues de toutes les pistes, la premiere vue gagne`() {
        val languages = VoiceStackPlan.footerLanguages(
            listOf(
                VoiceTrackLanguages("a", original = "fr", translated = listOf("en", "es")),
                VoiceTrackLanguages("b", original = "en", translated = listOf("fr")),
            ),
        )

        assertThat(languages).containsExactly("fr", "en", "es").inOrder()
    }

    @Test
    fun `des pistes sans langue laissent le pied a ses drapeaux de texte`() {
        assertThat(VoiceStackPlan.footerLanguages(listOf(VoiceTrackLanguages("a", original = null, translated = emptyList()))))
            .isEmpty()
    }

    @Test
    fun `la casse et les blancs ne dedoublent pas une langue`() {
        val languages = VoiceStackPlan.footerLanguages(
            listOf(
                VoiceTrackLanguages("a", original = "FR", translated = listOf(" en ", "")),
                VoiceTrackLanguages("b", original = "fr", translated = listOf("EN")),
            ),
        )

        assertThat(languages).containsExactly("fr", "en").inOrder()
    }
}
