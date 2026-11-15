package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.scene.ThreeFingerPinchDetector.Event
import me.meeshy.sdk.model.scene.ThreeFingerPinchDetector.Point
import org.junit.Test

class ThreeFingerPinchDetectorTest {
    private fun fingers(spread: Float, count: Int = 3): List<Point> =
        listOf(Point(-spread, 0f), Point(spread, 0f), Point(0f, spread), Point(0f, -spread)).take(count)

    @Test fun `deux doigts ne declenchent rien`() {
        val detector = ThreeFingerPinchDetector()
        assertThat(detector.onTouches(fingers(10f, 2))).isEqualTo(Event.None)
    }

    @Test fun `le troisieme doigt commence puis l'ecartement donne l'echelle`() {
        val detector = ThreeFingerPinchDetector()
        assertThat(detector.onTouches(fingers(10f))).isEqualTo(Event.Began)
        val changed = detector.onTouches(fingers(20f)) as Event.Changed
        assertThat(changed.scale).isWithin(1e-4f).of(2f)
    }

    @Test fun `lever un doigt termine avec la derniere echelle`() {
        val detector = ThreeFingerPinchDetector()
        detector.onTouches(fingers(10f))
        detector.onTouches(fingers(15f))
        val ended = detector.onTouches(fingers(15f, 2)) as Event.Ended
        assertThat(ended.scale).isWithin(1e-4f).of(1.5f)
    }

    @Test fun `un quatrieme doigt annule le geste en cours`() {
        val detector = ThreeFingerPinchDetector()
        detector.onTouches(fingers(10f))
        assertThat(detector.onTouches(fingers(12f, 4))).isEqualTo(Event.Cancelled)
        assertThat(detector.onTouches(fingers(12f))).isEqualTo(Event.None)
    }

    @Test fun `un quatrieme doigt avant le debut fait echouer le geste jusqu'au relachement`() {
        val detector = ThreeFingerPinchDetector()
        assertThat(detector.onTouches(fingers(10f, 4))).isEqualTo(Event.None)
        assertThat(detector.onTouches(fingers(10f))).isEqualTo(Event.None)
        detector.onTouches(emptyList())
        assertThat(detector.onTouches(fingers(10f))).isEqualTo(Event.Began)
    }

    @Test fun `un nouveau geste repart a l'echelle 1 apres un relachement`() {
        val detector = ThreeFingerPinchDetector()
        detector.onTouches(fingers(10f))
        detector.onTouches(fingers(30f))
        detector.onTouches(emptyList())
        detector.onTouches(fingers(10f))
        val changed = detector.onTouches(fingers(10f)) as Event.Changed
        assertThat(changed.scale).isWithin(1e-4f).of(1f)
    }
}
