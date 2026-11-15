package me.meeshy.sdk.model.call

/** Le mode de sonnerie de l'appareil (`AudioManager.RINGER_MODE_*`). */
enum class CallRingerMode { Normal, Vibrate, Silent }

/** Le filtre Ne pas déranger (`NotificationManager.INTERRUPTION_FILTER_*`). */
enum class CallDndFilter { Off, Priority, Alarms, None }

/** Ce que l'appareil permet à un appel entrant d'émettre. */
data class CallRingPlan(val sound: Boolean, val vibrate: Boolean) {
    val isSilent: Boolean get() = !sound && !vibrate

    companion object {
        val Nothing = CallRingPlan(sound = false, vibrate = false)
    }
}

/**
 * Loi pure : ce qu'un appel entrant a le droit d'émettre selon les réglages de l'appareil.
 *
 *  - Ne pas déranger « Aucune interruption » ou « Alarmes seulement » : rien ne sonne ni ne vibre ;
 *    « Prioritaires seulement » : l'appel passe seulement si l'appelant est une exception ;
 *  - mode vibreur ou silencieux : jamais de son, la vibration suit le réglage de l'utilisateur ;
 *  - volume de sonnerie nul : pas de son, la vibration reste.
 */
object CallRingGate {

    fun plan(
        ringerMode: CallRingerMode,
        dnd: CallDndFilter,
        callerIsException: Boolean,
        ringVolume: Int,
        vibrationEnabled: Boolean,
    ): CallRingPlan {
        val blocked = when (dnd) {
            CallDndFilter.Off -> false
            CallDndFilter.Priority -> !callerIsException
            CallDndFilter.Alarms, CallDndFilter.None -> true
        }
        if (blocked) return CallRingPlan.Nothing
        val audible = ringerMode == CallRingerMode.Normal && ringVolume > 0
        return CallRingPlan(sound = audible, vibrate = vibrationEnabled)
    }
}
