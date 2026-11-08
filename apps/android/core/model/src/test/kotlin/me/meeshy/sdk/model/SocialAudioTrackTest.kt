package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SocialAudioTrackTest {

    private fun audio(lang: String, url: String = "u/$lang.mp3", ms: Int = 3_000) =
        MessageTranslatedAudio(id = "a_$lang", targetLanguage = lang, url = url, durationMs = ms)

    private fun transcription(lang: String) =
        MessageTranscription(attachmentId = "a", text = "t", language = lang)

    private val tracks = listOf(audio("fr"), audio("es"))

    @Test
    fun `six surfaces dont une seule ne porte aucune piste`() {
        assertThat(SocialAudioSurface.entries).hasSize(6)
        assertThat(SocialAudioSurface.entries.filterNot { it.carriesTranslatedTracks })
            .containsExactly(SocialAudioSurface.REPOST_LEGACY_AUDIO)
    }

    @Test
    fun `le repost legacy ne porte pas de piste meme quand des pistes existent`() {
        assertThat(
            SocialAudioTrack.language(SocialAudioSurface.REPOST_LEGACY_AUDIO, null, "en", listOf("fr"), tracks),
        ).isNull()
    }

    @Test
    fun `chaque surface porteuse sert la piste de la langue du lecteur`() {
        SocialAudioSurface.entries.filter { it.carriesTranslatedTracks }.forEach {
            assertThat(SocialAudioTrack.language(it, null, "en", listOf("fr"), tracks)).isEqualTo("fr")
        }
    }

    @Test
    fun `un rang autre que le premier descend le prisme`() {
        assertThat(SocialAudioTrack.language(SocialAudioSurface.COMMENT, null, "en", listOf("de", "es"), tracks))
            .isEqualTo("es")
    }

    @Test
    fun `la langue d'origine gagne a son rang`() {
        assertThat(SocialAudioTrack.language(SocialAudioSurface.REEL, null, "en", listOf("en", "fr"), tracks)).isNull()
        assertThat(SocialAudioTrack.language(SocialAudioSurface.REEL, null, "en", listOf("fr", "en"), tracks))
            .isEqualTo("fr")
    }

    @Test
    fun `la langue d'origine est celle de la transcription avant celle du porteur`() {
        assertThat(SocialAudioTrack.originalLanguage(transcription("es"), "fr")).isEqualTo("es")
        assertThat(SocialAudioTrack.originalLanguage(transcription(" "), " fr ")).isEqualTo("fr")
        assertThat(SocialAudioTrack.originalLanguage(null, null)).isEmpty()
    }

    @Test
    fun `un vocal espagnol sous une legende francaise reste original pour un lecteur espagnol`() {
        val served = SocialAudioTrack.served(
            SocialAudioSurface.FEED_POST_CARD, "o.mp3", 1_000, transcription("es"), "fr", listOf("es", "fr"),
            listOf(audio("fr")),
        )
        assertThat(served.language).isNull()
        assertThat(served.url).isEqualTo("o.mp3")
    }

    @Test
    fun `la piste servie emporte son url et sa duree`() {
        val served = SocialAudioTrack.served(
            SocialAudioSurface.POST_DETAIL, "o.mp3", 1_000, transcription("en"), null, listOf("fr"), tracks,
        )
        assertThat(served.language).isEqualTo("fr")
        assertThat(served.url).isEqualTo("u/fr.mp3")
        assertThat(served.durationMs).isEqualTo(3_000)
    }

    @Test
    fun `le plein ecran presente la piste servie ou la sentinelle orig`() {
        assertThat(SocialAudioTrack.openingSelection(transcription("en"), null, listOf("fr"), tracks)).isEqualTo("fr")
        assertThat(SocialAudioTrack.openingSelection(transcription("en"), null, listOf("de"), tracks))
            .isEqualTo(SocialAudioTrack.ORIGINAL_SENTINEL)
        assertThat(SocialAudioTrack.ORIGINAL_SENTINEL).isEqualTo("orig")
    }

    @Test
    fun `une piste sans url n'est pas servie`() {
        assertThat(SocialAudioTrack.language(SocialAudioSurface.COMMENT, null, "en", listOf("fr"), listOf(audio("fr", url = ""))))
            .isNull()
    }
}

class ServedAudioUrlTest {
    private val media = ApiPostMedia(
        id = "m1",
        mimeType = "audio/mpeg",
        fileUrl = "/o.mp3",
        transcription = ApiAttachmentTranscription(language = "en"),
        translations = mapOf("fr" to ApiAttachmentTranslation(url = "/fr.mp3")),
    )

    @Test
    fun `un vocal de commentaire joue la piste de la langue du lecteur`() {
        assertThat(media.servedAudioUrl(SocialAudioSurface.COMMENT, null, listOf("fr"))).isEqualTo("/fr.mp3")
    }

    @Test
    fun `sans piste dans la langue du lecteur l'original joue`() {
        assertThat(media.servedAudioUrl(SocialAudioSurface.REEL, null, listOf("de"), { "https://h$it" }))
            .isEqualTo("https://h/o.mp3")
    }

    @Test
    fun `la piste est absolutisee comme l'original`() {
        assertThat(media.servedAudioUrl(SocialAudioSurface.REEL, null, listOf("fr"), { "https://h$it" }))
            .isEqualTo("https://h/fr.mp3")
    }

    @Test
    fun `sans fichier il n'y a rien a jouer`() {
        assertThat(media.copy(fileUrl = null).servedAudioUrl(SocialAudioSurface.COMMENT, null, listOf("fr"))).isNull()
    }

    @Test
    fun `an audio comment offers its original then the reader's spoken languages, the served one active`() {
        val choice = media.socialAudioChoice(SocialAudioSurface.COMMENT, null, listOf("fr", "en"))!!
        assertThat(choice.offered).containsExactly("en", "fr").inOrder()
        assertThat(choice.originalLanguage).isEqualTo("en")
        assertThat(choice.servedLanguage).isEqualTo("fr")
        assertThat(choice.url).isEqualTo("/fr.mp3")
    }

    @Test
    fun `tapping the original flag plays the original track`() {
        val choice = media.socialAudioChoice(SocialAudioSurface.COMMENT, null, listOf("fr"), manualOverride = "en")!!
        assertThat(choice.servedLanguage).isEqualTo("en")
        assertThat(choice.url).isEqualTo("/o.mp3")
    }

    @Test
    fun `no track in the reader's languages means no flag to explore`() {
        val choice = media.socialAudioChoice(SocialAudioSurface.COMMENT, null, listOf("de"))!!
        assertThat(choice.offered).isEmpty()
        assertThat(choice.servedLanguage).isEqualTo("en")
    }
}
