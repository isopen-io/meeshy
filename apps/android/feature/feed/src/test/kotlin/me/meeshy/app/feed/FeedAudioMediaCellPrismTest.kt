package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.MessageTranscription
import me.meeshy.sdk.model.MessageTranslatedAudio
import me.meeshy.sdk.model.playback.AudioPlaybackState
import org.junit.Test

class FeedAudioMediaCellPrismTest {

    private fun track(language: String, text: String, durationMs: Int = 4_000) = MessageTranslatedAudio(
        id = "a1_$language",
        attachmentId = "a1",
        targetLanguage = language,
        url = "https://cdn.example/a1.$language.mp3",
        transcription = text,
        durationMs = durationMs,
    )

    private fun audio(original: String, vararg tracks: MessageTranslatedAudio) = feedMediaItem(
        id = "a1",
        type = FeedMediaType.AUDIO,
        durationSeconds = 10,
        transcription = MessageTranscription(attachmentId = "a1", text = "original text", language = original),
        translatedAudios = tracks.toList(),
    )

    @Test
    fun `la piste du premier rang est servie avec sa propre transcription`() {
        val cell = FeedAudioCellPrism.serve(audio("en", track("fr", "texte français")), carrierLanguage = null, preferredLanguages = listOf("fr", "en"))

        assertThat(cell.language).isEqualTo("fr")
        assertThat(cell.url).endsWith("a1.fr.mp3")
        assertThat(cell.transcript).isEqualTo("texte français")
        assertThat(cell.durationSeconds).isEqualTo(4.0)
    }

    @Test
    fun `la langue d'origine au deuxieme rang bat la traduction du troisieme`() {
        val cell = FeedAudioCellPrism.serve(
            audio("en", track("es", "texto")),
            carrierLanguage = null,
            preferredLanguages = listOf("de", "en", "es"),
        )

        assertThat(cell.language).isNull()
        assertThat(cell.url).isEqualTo("https://cdn.example/a1")
        assertThat(cell.transcript).isEqualTo("original text")
        assertThat(cell.durationSeconds).isEqualTo(10.0)
    }

    @Test
    fun `une traduction du deuxieme rang est servie quand l'original n'est pas dans le prisme`() {
        val cell = FeedAudioCellPrism.serve(
            audio("ja", track("en", "english text")),
            carrierLanguage = null,
            preferredLanguages = listOf("fr", "en"),
        )

        assertThat(cell.language).isEqualTo("en")
        assertThat(cell.transcript).isEqualTo("english text")
    }

    @Test
    fun `sans piste traduite l'original est servi, jamais la premiere traduction`() {
        val cell = FeedAudioCellPrism.serve(audio("en"), carrierLanguage = null, preferredLanguages = listOf("fr"))

        assertThat(cell.language).isNull()
        assertThat(cell.transcript).isEqualTo("original text")
    }

    @Test
    fun `sans transcription du tout la carte n'affiche aucun texte`() {
        val item = feedMediaItem(id = "a1", type = FeedMediaType.AUDIO, durationSeconds = 3)

        assertThat(FeedAudioCellPrism.serve(item, carrierLanguage = "fr", preferredLanguages = listOf("fr")).transcript).isNull()
    }

    @Test
    fun `seul le vocal charge dans le moteur porte la progression`() {
        val item = audio("en")
        val cell = FeedAudioCellPrism.serve(item, null, listOf("en"))
        val engine = AudioPlaybackState(attachmentId = "a1", isPlaying = true, currentTimeMs = 5_000, durationMs = 10_000)

        val mine = FeedAudioCellPrism.playerState(item, cell, engine)
        val other = FeedAudioCellPrism.playerState(item, cell, engine.copy(attachmentId = "other"))

        assertThat(mine.isPlaying).isTrue()
        assertThat(mine.liveFraction).isEqualTo(0.5)
        assertThat(other.isPlaying).isFalse()
        assertThat(other.liveFraction).isEqualTo(0.0)
        assertThat(other.durationSeconds).isEqualTo(10.0)
    }
}
