package me.meeshy.sdk.model.call

/**
 * Pourquoi un verbe de contrôle d'appel (inviter, couper le micro, réagir, cadre)
 * a été refusé. [code] est un `CALL_CONTROL_ERROR_CODES` de la passerelle, ou
 * `NO_SOCKET` / `TIMEOUT` / `MALFORMED_ACK` quand la réponse n'arrive pas entière.
 */
class CallControlRefusal(val code: String) : Exception(code) {

    enum class Reason { INSUFFICIENT_RIGHT, CALL_ENDED, LIMIT, UNAVAILABLE, OFFLINE, OTHER }

    val reason: Reason
        get() = when (code) {
            "PERMISSION_DENIED", "NOT_A_PARTICIPANT", "NOT_A_CONTACT", "NOT_AUTHENTICATED" -> Reason.INSUFFICIENT_RIGHT
            "CALL_NOT_ACTIVE" -> Reason.CALL_ENDED
            "MAX_PARTICIPANTS_REACHED", "RATE_LIMITED" -> Reason.LIMIT
            "ALREADY_IN_CALL", "TARGET_NOT_IN_CALL" -> Reason.UNAVAILABLE
            "NO_SOCKET", "TIMEOUT" -> Reason.OFFLINE
            else -> Reason.OTHER
        }

    override fun equals(other: Any?): Boolean = other is CallControlRefusal && other.code == code

    override fun hashCode(): Int = code.hashCode()

    companion object {
        const val NO_SOCKET = "NO_SOCKET"
        const val TIMEOUT = "TIMEOUT"
        const val MALFORMED_ACK = "MALFORMED_ACK"
    }
}
