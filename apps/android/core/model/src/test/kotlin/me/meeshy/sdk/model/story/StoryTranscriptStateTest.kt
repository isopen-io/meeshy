package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryVoiceTranscription
import org.junit.Test

class StoryTranscriptStateTest {
    private fun effects() = StoryEffects(
        voiceTranscriptions = listOf(
            StoryVoiceTranscription("en", "Hello"),
            StoryVoiceTranscription("fr", "Bonjour"),
            StoryVoiceTranscription("es", "Hola"),
        ),
    )

    @Test
    fun `la transcription est eteinte par defaut`() {
        assertThat(StoryTranscriptState().text(effects(), listOf("fr"))).isNull()
    }

    @Test
    fun `demandee elle suit la chaine du prisme`() {
        val on = StoryTranscriptState().toggled()
        assertThat(on.text(effects(), listOf("fr", "en"))).isEqualTo("Bonjour")
    }

    @Test
    fun `la chaine est parcourue dans l'ordre y compris au deuxieme rang`() {
        val on = StoryTranscriptState().toggled()
        assertThat(on.text(effects(), listOf("de", "es"))).isEqualTo("Hola")
    }

    @Test
    fun `sans correspondance la langue parlee d'origine`() {
        val on = StoryTranscriptState().toggled()
        assertThat(on.text(effects(), listOf("de"))).isEqualTo("Hello")
    }

    @Test
    fun `elle est reinitialisee au changement de slide`() {
        val on = StoryTranscriptState(slideId = "s1").toggled()
        assertThat(on.onSlide("s1").requested).isTrue()
        assertThat(on.onSlide("s2").requested).isFalse()
        assertThat(on.onSlide("s2").slideId).isEqualTo("s2")
    }

    @Test
    fun `elle remplace la legende quand elle porte du texte`() {
        val on = StoryTranscriptState().toggled()
        assertThat(on.replacesCaption(effects(), listOf("fr"))).isTrue()
        assertThat(StoryTranscriptState().replacesCaption(effects(), listOf("fr"))).isFalse()
    }

    @Test
    fun `une transcription blanche ne remplace rien`() {
        val blank = StoryEffects(voiceTranscriptions = listOf(StoryVoiceTranscription("fr", "  ")))
        val on = StoryTranscriptState().toggled()
        assertThat(on.text(blank, listOf("fr"))).isNull()
        assertThat(StoryTranscriptState.isAvailable(blank)).isFalse()
        assertThat(StoryTranscriptState.isAvailable(effects())).isTrue()
        assertThat(StoryTranscriptState.isAvailable(null)).isFalse()
    }
}
