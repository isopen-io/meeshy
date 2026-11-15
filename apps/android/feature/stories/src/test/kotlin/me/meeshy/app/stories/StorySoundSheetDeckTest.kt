package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MobileTranscriptionPayload
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.sound.ComposerAudioRole
import me.meeshy.sdk.model.composer.sound.ComposerSoundPlacement
import me.meeshy.sdk.model.media.MediaTrimBounds
import kotlinx.serialization.json.Json
import org.junit.Test

/** #13848 : un son enregistré ou importé, sa transcription, sa langue et son rôle, de la feuille Son à la publication. */
class StorySoundSheetDeckTest {
    private val heard = MobileTranscriptionPayload(text = "bom dia", language = "pt", confidence = 0.8)

    private fun composed(id: String = "rec-1", transcription: MobileTranscriptionPayload? = heard) = ComposedStorySound(
        trackId = id,
        postMediaId = "pm-$id",
        url = "https://cdn/$id.m4a",
        durationSeconds = 12f,
        waveform = listOf(0.2f, 0.8f),
        language = "pt",
        transcription = transcription,
    )

    private fun deckWith(role: ComposerAudioRole = ComposerAudioRole.BACKGROUND) =
        StorySlideDeck.single("s").placeComposedSoundOnSelected(composed(), role)

    private fun request(deck: StorySlideDeck, text: String = "") =
        publishPlans(StoryComposerUiState(deck = deck.updateSelectedText(text)), language = "fr").single().request

    private fun StorySlideDeck.updateSelectedText(text: String): StorySlideDeck =
        copy(slides = slides.map { if (it.id == selectedId) it.copy(text = text) else it })

    @Test
    fun `a recorded sound lands as the background with its media, language, source and transcription`() {
        val slide = deckWith().selectedSlide
        val track = slide.audio.single()
        assertThat(track.isBackground).isTrue()
        assertThat(track.postMediaId).isEqualTo("pm-rec-1")
        assertThat(track.mediaURL).isEqualTo("https://cdn/rec-1.m4a")
        assertThat(track.sourceLanguage).isEqualTo("pt")
        assertThat(slide.soundSources).containsExactly("rec-1", 12f)
        assertThat(slide.soundTranscriptions).containsExactly("rec-1", heard)
    }

    @Test
    fun `the publication carries the on-device transcription so the server does not transcribe again`() {
        val wire = request(deckWith())
        assertThat(wire.mobileTranscription).isEqualTo(heard)
        assertThat(wire.mediaIds).contains("pm-rec-1")
        assertThat(wire.storyEffects!!.audioPlayerObjects!!.single().sourceLanguage).isEqualTo("pt")
    }

    @Test
    fun `without a caption the spoken language is the content language, a caption keeps its own`() {
        assertThat(request(deckWith()).originalLanguage).isEqualTo("pt")
        assertThat(request(deckWith(), text = "Salut").originalLanguage).isEqualTo("fr")
    }

    @Test
    fun `a sound without transcription leaves the server to transcribe it`() {
        val deck = StorySlideDeck.single("s").placeComposedSoundOnSelected(composed(transcription = null), ComposerAudioRole.BACKGROUND)
        assertThat(request(deck).mobileTranscription).isNull()
    }

    @Test
    fun `trimming, moving onto the scene or changing the volume keeps the transcription`() {
        val state = StoryComposerUiState(deck = deckWith())
        val trimmed = StoryComposerSelectionReducer.soundTrimmed(state, "rec-1", MediaTrimBounds(2.0, 8.0)).deck
        val moved = trimmed.withSelectedSoundRole("rec-1", ComposerAudioRole.FOREGROUND).withSelectedSoundVolume("rec-1", 0.4f)
        assertThat(moved.selectedSlide.soundTranscriptions).containsExactly("rec-1", heard)
        assertThat(moved.selectedSlide.audio.single().isBackground).isNull()
        assertThat(moved.selectedSlide.audio.single().volume).isEqualTo(0.4f)
        assertThat(request(moved).mobileTranscription).isEqualTo(heard)
    }

    @Test
    fun `a removed sound takes its transcription with it`() {
        val removed = deckWith().removeSelectedSound("rec-1")
        assertThat(removed.selectedSlide.soundTranscriptions).isEmpty()
    }

