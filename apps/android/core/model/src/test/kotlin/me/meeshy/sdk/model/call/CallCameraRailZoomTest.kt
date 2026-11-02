package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.camera.CameraLens
import me.meeshy.sdk.model.call.camera.CameraZoomPolicy
import org.junit.Test

class CallCameraRailZoomTest {
    private val triple = CameraZoomPolicy.profile(
        listOf(CameraLens("w", 0.5f), CameraLens("m", 1f), CameraLens("t", 3f)),
        isFront = false,
        maxDigitalZoom = 8f,
    )

    @Test
    fun `mon image en plein ecran porte les pastilles de chaque palier`() {
        assertThat(CallCameraRail.zoomControl(triple, CallCameraControlsPlacement.TopCenter, tileWidthDp = null, tileHeightDp = null))
            .isEqualTo(CallZoomControl.LensChips(listOf(0.5f, 1f, 2f, 3f)))
    }

    @Test
    fun `dans ma vignette un seul bouton passe au palier suivant`() {
        assertThat(CallCameraRail.zoomControl(triple, CallCameraControlsPlacement.SelfTile, tileWidthDp = 72f, tileHeightDp = 100f))
            .isEqualTo(CallZoomControl.CycleButton)
    }

    @Test
    fun `une vignette ou la cible de 44 dp ne tient pas n'a pas de bouton de zoom`() {
        assertThat(CallCameraRail.zoomControl(triple, CallCameraControlsPlacement.SelfTile, tileWidthDp = 51f, tileHeightDp = 100f)).isNull()
        assertThat(CallCameraRail.zoomControl(triple, CallCameraControlsPlacement.SelfTile, tileWidthDp = 72f, tileHeightDp = 51f)).isNull()
        assertThat(CallCameraRail.zoomControl(triple, CallCameraControlsPlacement.SelfTile, tileWidthDp = null, tileHeightDp = null)).isNull()
        assertThat(CallCameraRail.zoomControl(triple, CallCameraControlsPlacement.SelfTile, tileWidthDp = 52f, tileHeightDp = 52f))
            .isEqualTo(CallZoomControl.CycleButton)
    }

    @Test
    fun `sans vignette ni plein ecran, le zoom n'est pas offert`() {
        assertThat(CallCameraRail.zoomControl(triple, CallCameraControlsPlacement.Menu, tileWidthDp = 72f, tileHeightDp = 100f)).isNull()
    }

    @Test
    fun `une camera sans zoom ou a un seul palier n'offre rien`() {
        assertThat(CallCameraRail.zoomControl(null, CallCameraControlsPlacement.TopCenter, null, null)).isNull()
        val front = CameraZoomPolicy.profile(listOf(CameraLens("f", 1f)), isFront = true, maxDigitalZoom = 1.5f)
        assertThat(front?.quickStops).containsExactly(1f)
        assertThat(CallCameraRail.zoomControl(front, CallCameraControlsPlacement.TopCenter, null, null)).isNull()
    }

    @Test
    fun `la rangee de la camera ne porte que retourner ou choisir, puis allumer`() {
        val set = CallActionSet(
            myImage = listOf(CallAction.Camera, CallAction.CameraPicker, CallAction.Effects, CallAction.ScreenShare),
            theCall = emptyList(),
        )
        assertThat(CallCameraRail.selfTileRows(CallCameraRail.actions(set)).camera)
            .containsExactly(CallAction.CameraPicker, CallAction.Camera).inOrder()
    }
}
