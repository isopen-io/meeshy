package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Le pied UNIQUE d'une pile de vocaux porte l'union des langues de ses pistes (iOS `sharedFooterModel`). */
class BubbleVoiceStackFooterTest {

    private val textChip = LanguageChip(code = "fr", info = null, isOriginal = true, isActive = true)

    private fun content(vararg audios: BubbleAudio) = voiceBubble(audios.toList()).copy(languageStrip = listOf(textChip))

    private fun track(id: String, original: String?, vararg translated: String, served: String? = null) = BubbleAudio(
        attachmentId = id,
        originalLanguage = original,
        translatedLanguages = translated.toList(),
        audioLanguage = served,
    )

    @Test
    fun `un seul vocal garde les drapeaux du texte`() {
        assertThat(BubbleVoiceStackFooter.chips(content(track("a", "en", "es")))).containsExactly(textChip)
    }

    @Test
    fun `une pile porte l'union ordonnee des langues de ses pistes`() {
        val chips = BubbleVoiceStackFooter.chips(content(track("a", "fr", "en", "es"), track("b", "en", "fr")))

        assertThat(chips.map { it.code }).containsExactly("fr", "en", "es").inOrder()
    }

    @Test
    fun `une langue deja dite par le texte garde son drapeau, les autres disent leur origine et la piste servie`() {
        val chips = BubbleVoiceStackFooter.chips(content(track("a", "fr", "en", served = "en"), track("b", "de")))

        assertThat(chips.first()).isSameInstanceAs(textChip)
        assertThat(chips.single { it.code == "en" }.isActive).isTrue()
        assertThat(chips.single { it.code == "de" }.isOriginal).isTrue()
        assertThat(chips.single { it.code == "de" }.isActive).isFalse()
    }

    @Test
    fun `des pistes qui ne disent pas encore leur langue laissent les drapeaux du texte`() {
        assertThat(BubbleVoiceStackFooter.chips(content(track("a", null), track("b", null)))).containsExactly(textChip)
    }
}
