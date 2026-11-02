package me.meeshy.sdk.model.feedback

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** Le refus `DAILY_COMMENT_LIMIT` / `DAILY_REACTION_LIMIT` de la passerelle : miroir de `DailyGestureLimit` (iOS). */
data class DailyGestureLimit(val gesture: Gesture, val resetAtEpochMillis: Long?) {

    enum class Gesture { COMMENT, REACTION }

    /** L'heure de remise à zéro, courte, dans le fuseau et la langue de l'appareil ; `null` si la passerelle ne la dit pas. */
    fun resetTimeLabel(zone: ZoneId = ZoneId.systemDefault(), locale: Locale = Locale.getDefault()): String? =
        resetAtEpochMillis?.let {
            DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).withZone(zone).format(Instant.ofEpochMilli(it))
        }

    companion object {
        const val COMMENT_CODE = "DAILY_COMMENT_LIMIT"
        const val REACTION_CODE = "DAILY_REACTION_LIMIT"

        /** `null` quand [code] n'est pas une limite du jour ; [resetAtIso] illisible = limite sans heure. */
        fun from(code: String?, resetAtIso: String?): DailyGestureLimit? {
            val gesture = when (code) {
                COMMENT_CODE -> Gesture.COMMENT
                REACTION_CODE -> Gesture.REACTION
                else -> return null
            }
            val resetAt = resetAtIso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
            return DailyGestureLimit(gesture, resetAt)
        }
    }
}
