package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.playback.VideoSurfaceRole.FULLSCREEN
import me.meeshy.sdk.model.playback.VideoSurfaceRole.INLINE
import me.meeshy.sdk.model.playback.VideoSurfaceRole.PICTURE_IN_PICTURE
import org.junit.Test

class VideoMountingLawTest {
    private fun may(role: VideoSurfaceRole, surface: String = "a", active: String = "a", pip: Boolean = false) =
        VideoMountingLaw.mayMountPlayer(role, surface, active, pip)

    @Test
    fun `table surface x media x PiP`() {
        assertThat(may(INLINE)).isTrue()
        assertThat(may(INLINE, pip = true)).isFalse()
        assertThat(may(FULLSCREEN)).isTrue()
        assertThat(may(FULLSCREEN, pip = true)).isTrue()
        assertThat(may(PICTURE_IN_PICTURE)).isFalse()
        assertThat(may(PICTURE_IN_PICTURE, pip = true)).isTrue()
    }

    @Test
    fun `un autre media ne monte jamais le lecteur, quel que soit le role`() {
        VideoSurfaceRole.values().forEach { role ->
            assertThat(may(role, surface = "a", active = "b", pip = true)).isFalse()
            assertThat(may(role, surface = "a", active = "b", pip = false)).isFalse()
        }
    }

    @Test
    fun `deux identites vides ne sont pas le meme media`() {
        VideoSurfaceRole.values().forEach { role ->
            assertThat(may(role, surface = "", active = "", pip = true)).isFalse()
            assertThat(may(role, surface = "", active = "", pip = false)).isFalse()
        }
    }

    @Test
    fun `le plein ecran ne depend pas du PiP et le reprend`() {
        assertThat(VideoMountingLaw.mayMountFullscreenPlayer("a", "a")).isTrue()
        assertThat(VideoMountingLaw.mayMountFullscreenPlayer("a", "b")).isFalse()
        assertThat(VideoMountingLaw.fullscreenReclaimsPip("a", "a", isPipActive = true)).isTrue()
        assertThat(VideoMountingLaw.fullscreenReclaimsPip("a", "a", isPipActive = false)).isFalse()
        assertThat(VideoMountingLaw.fullscreenReclaimsPip("a", "b", isPipActive = true)).isFalse()
    }

    @Test
    fun `fermer le plein ecran n abandonne la lecture qu au PiP`() {
        assertThat(VideoMountingLaw.fullscreenCloseDisposition(true))
            .isEqualTo(FullscreenCloseDisposition.KEEPS_PLAYING_IN_PIP)
        assertThat(VideoMountingLaw.fullscreenCloseDisposition(false)).isEqualTo(FullscreenCloseDisposition.STOPS)
    }

    @Test
    fun `un lecteur prepare n est adopte que s il lit le fichier local`() {
        assertThat(VideoMountingLaw.mayAdoptPreparedPlayer(playsLocalFile = true, localFileOnDisk = true)).isTrue()
        assertThat(VideoMountingLaw.mayAdoptPreparedPlayer(playsLocalFile = false, localFileOnDisk = true)).isFalse()
        assertThat(VideoMountingLaw.mayAdoptPreparedPlayer(playsLocalFile = false, localFileOnDisk = false)).isTrue()
    }

    @Test
    fun `le sortant retourne au pool seulement prepare et sur fichier`() {
        assertThat(VideoMountingLaw.mayRecycleOutgoingPlayer(isReady = true, playsLocalFile = true)).isTrue()
        assertThat(VideoMountingLaw.mayRecycleOutgoingPlayer(isReady = true, playsLocalFile = false)).isFalse()
        assertThat(VideoMountingLaw.mayRecycleOutgoingPlayer(isReady = false, playsLocalFile = true)).isFalse()
    }
}
