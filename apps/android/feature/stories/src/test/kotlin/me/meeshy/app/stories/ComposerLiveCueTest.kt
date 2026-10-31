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
 * Ce que le lecteur vivant du compositeur joue pour la sélection (#13973, lot A-E3) : la vidéo du fond dans la fenêtre de
 * son Couper, une vidéo posée dans la sienne, un son dans sa fenêtre propre et à son volume ; rien pour une image ou
 * quand rien n'est sélectionné.
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

    private fun StoryComposerUiState.cue() = liveCue(mediaBaseUrl = null) { sound -> sound.mediaURL?.let { "https://audio/$it" } }

    @Test
    fun `nothing selected plays nothing`() {
        assertThat(state().cue()).isNull()
    }

    @Test
    fun `the selected background video plays in the window of its cut`() {
        val cue = state(trim = MediaTrimBounds(2.0, 5.0), selectedMediaId = "bg").cue()!!

        assertThat(cue.subject).isEqualTo(ComposerLiveSubject("bg", ComposerLiveKind.VIDEO, background = true))
        assertThat(cue.url).isEqualTo("https://cdn/bg")
        assertThat(cue.window).isEqualTo(ComposerLiveWindow(2_000, 5_000))
    }

    @Test
    fun `an uncut background video plays its whole source`() {
        assertThat(state(selectedMediaId = "bg").cue()!!.window).isEqualTo(ComposerLiveWindow(0, 8_000))
    }

    @Test
    fun `a selected background image has no player`() {
        assertThat(state(backgroundMime = "image/jpeg", selectedMediaId = "bg").cue()).isNull()
    }

    @Test
    fun `a selected placed video plays its own window, not the background's`() {
        val placed = StoryPlacedMedia(id = "p1", mediaId = "clip", sourceStart = 1.0, sourceEnd = 3.0)

        val cue = state(trim = MediaTrimBounds(2.0, 5.0), placed = listOf(placed), selectedMediaId = "p1").cue()!!

        assertThat(cue.subject).isEqualTo(ComposerLiveSubject("p1", ComposerLiveKind.VIDEO, background = false))
        assertThat(cue.url).isEqualTo("https://cdn/clip")
        assertThat(cue.window).isEqualTo(ComposerLiveWindow(1_000, 3_000))
    }

    @Test
    fun `a selected sound plays at its volume, silent when muted`() {
        val sound = StoryAudioPlayerObject(id = "a1", volume = 0.4f, mediaURL = "voice.m4a")
        val muted = sound.copy(volume = 0f, mutedVolumeMemento = 0.4f)

        val cue = state(audio = listOf(sound), selectedSoundId = "a1").cue()!!

        assertThat(cue.subject).isEqualTo(ComposerLiveSubject("a1", ComposerLiveKind.AUDIO, background = false))
        assertThat(cue.url).isEqualTo("https://audio/voice.m4a")
        assertThat(cue.volume).isEqualTo(0.4f)
        assertThat(state(audio = listOf(muted), selectedSoundId = "a1").cue()!!.volume).isEqualTo(0f)
    }

    @Test
    fun `a pending video plays from its file on the device`() {
        val file = File("/data/user/0/me.meeshy.app.debug/cache/clip.mp4")
        val item = MediaUploadItem(MediaUploadSource.OnDisk(file), "clip.mp4", "video/mp4", 8_000)
        val pending = state().let { s ->
            s.copy(
                attachments = s.attachments.filter { it.id != "bg" },
                pendingUploads = listOf(PendingMediaUpload(cmid = "bg", item = item)),
                selectedMediaId = "bg",
            )
        }

        assertThat(pending.cue()!!.url).isEqualTo("file://${file.path}")
    }
}
