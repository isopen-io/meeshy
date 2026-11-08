package me.meeshy.sdk.model.socket

import me.meeshy.sdk.model.feedback.DailyGestureLimit
import me.meeshy.sdk.model.net.NewcomerSlowMode

/**
 * L'issue d'une émission Socket.IO qui exige une réponse. Miroir de `SocketAck` (iOS) : un refus de la passerelle,
 * une absence d'accusé et un succès sont trois issues distinctes — le « NO ACK » du client Socket.IO n'est jamais
 * pris pour un succès, et un refus n'est jamais réessayé par un autre transport par ce module.
 */
sealed interface SocketAck<out P> {

    /** `success:true`. [payload] est la charge lue là où l'appelant l'attend (racine, `data`) ; `null` quand elle est absente. */
    data class Accepted<out P>(val payload: P?) : SocketAck<P>

    data class Refused(val refusal: SocketAckRefusal) : SocketAck<Nothing>

    /** Aucun accusé dans l'échéance, ou un accusé qui n'est pas un objet JSON. */
    data object Timeout : SocketAck<Nothing>
}

/** Où la charge d'un accusé accepté se lit. */
enum class SocketAckPayloadSource {
    /** `data` quand c'est un objet, sinon la racine. */
    AUTO,
    DATA,
    ROOT,
    NONE,
}

/**
 * Le refus porté par un accusé `{ success:false, ... }`. [error] peut être un objet (`{ code, message, endReason }`)
 * ou une chaîne : [message] rend l'un ou l'autre, [code] préfère le code de la racine puis celui de l'objet [errorCode].
 */
data class SocketAckRefusal(
    val code: String? = null,
    val message: String? = null,
    val retryAfter: Int? = null,
    val resetAt: Long? = null,
    val limit: Int? = null,
    val errorCode: String? = null,
    val endReason: String? = null,
) {
    /** `DAILY_COMMENT_LIMIT` / `DAILY_REACTION_LIMIT`, avec la même loi que le REST ; `null` pour tout autre refus. */
    val dailyGestureLimit: DailyGestureLimit?
        get() = DailyGestureLimit.from(code, null, limit)?.copy(resetAtEpochMillis = resetAt)

    /** `NEWCOMER_SLOW_MODE`, avec la même loi que le REST (secondes entières ≥ 1) ; `null` pour tout autre refus. */
    val newcomerSlowMode: NewcomerSlowMode?
        get() = if (code == NewcomerSlowMode.CODE) NewcomerSlowMode(NewcomerSlowMode.seconds(retryAfter?.toDouble())) else null

    companion object {
        /** Le refus synthétique d'une socket absente : rendu sans lever, jamais confondu avec une échéance. */
        val NO_SOCKET: SocketAckRefusal = SocketAckRefusal(code = SocketAckCodes.NO_SOCKET, message = SocketAckCodes.NO_SOCKET)
    }
}

/** Les codes de refus d'ensemble, communs à toutes les émissions à accusé. */
object SocketAckCodes {
    const val UNAUTHENTICATED = "UNAUTHENTICATED"
    const val VALIDATION_ERROR = "VALIDATION_ERROR"
    const val NOT_A_PARTICIPANT = "NOT_A_PARTICIPANT"
    const val RATE_LIMITED = "RATE_LIMITED"
    const val CONVERSATION_CLOSED = "CONVERSATION_CLOSED"
    const val TIMEOUT = "TIMEOUT"
    const val NO_SOCKET = "NO_SOCKET"
    const val DAILY_COMMENT_LIMIT = DailyGestureLimit.COMMENT_CODE
    const val DAILY_REACTION_LIMIT = DailyGestureLimit.REACTION_CODE
    const val NEWCOMER_SLOW_MODE = NewcomerSlowMode.CODE

    val ALL: Set<String> = setOf(
        UNAUTHENTICATED, VALIDATION_ERROR, NOT_A_PARTICIPANT, RATE_LIMITED, CONVERSATION_CLOSED, TIMEOUT, NO_SOCKET,
        DAILY_COMMENT_LIMIT, DAILY_REACTION_LIMIT, NEWCOMER_SLOW_MODE,
    )
}
