package me.meeshy.sdk.model.translation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AttachmentConsentError
import me.meeshy.sdk.model.ServerTranscriptionWait
import org.junit.Test

class AudioTranslationRequestStateTest {

    private val consent = AttachmentConsentError(code = "CONSENT_REQUIRED", message = "Consent required", requiredConsents = listOf("voiceCloning"))

    private fun state(
        requestedAtMs: Long? = null,
        nowMs: Long = 1_000L,
        hasTrack: Boolean = false,
        failed: Boolean = false,
        consentError: AttachmentConsentError? = null,
        refused: Boolean = false,
    ) = AudioTranslationRequestState.of(requestedAtMs, nowMs, hasTrack, failed, consentError, refused)

    @Test
    fun `jamais demandee est au repos`() {
        assertThat(state()).isEqualTo(AudioTranslationRequestState.Idle)
    }

    @Test
    fun `une demande qui attend est en cours depuis son instant`() {
        assertThat(state(requestedAtMs = 500L)).isEqualTo(AudioTranslationRequestState.InFlight(sinceMs = 500L))
    }

    @Test
    fun `passe le plafond de silence la demande retombe au repos`() {
        val state = state(requestedAtMs = 0L, nowMs = ServerTranscriptionWait.SILENCE_CEILING_MS + 1)
        assertThat(state).isEqualTo(AudioTranslationRequestState.Idle)
    }

    @Test
    fun `la piste arrivee vaut pret quoi qu'il reste de la demande`() {
        assertThat(state(requestedAtMs = 500L, hasTrack = true, failed = true)).isEqualTo(AudioTranslationRequestState.Ready)
    }

    @Test
    fun `un echec recu sort de l'attente`() {
        assertThat(state(requestedAtMs = 500L, failed = true)).isEqualTo(AudioTranslationRequestState.Failed)
    }

    @Test
    fun `un consentement manquant garde son message et ses consentements, jamais un echec generique`() {
        val state = state(requestedAtMs = 500L, failed = true, consentError = consent)
        assertThat(state).isEqualTo(AudioTranslationRequestState.ConsentRequired(consent.message, consent.requiredConsents))
    }

    @Test
    fun `le refus de chiffrement l'emporte sur toute autre demande`() {
        assertThat(state(requestedAtMs = 500L, consentError = consent, refused = true)).isEqualTo(AudioTranslationRequestState.Refused)
    }

    @Test
    fun `seul l'etat en cours porte le spinner`() {
        assertThat(AudioTranslationRequestState.InFlight(1L).isBusy).isTrue()
        assertThat(AudioTranslationRequestState.Failed.isBusy).isFalse()
        assertThat(AudioTranslationRequestState.Idle.isBusy).isFalse()
    }
}
