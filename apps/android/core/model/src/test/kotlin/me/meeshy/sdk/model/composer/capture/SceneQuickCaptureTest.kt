package me.meeshy.sdk.model.composer.capture

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerOpening
import org.junit.Test

/** #13849 — la scène vide de la story arme le viseur (iOS `ComposerSceneQuickCapture`, `ComposerSceneCamera.modes`). */
class SceneQuickCaptureTest {

    @Test
    fun `a story or a post offers photo and video, a reel films only and a mood has no viewfinder`() {
        assertThat(SceneQuickCapture.offer(ComposerFormat.STORY, ComposerOpening.CAMERA_READY))
            .isEqualTo(SceneQuickCapture.Offer(allowsPhoto = true, allowsVideo = true))
        assertThat(SceneQuickCapture.offer(ComposerFormat.POST, ComposerOpening.KEYBOARD_ON_CONTENT))
            .isEqualTo(SceneQuickCapture.Offer(allowsPhoto = true, allowsVideo = true))
        assertThat(SceneQuickCapture.offer(ComposerFormat.REEL, ComposerOpening.CAMERA_READY))
            .isEqualTo(SceneQuickCapture.Offer(allowsPhoto = false, allowsVideo = true))
        assertThat(SceneQuickCapture.offer(ComposerFormat.STATUS, ComposerOpening.CAMERA_READY)).isNull()
    }

    @Test
    fun `the door that promises a video viewfinder opens it in video, never in photo`() {
        assertThat(SceneQuickCapture.offer(ComposerFormat.STORY, ComposerOpening.VIDEO_CAMERA_READY))
            .isEqualTo(SceneQuickCapture.Offer(allowsPhoto = false, allowsVideo = true))
    }

    @Test
    fun `the gesture exists only on a blank scene, viewfinder off, no tool open, in a format that has a viewfinder`() {
        val story = SceneQuickCapture.offer(ComposerFormat.STORY, ComposerOpening.CAMERA_READY)
        assertThat(SceneQuickCapture.offers(sceneIsBlank = true, armed = false, toolIsOpen = false, offer = story)).isTrue()
        assertThat(SceneQuickCapture.offers(sceneIsBlank = false, armed = false, toolIsOpen = false, offer = story)).isFalse()
        assertThat(SceneQuickCapture.offers(sceneIsBlank = true, armed = true, toolIsOpen = false, offer = story)).isFalse()
        assertThat(SceneQuickCapture.offers(sceneIsBlank = true, armed = false, toolIsOpen = true, offer = story)).isFalse()
        assertThat(SceneQuickCapture.offers(sceneIsBlank = true, armed = false, toolIsOpen = false, offer = null)).isFalse()
    }

    @Test
    fun `the hint names the two gestures a photo viewfinder serves, and only filming where photo is not served`() {
        assertThat(SceneQuickCapture.hint(SceneQuickCapture.Offer(allowsPhoto = true, allowsVideo = true)))
            .isEqualTo(SceneQuickCapture.Hint.TAP_OR_HOLD)
        assertThat(SceneQuickCapture.hint(SceneQuickCapture.Offer(allowsPhoto = false, allowsVideo = true)))
            .isEqualTo(SceneQuickCapture.Hint.HOLD_TO_FILM)
    }

    @Test
    fun `a long press films at once only where video is served`() {
        assertThat(SceneQuickCapture.filmsOnHold(SceneQuickCapture.Offer(allowsPhoto = true, allowsVideo = true))).isTrue()
        assertThat(SceneQuickCapture.filmsOnHold(SceneQuickCapture.Offer(allowsPhoto = true, allowsVideo = false))).isFalse()
    }

    // MARK: - Le doigt qui a armé le viseur en tenant la scène (iOS beginHold / holdChanged / endHold, ComposerCaptureHold)

    private class Session {
        var state = CaptureSessionState(armedAtMs = 0)
        val effects = mutableListOf<CaptureEffect>()
        fun feed(signal: SceneHoldSignal) = signal.events.forEach { event ->
            val step = CaptureSessionReducer.reduce(state, event)
            state = step.state
            effects += step.effects
        }
        fun recordingStarted() {
            val token = effects.filterIsInstance<CaptureEffect.StartRecording>().last().token
            val step = CaptureSessionReducer.reduce(state, CaptureEvent.RecordingStarted(token))
            state = step.state
            effects += step.effects
        }
    }

    @Test
    fun `a finger lifted before the camera is ready has asked for nothing`() {
        val relay = SceneHoldRelay()
        val session = Session()
        relay.began()
        relay.moved(dxDp = 10f, dyDp = 0f)
        relay.released()

        relay.attach(session::feed)

        assertThat(session.effects).isEmpty()
    }

    @Test
    fun `a finger still holding when the camera is ready films, and lifting it closes the take`() {
        val relay = SceneHoldRelay()
        val session = Session()
        relay.began()

        relay.attach(session::feed)
        session.recordingStarted()
        relay.released()

        assertThat(session.effects.filterIsInstance<CaptureEffect.StartRecording>()).hasSize(1)
        assertThat(session.effects).contains(CaptureEffect.StopRecording)
        assertThat(session.state.locked).isFalse()
    }

    @Test
    fun `a lock reached before the camera is ready is an intention, the take runs on after the finger left`() {
        val relay = SceneHoldRelay()
        val session = Session()
        relay.began()
        relay.moved(dxDp = ShutterGesture.SLIDE_TO_LOCK_DP + 4f, dyDp = 0f)
        relay.moved(dxDp = 0f, dyDp = 0f)
        relay.released()

        relay.attach(session::feed)

        assertThat(session.effects.filterIsInstance<CaptureEffect.StartRecording>()).hasSize(1)
        assertThat(session.effects).doesNotContain(CaptureEffect.CancelPendingRecording)
        assertThat(session.effects).doesNotContain(CaptureEffect.StopRecording)
        assertThat(session.state.locked).isTrue()
    }

    @Test
    fun `once attached the finger is relayed live, and a cleared relay replays nothing`() {
        val relay = SceneHoldRelay()
        val seen = mutableListOf<SceneHoldSignal>()
        relay.attach { seen += it }
        relay.began()
        relay.moved(dxDp = 3f, dyDp = -20f)
        relay.released()

        assertThat(seen).containsExactly(SceneHoldSignal.Began, SceneHoldSignal.Moved(3f, -20f), SceneHoldSignal.Released).inOrder()
        assertThat(relay.holding).isFalse()

        val cleared = SceneHoldRelay()
        cleared.began()
        cleared.clear()
        val replayed = mutableListOf<SceneHoldSignal>()
        cleared.attach { replayed += it }
        assertThat(replayed).isEmpty()
    }
}
