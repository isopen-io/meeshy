package me.meeshy.sdk.model.call.camera

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CameraZoomAdjustTest {
    private val profile = requireNotNull(
        CameraZoomPolicy.profile(listOf(CameraLens("w", 0.5f), CameraLens("m", 1f)), isFront = false, maxDigitalZoom = 10f),
    )

    @Test
    fun `le cran courant est le plus proche du facteur affiche`() {
        assertThat(CameraZoomAdjust.currentIndex(profile, 0.5f)).isEqualTo(0)
        assertThat(CameraZoomAdjust.currentIndex(profile, 1.1f)).isEqualTo(profile.stops.indexOf(1f))
        assertThat(CameraZoomAdjust.currentIndex(profile, 9f)).isEqualTo(profile.stops.lastIndex)
    }

    @Test
    fun `un indice propose plus haut incremente, plus bas decremente, egal ne fait rien`() {
        assertThat(CameraZoomAdjust.step(2, 3f)).isEqualTo(CameraZoomStep.Increment)
        assertThat(CameraZoomAdjust.step(2, 1f)).isEqualTo(CameraZoomStep.Decrement)
        assertThat(CameraZoomAdjust.step(2, 2f)).isNull()
    }

    @Test
    fun `un pas fractionnaire de TalkBack garde son sens`() {
        assertThat(CameraZoomAdjust.step(2, 2.2f)).isEqualTo(CameraZoomStep.Increment)
        assertThat(CameraZoomAdjust.step(2, 1.8f)).isEqualTo(CameraZoomStep.Decrement)
    }
}
