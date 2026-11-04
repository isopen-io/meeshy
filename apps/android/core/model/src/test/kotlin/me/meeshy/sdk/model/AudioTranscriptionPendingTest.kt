package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Miroir de `AudioTranscriptionPending.shouldReserveHeight` (iOS D-AUDIO-03, #4950) : hauteur stable au premier rendu. */
class AudioTranscriptionPendingTest {

    private val received = 1_000_000L

    @Test
    fun `un vocal recu il y a moins de quatre-vingt-dix secondes sans transcription reserve sa place`() {
        assertThat(AudioTranscriptionPending.shouldReserveHeight(false, received, received + 89_999L, isLocalDraft = false)).isTrue()
    }

    @Test
    fun `passe la fenetre nominale, aucune reservation ne reste, jamais de squelette eternel`() {
        assertThat(AudioTranscriptionPending.shouldReserveHeight(false, received, received + 90_000L, isLocalDraft = false)).isFalse()
    }

    @Test
    fun `une transcription affichee retire la reservation`() {
        assertThat(AudioTranscriptionPending.shouldReserveHeight(true, received, received + 1_000L, isLocalDraft = false)).isFalse()
    }

    @Test
    fun `un brouillon local ou une date inconnue ne reserve rien`() {
        assertThat(AudioTranscriptionPending.shouldReserveHeight(false, received, received + 1_000L, isLocalDraft = true)).isFalse()
        assertThat(AudioTranscriptionPending.shouldReserveHeight(false, null, received, isLocalDraft = false)).isFalse()
    }
}
