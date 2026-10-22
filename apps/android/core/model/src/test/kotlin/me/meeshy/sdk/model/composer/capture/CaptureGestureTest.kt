package me.meeshy.sdk.model.composer.capture

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.capture.CaptureAction.*
import me.meeshy.sdk.model.composer.capture.CaptureGestureKind.*
import me.meeshy.sdk.model.composer.capture.CaptureZone.*
import org.junit.Test

class CaptureGestureTest {
    private fun ctx(
        stage: CaptureStage = CaptureStage.ARMED,
        editing: Boolean = false,
        holding: Boolean = false,
        locked: Boolean = false,
        pending: Int = 0,
        photo: Boolean = true,
        video: Boolean = true,
        frame: Boolean = true,
    ) = CaptureGestureContext(stage, editing, holding, locked, pending, photo, video, frame)

    private fun act(z: CaptureZone, g: CaptureGestureKind, c: CaptureGestureContext = ctx()) = CaptureGesture.action(z, g, c)

    @Test
    fun `scene table armed`() {
        assertThat(act(SCENE, TAP)).isEqualTo(FOCUS)
        assertThat(act(SCENE, DOUBLE_TAP)).isEqualTo(PHOTO_TO_EDIT)
        assertThat(act(SCENE, LONG_PRESS)).isEqualTo(FILM_SEGMENT)
        assertThat(act(SCENE, PINCH)).isEqualTo(ZOOM)
        assertThat(act(SCENE, DRAG)).isEqualTo(CLOSE)
        assertThat(act(SCENE, DRAG, ctx(holding = true))).isEqualTo(STEER_TAKE)
    }

    @Test
    fun `scene while recording zooms on drag and refuses a photo`() {
        val rec = ctx(stage = CaptureStage.RECORDING)
        assertThat(act(SCENE, DRAG, rec)).isEqualTo(ZOOM)
        assertThat(act(SCENE, DOUBLE_TAP, rec)).isEqualTo(NONE)
        assertThat(act(SCENE, LONG_PRESS, rec)).isEqualTo(NONE)
        assertThat(act(SCENE, TAP, rec)).isEqualTo(FOCUS)
    }

    @Test
    fun `pending segments and format limits forbid a lone photo`() {
        assertThat(act(SCENE, DOUBLE_TAP, ctx(pending = 1))).isEqualTo(NONE)
        assertThat(act(SCENE, DOUBLE_TAP, ctx(photo = false))).isEqualTo(NONE)
        assertThat(act(SCENE, LONG_PRESS, ctx(video = false))).isEqualTo(NONE)
    }

    @Test
    fun `chosen thumbnail is the shutter when a frame is chosen`() {
        assertThat(act(CHOSEN_THUMBNAIL, TAP)).isEqualTo(PHOTO_TO_GALLERY)
        assertThat(act(CHOSEN_THUMBNAIL, DOUBLE_TAP)).isEqualTo(PHOTO_TO_GALLERY)
        assertThat(act(CHOSEN_THUMBNAIL, LONG_PRESS)).isEqualTo(FILM_TO_GALLERY)
        assertThat(act(CHOSEN_THUMBNAIL, TAP, ctx(stage = CaptureStage.RECORDING))).isEqualTo(NONE)
        assertThat(act(CHOSEN_THUMBNAIL, TAP, ctx(stage = CaptureStage.RECORDING, locked = true))).isEqualTo(STOP_TAKE)
    }

    @Test
    fun `chosen thumbnail without frame behaves as the simple shutter`() {
        val none = ctx(frame = false)
        assertThat(act(CHOSEN_THUMBNAIL, TAP, none)).isEqualTo(PHOTO_TO_EDIT)
        assertThat(act(CHOSEN_THUMBNAIL, DOUBLE_TAP, none)).isEqualTo(NONE)
        assertThat(act(CHOSEN_THUMBNAIL, LONG_PRESS, none)).isEqualTo(FILM_SEGMENT)
    }

    @Test
    fun `shutter table`() {
        assertThat(act(SHUTTER, TAP)).isEqualTo(PHOTO_TO_EDIT)
        assertThat(act(SHUTTER, DOUBLE_TAP)).isEqualTo(NONE)
        assertThat(act(SHUTTER, LONG_PRESS)).isEqualTo(FILM_SEGMENT)
        assertThat(act(SHUTTER, PINCH)).isEqualTo(ZOOM)
        assertThat(act(SHUTTER, DRAG)).isEqualTo(NONE)
        assertThat(act(SHUTTER, DRAG, ctx(holding = true))).isEqualTo(STEER_TAKE)
        assertThat(act(SHUTTER, TAP, ctx(pending = 2))).isEqualTo(NONE)
        assertThat(act(SHUTTER, TAP, ctx(stage = CaptureStage.RECORDING, locked = true))).isEqualTo(STOP_TAKE)
    }

    @Test
    fun `other thumbnails and rail only answer a tap while the look is free`() {
        assertThat(act(OTHER_THUMBNAIL, TAP)).isEqualTo(SELECT)
        assertThat(act(RAIL, TAP)).isEqualTo(OPEN_FAMILY)
        assertThat(act(RAIL, LONG_PRESS)).isEqualTo(NONE)
        assertThat(act(RAIL, TAP, ctx(stage = CaptureStage.RECORDING))).isEqualTo(NONE)
        assertThat(act(OTHER_THUMBNAIL, TAP, ctx(pending = 1))).isEqualTo(NONE)
        assertThat(CaptureGesture.offersRail(ctx())).isTrue()
        assertThat(CaptureGesture.offersRail(ctx(pending = 1))).isFalse()
    }

