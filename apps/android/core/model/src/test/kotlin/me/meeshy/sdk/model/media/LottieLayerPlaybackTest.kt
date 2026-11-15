package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LottieLayerPlaybackTest {
    private fun mode(
        animates: Boolean = true,
        granted: Boolean = true,
        system: Boolean = false,
        forced: Boolean = false,
        active: Boolean = true,
        onScreen: Boolean = true,
        loops: Boolean = true,
    ) = LottieLayerPlayback.mode(animates, granted, system, forced, active, onScreen, loops)

    @Test fun `tout autorise la couche joue en boucle`() =
        assertThat(mode()).isEqualTo(LottiePlaybackMode.Playing(loops = true))

    @Test fun `le reglage systeme reduit le mouvement a la premiere image`() =
        assertThat(mode(system = true)).isEqualTo(LottiePlaybackMode.FirstFrame)

    @Test fun `le reglage Meeshy renforce le systeme`() =
        assertThat(mode(forced = true)).isEqualTo(LottiePlaybackMode.FirstFrame)

    @Test fun `reduire l'emporte sur l'arriere-plan`() =
        assertThat(mode(system = true, active = false)).isEqualTo(LottiePlaybackMode.FirstFrame)

    @Test fun `arriere-plan met en pause sur place`() =
        assertThat(mode(active = false)).isEqualTo(LottiePlaybackMode.PausedInPlace)

    @Test fun `hors ecran met en pause sur place`() =
        assertThat(mode(onScreen = false)).isEqualTo(LottiePlaybackMode.PausedInPlace)

    @Test fun `animates faux montre la premiere image`() =
        assertThat(mode(animates = false)).isEqualTo(LottiePlaybackMode.FirstFrame)

    @Test fun `sans place au budget la premiere image`() =
        assertThat(mode(granted = false)).isEqualTo(LottiePlaybackMode.FirstFrame)

    @Test fun `loops faux joue une fois`() =
        assertThat(mode(loops = false)).isEqualTo(LottiePlaybackMode.Playing(loops = false))
}
