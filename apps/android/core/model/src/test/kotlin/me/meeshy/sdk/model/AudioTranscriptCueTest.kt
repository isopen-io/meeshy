package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioTranscriptCueTest {

    private fun cue(id: Int, text: String, start: Double? = null, end: Double? = null) =
        AudioTranscriptCue(id = id, text = text, start = start, end = end)

    @Test
    fun `une ligne sans debut ne s'allume jamais`() {
        assertThat(AudioTranscriptCue.activeIndex(listOf(cue(0, "a")), at = 1.0)).isNull()
    }

    @Test
    fun `la borne basse est incluse et la haute exclue`() {
        val cues = listOf(cue(0, "a", 0.0, 1.0), cue(1, "b", 1.0, 2.0))
        assertThat(AudioTranscriptCue.activeIndex(cues, at = 1.0)).isEqualTo(1)
        assertThat(AudioTranscriptCue.activeIndex(cues, at = 0.99)).isEqualTo(0)
        assertThat(AudioTranscriptCue.activeIndex(cues, at = 2.0)).isNull()
    }

    @Test
    fun `une fin absente court jusqu'a la ligne suivante datee`() {
        val cues = listOf(cue(0, "a", 0.0), cue(1, "b", 3.0, 4.0))
        assertThat(AudioTranscriptCue.activeIndex(cues, at = 2.5)).isEqualTo(0)
        assertThat(AudioTranscriptCue.activeIndex(cues, at = 3.0)).isEqualTo(1)
    }

    @Test
    fun `la derniere ligne sans fin court jusqu'a la fin du son`() {
        assertThat(AudioTranscriptCue.activeIndex(listOf(cue(0, "a", 0.0)), at = 999.0)).isEqualTo(0)
    }

    @Test
    fun `liste vide ou avant la premiere ligne n'allume rien`() {
        assertThat(AudioTranscriptCue.activeIndex(emptyList(), at = 0.0)).isNull()
        assertThat(AudioTranscriptCue.activeIndex(listOf(cue(0, "a", 2.0, 3.0)), at = 1.0)).isNull()
    }

    @Test
    fun `une fin de phrase coupe meme sous la longueur maximale`() {
        val words = listOf(cue(0, "Bonjour.", 0.0, 1.0), cue(1, "Ca", 1.0, 1.5), cue(2, "va ?", 1.5, 2.0))
        val phrases = AudioTranscriptCue.phrases(words)
        assertThat(phrases.map { it.text }).containsExactly("Bonjour.", "Ca va ?").inOrder()
        assertThat(phrases[1].start).isEqualTo(1.0)
        assertThat(phrases[1].end).isEqualTo(2.0)
        assertThat(phrases.map { it.id }).containsExactly(0, 1).inOrder()
    }

    @Test
    fun `sans ponctuation on coupe avant de depasser la longueur maximale`() {
        val words = listOf(cue(0, "aaaa"), cue(1, "bbbb"), cue(2, "cccc"))
        val phrases = AudioTranscriptCue.phrases(words, maxCharacters = 10)
        assertThat(phrases.map { it.text }).containsExactly("aaaa bbbb", "cccc").inOrder()
    }

    @Test
    fun `les mots vides sont ignores et rien ne donne rien`() {
        assertThat(AudioTranscriptCue.phrases(emptyList())).isEmpty()
        assertThat(AudioTranscriptCue.phrases(listOf(cue(0, "  ")))).isEmpty()
    }
}
