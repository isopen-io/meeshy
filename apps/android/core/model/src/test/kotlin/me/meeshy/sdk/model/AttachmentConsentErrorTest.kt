package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class AttachmentConsentErrorTest {
    @Test
    fun `un 403 portant des consentements devient une erreur typee`() {
        val e = AttachmentConsentError.from(403, "AUDIO_TRANSLATION_NOT_ENABLED", "Active la traduction", listOf("voiceDataConsentAt"))
        assertThat(e).isEqualTo(AttachmentConsentError("AUDIO_TRANSLATION_NOT_ENABLED", "Active la traduction", listOf("voiceDataConsentAt")))
    }

    @Test
    fun `un 403 nu reste un refus ordinaire`() {
        assertThat(AttachmentConsentError.from(403, "FORBIDDEN", "non", null)).isNull()
    }

    @Test
    fun `un autre statut avec consentements n est pas une erreur de consentement`() {
        assertThat(AttachmentConsentError.from(400, "X", "y", listOf("a"))).isNull()
    }

    @Test
    fun `un message absent prend le libelle par defaut`() {
        assertThat(AttachmentConsentError.from(403, "X", null, emptyList())?.message).isEqualTo("Consent required")
    }

    @Test
    fun `la reponse de traduction decode en tolerance`() {
        val json = Json { ignoreUnknownKeys = true }
        val r = json.decodeFromString<AttachmentTranslateResponse>("""{"jobId":"j1","extra":1,"translations":[{"id":"t","targetLanguage":"fr","audioUrl":"u"}]}""")
        assertThat(r.jobId).isEqualTo("j1")
        assertThat(r.translations.single().audioUrl).isEqualTo("u")
    }

    @Test
    fun `un statut de job inconnu reste inconnu`() {
        assertThat(TranslationJob(status = "weird").state).isEqualTo(TranslationJobStatus.UNKNOWN)
        assertThat(TranslationJob(status = "completed").state.terminal).isTrue()
        assertThat(TranslationJob(status = null).state).isEqualTo(TranslationJobStatus.UNKNOWN)
    }
}
