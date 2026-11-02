package me.meeshy.sdk.model

/** Une lecture de position avec son vecteur de mouvement — ce que le partage en direct émet. */
data class LiveLocationFix(
    val latitude: Double,
    val longitude: Double,
    val altitude: Double? = null,
    val accuracy: Double? = null,
    val speed: Double? = null,
    val heading: Double? = null,
)

/** Pourquoi un partage en direct n'a pas démarré — l'état l'explique à l'utilisateur. */
enum class LiveLocationStartFailure { PERMISSION_DENIED, NO_FIX, OFFLINE }

/** État du partage de MA position en direct (miroir émission de `LiveLocationSessions`). */
sealed interface LiveLocationSharingState {
    data object Idle : LiveLocationSharingState
    data object Starting : LiveLocationSharingState
    data class Sharing(val conversationId: String, val expiresAtMillis: Long) : LiveLocationSharingState {
        fun remainingMillis(nowMillis: Long): Long = (expiresAtMillis - nowMillis).coerceAtLeast(0L)
    }
    data class Failed(val reason: LiveLocationStartFailure) : LiveLocationSharingState
}

/**
 * Charges JSON des trois verbes émis (`location:live-start` / `-update` / `-stop`), miroir de
 * `LiveLocationStartPayload` / `LiveLocationUpdatePayload` d'iOS. Un champ absent n'est pas émis
 * (une vieille passerelle ignore ce qu'elle ne connaît pas).
 */
object LiveLocationEmission {

    /** Cadence des mises à jour de position pendant le partage. */
    const val UPDATE_INTERVAL_MILLIS: Long = 5_000L

    fun start(conversationId: String, fix: LiveLocationFix, duration: LiveLocationDuration): Map<String, Any> =
        mapOf(
            "conversationId" to conversationId,
            "latitude" to fix.latitude,
            "longitude" to fix.longitude,
            "durationMinutes" to duration.minutes,
        )

    fun update(conversationId: String, fix: LiveLocationFix): Map<String, Any> =
        buildMap {
            put("conversationId", conversationId)
            put("latitude", fix.latitude)
            put("longitude", fix.longitude)
            fix.altitude?.let { put("altitude", it) }
            fix.accuracy?.let { put("accuracy", it) }
            fix.speed?.let { put("speed", it) }
            fix.heading?.let { put("heading", it) }
        }

    fun stop(conversationId: String): Map<String, Any> = mapOf("conversationId" to conversationId)
}
