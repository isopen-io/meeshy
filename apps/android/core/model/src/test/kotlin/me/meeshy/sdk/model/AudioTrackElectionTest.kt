package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** La piste jouée suit la langue du TEXTE servi : une seule descente, celle du Prisme, jamais une seconde. */
class AudioTrackElectionTest {

    private val tracks = listOf(
        EffectiveAudioTrack.TranslatedTrack("fr", "https://cdn/fr.mp3", 4000),
        EffectiveAudioTrack.TranslatedTrack("es", "https://cdn/es.mp3", 4200),
    )

    private fun served(original: String, preferred: List<String>, translated: List<EffectiveAudioTrack.TranslatedTrack> = tracks) =
        EffectiveAudioTrack.served("https://cdn/original.mp3", 3900, null, original, preferred, translated)

    @Test
    fun `une piste arrivee en cours de route est elue par la langue du texte servi`() {
        val before = served("en", listOf("fr"), translated = emptyList())
        val after = served("en", listOf("fr"))
        assertThat(before.language).isNull()
        assertThat(after.language).isEqualTo("fr")
        assertThat(after.url).isEqualTo("https://cdn/fr.mp3")
    }

    @Test
    fun `la langue d'origine au rang un garde la piste originale meme si une piste existe`() {
        assertThat(served("fr", listOf("fr", "es")).language).isNull()
    }

    @Test
    fun `la langue d'origine au rang deux ne retrograde pas la langue primaire`() {
        assertThat(served("en", listOf("es", "en")).language).isEqualTo("es")
    }

    @Test
    fun `aucune piste ne correspond au prisme et l'original est joue sans repli sur la premiere piste`() {
        assertThat(served("en", listOf("de")).language).isNull()
    }
}
