package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.EffectiveAudioTrack.TranslatedTrack
import org.junit.Test

class EffectiveAudioTrackTest {

    private val tracks = listOf(TranslatedTrack("fr", "u/fr.mp3", 4_000), TranslatedTrack("es", "u/es.mp3"))

    private fun resolve(preferred: List<String>, original: String = "en", manual: String? = null) =
        EffectiveAudioTrack.resolve(manual, original, preferred, tracks.map { it.language })

    @Test
    fun `la premiere langue servie par une piste traduite gagne`() {
        assertThat(resolve(listOf("fr", "es"))).isEqualTo("fr")
    }

    @Test
    fun `la langue d'origine gagne a son rang, jamais en court-circuit`() {
        assertThat(resolve(listOf("en", "fr"))).isNull()
        assertThat(resolve(listOf("fr", "en"))).isEqualTo("fr")
    }

    @Test
    fun `un rang autre que le premier est descendu`() {
        assertThat(resolve(listOf("de", "es"))).isEqualTo("es")
    }

    @Test
    fun `sans piste traduite servie c'est l'original`() {
        assertThat(resolve(listOf("de", "it"))).isNull()
        assertThat(EffectiveAudioTrack.resolve(null, "en", listOf("fr"), emptyList())).isNull()
    }

    @Test
    fun `la bascule manuelle du drapeau l'emporte`() {
        assertThat(resolve(listOf("fr"), manual = "es")).isEqualTo("es")
        assertThat(resolve(listOf("fr"), manual = "EN")).isNull()
        assertThat(resolve(listOf("fr"), manual = "de")).isNull()
    }

    @Test
    fun `la piste servie emporte son url et sa duree avec sa langue`() {
        val served = EffectiveAudioTrack.served("u/orig.mp3", 9_000, null, "en", listOf("fr"), tracks)

        assertThat(served).isEqualTo(EffectiveAudioTrack.Served("fr", "u/fr.mp3", 4_000))
    }

    @Test
    fun `une piste traduite sans duree garde celle de l'original, et l'original est servi sans traduction`() {
        assertThat(EffectiveAudioTrack.served("u/o", 9_000, null, "en", listOf("es"), tracks).durationMs).isEqualTo(9_000)
        assertThat(EffectiveAudioTrack.served("u/o", 9_000, null, "fr", listOf("fr"), tracks))
            .isEqualTo(EffectiveAudioTrack.Served(null, "u/o", 9_000))
    }

    @Test
    fun `la langue d'origine d'une piste est celle de sa transcription`() {
        assertThat(EffectiveAudioTrack.originLanguage(" ko ", "en")).isEqualTo("ko")
        assertThat(EffectiveAudioTrack.originLanguage("  ", "en")).isEqualTo("en")
        assertThat(EffectiveAudioTrack.originLanguage(null, "en")).isEqualTo("en")
    }
}
