package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioTranscriptionRevealTest {

    @Test
    fun `mes propres vocaux affichent toujours leur transcription`() {
        assertThat(AudioTranscriptionReveal.autoReveals(isOutgoing = true, autoTranscribeIncoming = false)).isTrue()
    }

    @Test
    fun `un vocal reçu suit la préférence`() {
        assertThat(AudioTranscriptionReveal.autoReveals(isOutgoing = false, autoTranscribeIncoming = true)).isTrue()
        assertThat(AudioTranscriptionReveal.autoReveals(isOutgoing = false, autoTranscribeIncoming = false)).isFalse()
    }

    @Test
    fun `le bouton Transcrire remplace le texte quand l'affichage auto est coupé et rien n'est révélé`() {
        assertThat(AudioTranscriptionReveal.shouldShowRevealCta(true, autoReveal = false, manuallyRevealed = false)).isTrue()
    }

    @Test
    fun `le bouton disparaît une fois la transcription révélée`() {
        assertThat(AudioTranscriptionReveal.shouldShowRevealCta(true, autoReveal = false, manuallyRevealed = true)).isFalse()
    }

    @Test
    fun `aucun bouton quand l'affichage est automatique`() {
        assertThat(AudioTranscriptionReveal.shouldShowRevealCta(true, autoReveal = true, manuallyRevealed = false)).isFalse()
    }

    @Test
    fun `aucun bouton quand il n'existe pas de transcription à révéler`() {
        assertThat(AudioTranscriptionReveal.shouldShowRevealCta(false, autoReveal = false, manuallyRevealed = false)).isFalse()
    }
}
