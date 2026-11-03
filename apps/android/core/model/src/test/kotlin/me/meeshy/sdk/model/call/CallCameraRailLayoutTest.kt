package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallCameraRailLayoutTest {
    private val container = CallTileSize(360f, 740f)
    private val insets = CallSafeInsets(topDp = 24f, bottomDp = 48f, startDp = 0f, endDp = 0f)
    private val bounds = CallSelfTileControlsLaw.bounds(container, insets)
    private val screen = CallTileRect(0f, 0f, 360f, 740f)

    private fun frames(center: CallTilePoint = CallTilePoint(180f, 300f)) =
        CallSelfTileControlsLaw.rows(center, CallTileSize(100f, 140f), bounds, effectsCount = 2, cameraCount = 2)

    @Test
    fun `les rangees suivent le glisse du meme decalage sans changer de cote`() {
        val resting = frames()
        val moved = CallSelfTileControlsLaw.following(resting, dxDp = 30f, dyDp = 50f, within = screen)
        assertThat(moved.effects!!.xDp).isEqualTo(resting.effects!!.xDp + 30f)
        assertThat(moved.effects!!.yDp).isEqualTo(resting.effects!!.yDp + 50f)
        assertThat(moved.camera!!.yDp).isEqualTo(resting.camera!!.yDp + 50f)
    }

    @Test
    fun `les rangees restent dans l'ecran meme si la vignette est tiree hors du cadre`() {
        val moved = CallSelfTileControlsLaw.following(frames(), dxDp = 900f, dyDp = -900f, within = screen)
        val effects = moved.effects!!
        val camera = moved.camera!!
        assertThat(effects.xDp + effects.widthDp).isAtMost(360f)
        assertThat(effects.yDp).isAtLeast(0f)
        assertThat(camera.yDp).isAtLeast(0f)
    }

    @Test
    fun `une rangee absente le reste pendant le glisse`() {
        val none = CallSelfTileControlsLaw.rows(CallTilePoint(180f, 300f), CallTileSize(100f, 140f), bounds, 0, 1)
        assertThat(CallSelfTileControlsLaw.following(none, 10f, 10f, screen).effects).isNull()
    }

    @Test
    fun `seule la petite vignette replie les commandes en un bouton`() {
        assertThat(CallCameraRail.foldsRows(tileWidthDp = CallSelfTileScale.X1.widthDp)).isTrue()
        assertThat(CallCameraRail.foldsRows(tileWidthDp = CallSelfTileScale.X2.widthDp)).isFalse()
        assertThat(CallCameraRail.foldsRows(tileWidthDp = CallSelfTileScale.X3.widthDp)).isFalse()
    }

    @Test
    fun `la grille se deplie en pincant la vignette de petite a moyenne sans etat residuel`() {
        assertThat(CallCameraRail.foldsRows(tileWidthDp = 90f)).isTrue()
        assertThat(CallCameraRail.foldsRows(tileWidthDp = 100f)).isFalse()
    }
}
