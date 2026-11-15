package me.meeshy.app.calls

import android.os.PowerManager
import me.meeshy.sdk.model.call.CallAudioRouteKind
import me.meeshy.sdk.model.call.CallProximityPolicy

/**
 * Le capteur de proximité d'un appel audio : le verrou `PROXIMITY_SCREEN_OFF_WAKE_LOCK` éteint
 * l'écran à l'oreille. La décision (écouteur, audio seulement) est celle, pure, de
 * [CallProximityPolicy] ; ce contrôleur ne fait que tenir ou lâcher le verrou.
 */
internal class CallProximityController(private val powerManager: PowerManager?) {

    private val wakeLock: PowerManager.WakeLock? by lazy {
        powerManager
            ?.takeIf { it.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK) }
            ?.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, TAG)
            ?.apply { setReferenceCounted(false) }
    }

    fun update(isVideo: Boolean, activeKind: CallAudioRouteKind?) {
        if (CallProximityPolicy.shouldSense(isVideo, activeKind)) acquire() else release()
    }

    fun release() {
        val lock = wakeLock ?: return
        if (lock.isHeld) lock.release()
    }

    private fun acquire() {
        val lock = wakeLock ?: return
        if (!lock.isHeld) lock.acquire(MAX_HOLD_MS)
    }

    private companion object {
        const val TAG = "meeshy:call-proximity"
        const val MAX_HOLD_MS = 4L * 60 * 60 * 1000
    }
}
