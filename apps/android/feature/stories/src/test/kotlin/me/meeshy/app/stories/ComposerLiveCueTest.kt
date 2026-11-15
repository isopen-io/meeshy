package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.live.ComposerLiveKind
import me.meeshy.sdk.model.composer.live.ComposerLiveSubject
import me.meeshy.sdk.model.composer.live.ComposerLiveWindow
import me.meeshy.sdk.model.media.MediaTrimBounds
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Ce que la scène du compositeur joue en continu (#13863, loi 6) : la vidéo du fond dans la fenêtre de son Couper, chaque
 * vidéo posée dans la sienne, chaque son dans sa fenêtre propre et à son volume — sélectionnés ou non ; rien pour une image.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerLiveCueTest {

    private fun media(id: String, mime: String = "video/mp4", durationMs: Long? = 8_000) =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = mime, fileSize = 1, width = 10, height = 10, durationMs = durationMs, thumbnailUrl = null)

    private fun state(
        backgroundMime: String = "video/mp4",
        trim: MediaTrimBounds? = null,
        placed: List<StoryPlacedMedia> = emptyList(),
        audio: List<StoryAudioPlayerObject> = emptyList(),
        selectedMediaId: String? = null,
        selectedSoundId: String? = null,
    ): StoryComposerUiState {
        val slide = StorySlide(id = "s", mediaIds = listOf("bg", "clip"), backgroundMediaId = "bg", backgroundTrim = trim, placedMedia = placed, audio = audio)
        return StoryComposerUiState(
            deck = StorySlideDeck(listOf(slide), "s"),
            attachments = listOf(media("bg", backgroundMime), media("clip")),
            selectedMediaId = selectedMediaId,
            selectedSoundId = selectedSoundId,
        )
    }

    private fun StoryComposerUiState.cues() = liveCues(mediaBaseUrl = null) { sound -> sound.mediaURL?.let { "https://audio/$it" } }

    private fun StoryComposerUiState.cue(id: String) = cues().single { it.subject.id == id }

    @Test
    fun `the scene plays its background video, its placed videos and its sounds with nothing selected`() {
        val placed = StoryPlacedMedia(id = "p1", mediaId = "clip")
        val sound = StoryAudioPlayerObject(id = "a1", volume = 0.4f, mediaURL = "voice.m4a")

        val cues = state(placed = listOf(placed), audio = listOf(sound)).cues()

        assertThat(cues.map { it.subject }).containsExactly(
            ComposerLiveSubject("bg", ComposerLiveKind.VIDEO, background = true),
            ComposerLiveSubject("p1", ComposerLiveKind.VIDEO, background = false),
            ComposerLiveSubject("a1", ComposerLiveKind.AUDIO, background = false),
        ).inOrder()
    }

    @Test
    fun `selecting a media changes nothing of what plays`() {
        val placed = StoryPlacedMedia(id = "p1", mediaId = "clip")

        assertThat(state(placed = listOf(placed), selectedMediaId = "p1").cues()).isEqualTo(state(placed = listOf(placed)).cues())
    }

    @Test
    fun `the background video plays in the window of its cut`() {
        val cue = state(trim = MediaTrimBounds(2.0, 5.0)).cue("bg")

        assertThat(cue.url).isEqualTo("https://cdn/bg")
        assertThat(cue.window).isEqualTo(ComposerLiveWindow(2_000, 5_000))
    }

    @Test
    fun `an uncut background video plays its whole source`() {
        assertThat(state().cue("bg").window).isEqualTo(ComposerLiveWindow(0, 8_000))
    }

    @Test
    fun `a background image has no player`() {
        assertThat(state(backgroundMime = "image/jpeg").cues()).isEmpty()
    }

    @Test
    fun `a placed video plays its own window, not the background's`() {
        val placed = StoryPlacedMedia(id = "p1", mediaId = "clip", sourceStart = 1.0, sourceEnd = 3.0)

        val cue = state(trim = MediaTrimBounds(2.0, 5.0), placed = listOf(placed)).cue("p1")

        assertThat(cue.url).isEqualTo("https://cdn/clip")
        assertThat(cue.window).isEqualTo(ComposerLiveWindow(1_000, 3_000))
    }

    @Test
    fun `every sound plays at its volume, silent when muted, and one without address does not play`() {
        val sound = StoryAudioPlayerObject(id = "a1", volume = 0.4f, mediaURL = "voice.m4a")
        val muted = StoryAudioPlayerObject(id = "a2", volume = 0f, mutedVolumeMemento = 0.4f, mediaURL = "rain.m4a")
        val local = StoryAudioPlayerObject(id = "a3", volume = 1f, mediaURL = null)

        val cues = state(audio = listOf(sound, muted, local)).cues()

        assertThat(cues.single { it.subject.id == "a1" }.url).isEqualTo("https://audio/voice.m4a")
        assertThat(cues.single { it.subject.id == "a1" }.volume).isEqualTo(0.4f)
        assertThat(cues.single { it.subject.id == "a2" }.volume).isEqualTo(0f)
        assertThat(cues.none { it.subject.id == "a3" }).isTrue()
    }

    @Test
    fun `a placed video plays at its own volume, silent when muted, the background staying at full volume`() {
        val half = StoryPlacedMedia(id = "p1", mediaId = "clip", volume = 0.3f)
        val muted = StoryPlacedMedia(id = "p2", mediaId = "clip", volume = 0f, mutedVolumeMemento = 0.6f)

        val cues = state(placed = listOf(half, muted)).cues()

        assertThat(cues.single { it.subject.id == "p1" }.volume).isEqualTo(0.3f)
        assertThat(cues.single { it.subject.id == "p2" }.volume).isEqualTo(0f)
        assertThat(cues.single { it.subject.id == "bg" }.volume).isEqualTo(1f)
    }

    @Test
    fun `a recorded sound plays from its media`() {
        val recorded = StoryAudioPlayerObject(id = "a4", postMediaId = "clip", volume = 1f)

        assertThat(state(audio = listOf(recorded)).cue("a4").url).isEqualTo("https://cdn/clip")
    }

    @Test
    fun `a pending video plays from its file on the device`() {
        val file = File("/data/user/0/me.meeshy.app.debug/cache/clip.mp4")
        val item = MediaUploadItem(MediaUploadSource.OnDisk(file), "clip.mp4", "video/mp4", 8_000)
        val pending = state().let { s ->
            s.copy(attachments = s.attachments.filter { it.id != "bg" }, pendingUploads = listOf(PendingMediaUpload(cmid = "bg", item = item)))
        }

        assertThat(pending.cue("bg").url).isEqualTo("file://${file.path}")
    }
}
