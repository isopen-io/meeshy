package me.meeshy.sdk.model.relation

import java.time.Instant
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import me.meeshy.sdk.model.socket.SocketAck
import kotlinx.serialization.json.JsonObject

/**
 * ÉMETTRE MA POSITION À DES PERSONNES (#14109, #16985), côté Android — l'écriture Kotlin de
 * `sharedLocationStartPayloadSchema` / `SharedLocationAck` (`packages/shared/types/shared-location.ts`), iso
 * `Relations/SharedLocationSending.swift` du SDK iOS (#16983). L'appareil envoie UNE fois sa position complète et la
 * passerelle la tronque destinataire par destinataire : rien ici ne floute ni ne décide d'un droit. Ces briques bornent
 * la charge comme le serveur la borne, pour qu'un relevé absurde ne parte jamais.
 */
public enum class SharedLocationShareDuration(public val minutes: Int) {
    ONE_HOUR(60),
    EIGHT_HOURS(480);

    public val millis: Long get() = minutes * 60_000L
}

/** Un relevé de l'appareil, borné comme `sharedLocationPositionSchema`. */
public class SharedLocationFix private constructor(
    public val latitude: Double,
    public val longitude: Double,
    public val accuracy: Double?,
) {
    /** `location:share-update`, et la `position` de `location:share-start`. */
    public fun wire(): Map<String, Double> = buildMap {
        put("latitude", latitude)
        put("longitude", longitude)
        accuracy?.let { put("accuracy", it) }
    }

    /** La distance au sol, en mètres (haversine) : de quoi juger qu'on a bougé, jamais plus. */
    public fun distanceMeters(other: SharedLocationFix): Double {
        val radians = Math.PI / 180
        val dLat = (other.latitude - latitude) * radians
        val dLon = (other.longitude - longitude) * radians
        val a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(latitude * radians) * Math.cos(other.latitude * radians) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
        return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

    override fun equals(other: Any?): Boolean =
        other is SharedLocationFix && latitude == other.latitude && longitude == other.longitude && accuracy == other.accuracy

    override fun hashCode(): Int = wire().hashCode()

    override fun toString(): String = "SharedLocationFix(${wire()})"

    public companion object {
        private const val EARTH_RADIUS_METERS = 6_371_000.0

        /** `null` : un relevé hors du globe ou non fini ne part jamais. */
        public fun of(latitude: Double, longitude: Double, accuracy: Double? = null): SharedLocationFix? {
            val onGlobe = latitude.isFinite() && longitude.isFinite() &&
                latitude in -90.0..90.0 && longitude in -180.0..180.0
            if (!onGlobe) return null
            val bounded = accuracy?.takeIf { it.isFinite() && it >= 0.0 }?.coerceAtMost(SharedLocationContract.MAX_RADIUS_METERS)
            return SharedLocationFix(latitude, longitude, bounded)
        }
    }
}

/** Une personne à qui je montre ma position, et ce qu'elle en voit. */
public data class SharedLocationRecipient(val userId: String, val precision: SharedLocationPrecision)

/** La charge de `location:share-start`. Démarrer de nouveau REMPLACE le partage : la liste est toujours entière. */
public class SharedLocationStartRequest private constructor(
    public val recipients: List<SharedLocationRecipient>,
    public val duration: SharedLocationShareDuration,
    public val fix: SharedLocationFix,
) {
    public fun wire(): Map<String, Any> = mapOf(
        "recipients" to recipients.map { mapOf("userId" to it.userId, "precision" to it.precision.wire) },
        "durationMinutes" to duration.minutes,
        "position" to fix.wire(),
    )

    public companion object {
        /** `SHARED_LOCATION_RECIPIENTS_MAX`. */
        public const val MAX_RECIPIENTS: Int = 50

        private val objectId = Regex("^[a-fA-F0-9]{24}$")

        /**
         * `null` : aucun destinataire valide, ou plus que le plafond. Un destinataire en double garde sa DERNIÈRE
         * précision (le schéma serveur refuse les doublons, insensibles à la casse).
         */
        public fun of(
            recipients: List<SharedLocationRecipient>,
            duration: SharedLocationShareDuration,
            fix: SharedLocationFix,
        ): SharedLocationStartRequest? {
            val valid = recipients.filter { objectId.matches(it.userId) }
            val latest = valid.associate { it.userId.lowercase() to it.precision }
            val ordered = valid.map { it.userId.lowercase() }.distinct().map { SharedLocationRecipient(it, latest.getValue(it)) }
            if (ordered.isEmpty() || ordered.size > MAX_RECIPIENTS) return null
            return SharedLocationStartRequest(ordered, duration, fix)
        }
    }
}

/** Ce que l'interface dit d'un envoi qui n'a pas abouti. */
public enum class SharedLocationSendOutcome {
    INVALID,

    /** Une mise à jour sans partage en cours côté serveur (arrêté, échu, ou perdu) : l'émetteur s'arrête aussi. */
    NOT_SHARING,
    RATE_LIMITED,
    UNAVAILABLE,
    OFFLINE,
    FAILED;

    public companion object {
        private val refusals = mapOf(
            "SHARED_LOCATION_INVALID" to INVALID,
            "SHARED_LOCATION_NOT_SHARING" to NOT_SHARING,
            "SHARED_LOCATION_RATE_LIMITED" to RATE_LIMITED,
            "SHARED_LOCATION_UNAVAILABLE" to UNAVAILABLE,
            "NO_SOCKET" to OFFLINE,
        )

        /** Un code que ce client ne connaît pas vaut un échec, jamais une raison inventée. */
        public fun ofRefusal(code: String?): SharedLocationSendOutcome = code?.let { refusals[it] } ?: FAILED
    }
}

/** Le verdict d'un démarrage ou d'une mise à jour : le terme servi, ou le refus. */
public sealed interface SharedLocationStartVerdict {
    public data class Started(val expiresAtMillis: Long) : SharedLocationStartVerdict

    public data class Refused(val outcome: SharedLocationSendOutcome) : SharedLocationStartVerdict

    public companion object {
        /** L'accusé lu sur `data` (`SocketAckPayloadSource.DATA`). */
        public fun read(ack: SocketAck<JsonObject>): SharedLocationStartVerdict = when (ack) {
            is SocketAck.Accepted -> ack.payload.expiresAtMillis()?.let(::Started) ?: Refused(SharedLocationSendOutcome.FAILED)
            is SocketAck.Refused -> Refused(SharedLocationSendOutcome.ofRefusal(ack.refusal.code))
            SocketAck.Timeout -> Refused(SharedLocationSendOutcome.OFFLINE)
        }

        private fun JsonObject?.expiresAtMillis(): Long? {
            val raw = (this?.get("expiresAt") as? JsonPrimitive)?.contentOrNull ?: return null
            return runCatching { Instant.parse(raw).toEpochMilli() }.getOrNull()
        }
    }
}

/**
 * La cadence des mises à jour : sous le débit servi (`SHARED_LOCATION_RATE`, 120 par minute), un relevé ne part que si
 * l'on a vraiment bougé, ou au battement qui garde la position fraîche chez les destinataires.
 */
public object SharedLocationUpdateGate {
    public data class Sent(val fix: SharedLocationFix, val atMillis: Long)

    /** Jamais deux envois plus proches que ça : douze par minute au plus, dix fois sous le débit servi. */
    public const val MINIMUM_INTERVAL_MS: Long = 5_000L

    /** Un déplacement plus petit est du bruit GPS. */
    public const val MINIMUM_DISTANCE_METERS: Double = 50.0

    /** Immobile, la position est redite à ce rythme. */
    public const val HEARTBEAT_MS: Long = 120_000L

    public fun shouldSend(fix: SharedLocationFix, nowMillis: Long, last: Sent?): Boolean {
        if (last == null) return true
        val elapsed = nowMillis - last.atMillis
        if (elapsed < MINIMUM_INTERVAL_MS) return false
        return elapsed >= HEARTBEAT_MS || fix.distanceMeters(last.fix) >= MINIMUM_DISTANCE_METERS
    }
}

/**
 * « Partager ma position » se PROPOSE dès Ami (`location.temporary`), iso `ProfileCircleViewModel.offersSharedLocation`.
 * La passerelle rejuge la loi à chaque envoi et ne sert rien sous Ami.
 */
public object SharedLocationOfferRule {
    public fun offers(level: RelationLevel): Boolean = level >= RelationFeature.LOCATION_TEMPORARY.minimumLevel
}
