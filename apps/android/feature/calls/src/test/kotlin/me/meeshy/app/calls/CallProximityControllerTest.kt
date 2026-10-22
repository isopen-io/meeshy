package me.meeshy.app.calls

import android.os.PowerManager
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import me.meeshy.sdk.model.call.CallAudioRouteKind
import org.junit.Test

class CallProximityControllerTest {
    private val lock: PowerManager.WakeLock = mockk(relaxed = true)
    private val power: PowerManager = mockk(relaxed = true) {
        every { isWakeLockLevelSupported(any()) } returns true
        every { newWakeLock(any(), any()) } returns lock
    }

    @Test
    fun `à l'oreille en audio le verrou de proximité est tenu`() {
        every { lock.isHeld } returns false
        CallProximityController(power).update(isVideo = false, activeKind = CallAudioRouteKind.Earpiece)
        verify(exactly = 1) { lock.acquire(any()) }
    }

    @Test
    fun `en haut-parleur le verrou est lâché`() {
        every { lock.isHeld } returns true
        CallProximityController(power).update(isVideo = false, activeKind = CallAudioRouteKind.Speaker)
        verify(exactly = 1) { lock.release() }
    }

    @Test
    fun `en vidéo le verrou n'est jamais pris`() {
        every { lock.isHeld } returns false
        CallProximityController(power).update(isVideo = true, activeKind = CallAudioRouteKind.Earpiece)
        verify(exactly = 0) { lock.acquire(any()) }
    }

    @Test
    fun `sans gestionnaire d'énergie rien ne plante`() {
        CallProximityController(null).update(isVideo = false, activeKind = CallAudioRouteKind.Earpiece)
    }
}
