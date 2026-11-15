package me.meeshy.sdk.model.feedback

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** Le refus `DAILY_COMMENT_LIMIT` / `DAILY_REACTION_LIMIT` de la passerelle : miroir de `DailyGestureLimit` (iOS). */
data class DailyGestureLimit(val gesture: Gesture, val resetAtEpochMillis: Long?, val limit: Int? = null) {

    enum class Gesture { COMMENT, REACTION }

    /** L'heure de remise à zéro, courte, dans le fuseau et la langue de l'appareil ; `null` si la passerelle ne la dit pas. */
    fun resetTimeLabel(zone: ZoneId = ZoneId.systemDefault(), locale: Locale = Locale.getDefault()): String? =
        resetAtEpochMillis?.let {
            DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).withZone(zone).format(Instant.ofEpochMilli(it))
        }

    /**
     * La raison d'échec que la file d'envoi écrit sur la ligne qui renonce (relue par [fromReason]) : le code y reste
     * lisible tel quel (`contains`), l'heure et le plafond suivent quand la passerelle les a servis.
     */
    val reason: String
        get() = listOfNotNull(
            "Refused: HTTP 429",
            if (gesture == Gesture.COMMENT) COMMENT_CODE else REACTION_CODE,
            resetAtEpochMillis?.let { "resetAt=$it" },
            limit?.let { "limit=$it" },
        ).joinToString(" ")

    companion object {
        const val COMMENT_CODE = "DAILY_COMMENT_LIMIT"
        const val REACTION_CODE = "DAILY_REACTION_LIMIT"

        /** La limite portée par une raison d'échec de la file, `null` quand elle dit autre chose. */
        fun fromReason(reason: String?): DailyGestureLimit? {
            val tokens = reason?.trim()?.split(' ') ?: return null
            val code = tokens.firstOrNull { isDailyLimitCode(it) } ?: return null
            val numbers = tokens.mapNotNull { token ->
                token.split('=', limit = 2).takeIf { it.size == 2 }?.let { (key, value) -> value.toLongOrNull()?.let { key to it } }
            }.toMap()
            return from(code, null, numbers["limit"]?.toInt())?.copy(resetAtEpochMillis = numbers["resetAt"])
        }

        fun isDailyLimitCode(code: String?): Boolean = code == COMMENT_CODE || code == REACTION_CODE

        /** `2026-10-07T22:00:00.000Z` (avec ou sans millisecondes) ; illisible ou vide = `null`. */
        fun parseInstant(iso: String?): Long? =
            iso?.takeIf { it.isNotBlank() }?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

        /**
         * Le refus porté par l'accusé d'un événement socket (`{ success:false, code, resetAt, limit }`), `null` pour tout
         * autre accusé. [limit] peut arriver en entier ou en décimal.
         */
        fun fromAck(response: Map<String, Any?>): DailyGestureLimit? =
            from(response["code"] as? String, response["resetAt"] as? String, (response["limit"] as? Number)?.toInt())

        /** `null` quand [code] n'est pas une limite du jour ; [resetAtIso] illisible = limite sans heure. */
        fun from(code: String?, resetAtIso: String?, limit: Int? = null): DailyGestureLimit? {
            val gesture = when (code) {
                COMMENT_CODE -> Gesture.COMMENT
                REACTION_CODE -> Gesture.REACTION
                else -> return null
            }
            return DailyGestureLimit(gesture, parseInstant(resetAtIso), limit)
        }
    }
}
