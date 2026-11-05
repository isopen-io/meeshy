package me.meeshy.sdk.model.translation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioTranslationLanguagesTest {

    @Test
    fun `les langues du lecteur menent, dans l'ordre du prisme, puis le catalogue`() {
        val languages = AudioTranslationLanguages.of(
            readerLanguages = listOf("FR", "es"),
            originalLanguage = "en",
            catalog = listOf("en", "de", "fr", "it"),
        )

        assertThat(languages).containsExactly("fr", "es", "de", "it").inOrder()
    }

    @Test
    fun `la langue d'origine de la piece n'est jamais offerte, quelle que soit sa casse`() {
        val languages = AudioTranslationLanguages.of(listOf("en", "fr"), originalLanguage = " EN ", catalog = listOf("en", "de"))

        assertThat(languages).containsExactly("fr", "de").inOrder()
    }

    @Test
    fun `les codes vides et les doublons tombent`() {
        val languages = AudioTranslationLanguages.of(listOf("", "fr", "fr"), originalLanguage = null, catalog = listOf(" ", "fr", "de"))

        assertThat(languages).containsExactly("fr", "de").inOrder()
    }

    @Test
    fun `la liste est bornee`() {
        val languages = AudioTranslationLanguages.of(emptyList(), null, catalog = (1..40).map { "l$it" }, limit = 5)

        assertThat(languages).hasSize(5)
    }

    @Test
    fun `plusieurs vocaux se resument par l'etat le plus urgent`() {
        val ready = AudioTranslationRequestState.Ready
        val busy = AudioTranslationRequestState.InFlight(1L)
        assertThat(AudioTranslationRequestState.aggregate(listOf(ready, ready))).isEqualTo(ready)
        assertThat(AudioTranslationRequestState.aggregate(listOf(ready, busy))).isEqualTo(busy)
        assertThat(AudioTranslationRequestState.aggregate(listOf(busy, AudioTranslationRequestState.Failed))).isEqualTo(AudioTranslationRequestState.Failed)
        assertThat(AudioTranslationRequestState.aggregate(listOf(ready, AudioTranslationRequestState.Idle))).isEqualTo(AudioTranslationRequestState.Idle)
        assertThat(AudioTranslationRequestState.aggregate(listOf(AudioTranslationRequestState.Failed, AudioTranslationRequestState.Refused)))
            .isEqualTo(AudioTranslationRequestState.Refused)
        assertThat(AudioTranslationRequestState.aggregate(emptyList())).isEqualTo(AudioTranslationRequestState.Idle)
    }

    @Test
    fun `un consentement manquant l'emporte sur un echec`() {
        val consent = AudioTranslationRequestState.ConsentRequired("m", listOf("voice"))
        assertThat(AudioTranslationRequestState.aggregate(listOf(AudioTranslationRequestState.Failed, consent))).isEqualTo(consent)
    }
}