    @Test
    fun `changing the language of a sound drops what the device heard in the other language, the server transcribes it`() {
        val relabeled = deckWith().withSelectedSoundLanguage("rec-1", "es").selectedSlide
        assertThat(relabeled.audio.single().sourceLanguage).isEqualTo("es")
        assertThat(relabeled.soundTranscriptions).isEmpty()
    }

    @Test
    fun `changing the language of a sound relabels what the author wrote`() {
        val written = MobileTranscriptionPayload(text = "hola", language = "pt", confidence = 1.0)
        val relabeled = deckWith().withSelectedSoundTranscription("rec-1", written).withSelectedSoundLanguage("rec-1", "es").selectedSlide
        assertThat(relabeled.soundTranscriptions.getValue("rec-1")).isEqualTo(written.copy(language = "es"))
    }

    @Test
    fun `a written transcription replaces the heard one, and an empty one clears it`() {
        val written = MobileTranscriptionPayload(text = "olá", language = "pt", confidence = 1.0)
        val deck = deckWith().withSelectedSoundTranscription("rec-1", written)
        assertThat(deck.selectedSlide.soundTranscriptions.getValue("rec-1")).isEqualTo(written)
        assertThat(deck.withSelectedSoundTranscription("rec-1", null).selectedSlide.soundTranscriptions).isEmpty()
    }

    @Test
    fun `a second sound on the scene keeps the first as the background`() {
        val deck = deckWith().placeComposedSoundOnSelected(composed("rec-2"), ComposerAudioRole.FOREGROUND)
        assertThat(ComposerSoundPlacement.background(deck.selectedSlide.audio)!!.id).isEqualTo("rec-1")
        assertThat(deck.selectedSlide.audio.first { it.id == "rec-2" }.isBackground).isNull()
    }

    @Test
    fun `videos that should not duck under the sound publish with ducking disabled`() {
        val video = StoryMediaObject(id = "v", postMediaId = "pm-v", mediaType = "video")
        val image = StoryMediaObject(id = "i", postMediaId = "pm-i", mediaType = "image")
        val draft = StoryComposerDraft(placedMedia = listOf(video, image), audio = deckWith().selectedSlide.audio, videosDuckUnderSound = false)
        val objects = draft.toCreateStoryRequest("fr").storyEffects!!.mediaObjects!!
        assertThat(objects.first { it.id == "v" }.isDuckingDisabled).isTrue()
        assertThat(objects.first { it.id == "i" }.isDuckingDisabled).isNull()
        val ducking = draft.copy(videosDuckUnderSound = true).toCreateStoryRequest("fr").storyEffects!!.mediaObjects!!
        assertThat(ducking.first { it.id == "v" }.isDuckingDisabled).isNull()
    }

    @Test
    fun `the transcription and the ducking choice survive the saved draft`() {
        val deck = deckWith().withSelectedVideosDuck(false)
        val json = Json { ignoreUnknownKeys = true }
        val blob = json.encodeToString(StoryComposerDraftSnapshot.serializer(), deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "now"))
        val restored = json.decodeFromString(StoryComposerDraftSnapshot.serializer(), blob).toDeck()!!
        assertThat(restored.selectedSlide.soundTranscriptions).containsExactly("rec-1", heard)
        assertThat(restored.selectedSlide.videosDuckUnderSound).isFalse()
    }

    @Test
    fun `the ducking switch is offered only when a background sound plays over a video`() {
        val video = UploadedMedia("v", "https://cdn/v.mp4", "video/mp4", 1, null, null, null, null)
        val withVideo = deckWith().let { d -> d.copy(slides = d.slides.map { it.copy(mediaIds = listOf("v")) }) }
        assertThat(StoryComposerUiState(deck = withVideo, attachments = listOf(video)).servesVideoDucking).isTrue()
        val onScene = withVideo.withSelectedSoundRole("rec-1", ComposerAudioRole.FOREGROUND)
        assertThat(StoryComposerUiState(deck = onScene, attachments = listOf(video)).servesVideoDucking).isFalse()
        assertThat(StoryComposerUiState(deck = deckWith()).servesVideoDucking).isFalse()
    }
}
