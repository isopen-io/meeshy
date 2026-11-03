package me.meeshy.sdk.model.ongoing

/**
 * **Quel type de service de premier plan déclarer, selon les activités ET les permissions.**
 * Android 14 lève une exception si un service déclare `microphone` ou `camera` sans la permission
 * d'exécution correspondante : un type dont la permission manque est donc RETIRÉ du masque (et le type
 * ne compte plus pour élire la notification du premier plan), jamais déclaré à tort.
 *
 * Pure : les constantes sont celles de `ServiceInfo.FOREGROUND_SERVICE_TYPE_*`, recopiées pour rester
 * en JVM. Une activité sans type possible ne tient pas le premier plan.
 */
object ForegroundTypeLaw {

    const val DATA_SYNC: Int = 1
    const val MEDIA_PLAYBACK: Int = 2
    const val PHONE_CALL: Int = 4
    const val MEDIA_PROJECTION: Int = 32
    const val CAMERA: Int = 64
    const val MICROPHONE: Int = 128

    data class Permissions(val microphone: Boolean, val camera: Boolean, val manageOwnCalls: Boolean = true)

    data class Result(val mask: Int, val primary: OngoingActivityKind?)

    fun resolve(active: Set<OngoingActivityKind>, isVideoCall: Boolean, permissions: Permissions): Result {
        val contributions = active.associateWith { typeOf(it, isVideoCall, permissions) }.filterValues { it != 0 }
        val primary = contributions.keys.maxByOrNull { it.priority }
        return Result(contributions.values.fold(0) { mask, type -> mask or type }, primary)
    }

    fun typeOf(kind: OngoingActivityKind, isVideoCall: Boolean, permissions: Permissions): Int = when (kind) {
        OngoingActivityKind.Call ->
            (if (permissions.manageOwnCalls) PHONE_CALL else 0) or
                (if (permissions.microphone) MICROPHONE else 0) or
                (if (isVideoCall && permissions.camera) CAMERA else 0)
        OngoingActivityKind.Recording -> if (permissions.microphone) MICROPHONE else 0
        OngoingActivityKind.ScreenShare -> MEDIA_PROJECTION
        OngoingActivityKind.Playback -> MEDIA_PLAYBACK
        OngoingActivityKind.Outbox -> DATA_SYNC
    }
}