    @Test
    fun `stage off answers nothing`() {
        CaptureZone.values().forEach { z ->
            CaptureGestureKind.values().forEach { g -> assertThat(act(z, g, ctx(stage = CaptureStage.OFF))).isEqualTo(NONE) }
        }
    }

    @Test
    fun `editing table`() {
        val e = ctx(editing = true)
        assertThat(act(SCENE, DRAG, e)).isEqualTo(REFRAME)
        assertThat(act(SCENE, PINCH, e)).isEqualTo(REFRAME)
        assertThat(act(SCENE, TAP, e)).isEqualTo(TOGGLE_EDIT_CHROME)
        assertThat(act(OTHER_THUMBNAIL, TAP, e)).isEqualTo(SELECT)
        assertThat(act(RAIL, TAP, e)).isEqualTo(OPEN_FAMILY)
        assertThat(act(SHUTTER, TAP, e)).isEqualTo(NONE)
    }

    @Test
    fun `first tap on the scene focuses and remembers`() {
        val o = CaptureGesture.tap(SCENE, ctx(), 1000, null, null)
        assertThat(o.action).isEqualTo(FOCUS)
        assertThat(o.consumedDouble).isFalse()
        assertThat(o.memory).isEqualTo(CaptureLastTap(SCENE, 1000))
    }

    @Test
    fun `second tap within 300 ms in the same zone is a photo and ends the double`() {
        val o = CaptureGesture.tap(SCENE, ctx(), 1300, CaptureLastTap(SCENE, 1000), armedAtMs = 0)
        assertThat(o.action).isEqualTo(PHOTO_TO_EDIT)
        assertThat(o.consumedDouble).isTrue()
        assertThat(o.memory).isNull()
    }

    @Test
    fun `a double never crosses zones nor exceeds the window`() {
        assertThat(CaptureGesture.tap(SCENE, ctx(), 1100, CaptureLastTap(SHUTTER, 1000), 0).action).isEqualTo(FOCUS)
        assertThat(CaptureGesture.tap(SCENE, ctx(), 1301, CaptureLastTap(SCENE, 1000), 0).action).isEqualTo(FOCUS)
    }

    @Test
    fun `the tap that armed the viewfinder does not open a double`() {
        val o = CaptureGesture.tap(SCENE, ctx(), 1100, CaptureLastTap(SCENE, 1000), armedAtMs = 1000)
        assertThat(o.action).isEqualTo(FOCUS)
    }

    @Test
    fun `second tap of a double on a shutter is absorbed so only one photo is taken`() {
        val o = CaptureGesture.tap(SHUTTER, ctx(), 1200, CaptureLastTap(SHUTTER, 1000), 0)
        assertThat(o.action).isEqualTo(NONE)
        assertThat(o.consumedDouble).isTrue()
        assertThat(o.memory).isNull()
        val chosen = CaptureGesture.tap(CHOSEN_THUMBNAIL, ctx(), 1200, CaptureLastTap(CHOSEN_THUMBNAIL, 1000), 0)
        assertThat(chosen.action).isEqualTo(NONE)
    }

    @Test
    fun `a double refused by the table stays a focusing tap`() {
        val o = CaptureGesture.tap(SCENE, ctx(pending = 1), 1200, CaptureLastTap(SCENE, 1000), 0)
        assertThat(o.action).isEqualTo(FOCUS)
        assertThat(o.consumedDouble).isFalse()
    }

    @Test
    fun `accessibility actions are projected from the table`() {
        assertThat(CaptureGesture.accessibilityActions(SCENE, ctx())).containsExactly(PHOTO_TO_EDIT, FILM_SEGMENT, FOCUS).inOrder()
        assertThat(CaptureGesture.accessibilityActions(SCENE, ctx(stage = CaptureStage.RECORDING))).containsExactly(STOP_TAKE, FOCUS).inOrder()
        assertThat(CaptureGesture.accessibilityActions(SHUTTER, ctx())).containsExactly(PHOTO_TO_EDIT, FILM_SEGMENT).inOrder()
        assertThat(CaptureGesture.accessibilityActions(CHOSEN_THUMBNAIL, ctx(stage = CaptureStage.RECORDING))).containsExactly(STOP_TAKE)
        assertThat(CaptureGesture.accessibilityActions(RAIL, ctx())).isEmpty()
        assertThat(CaptureGesture.accessibilityActions(SCENE, ctx(editing = true))).isEmpty()
    }

    @Test
    fun `tap rule helpers`() {
        assertThat(CaptureTapRule.followsAHold(1000, 1299)).isTrue()
        assertThat(CaptureTapRule.followsAHold(1000, 1300)).isFalse()
        assertThat(CaptureTapRule.followsAHold(null, 1300)).isFalse()
        assertThat(CaptureTapRule.belongsToAnAlert(true, null, 0)).isTrue()
        assertThat(CaptureTapRule.belongsToAnAlert(false, 1000, 1100)).isTrue()
        assertThat(CaptureTapRule.belongsToAnAlert(false, 1000, 2000)).isFalse()
        assertThat(CaptureTapRule.action(CaptureStage.RECORDING, 1100, 1000, 0)).isEqualTo(CaptureTapRule.Action.FOCUS)
    }
}
