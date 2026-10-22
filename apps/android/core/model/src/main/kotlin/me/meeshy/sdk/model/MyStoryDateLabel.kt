package me.meeshy.sdk.model

import java.time.Instant
import java.time.ZoneId

/**
 * Date sous une carte de « Mes stories » (port de `MyStoryCardPresentation.dateLabel`) :
 * relative tant que la publication a moins d'un mois CALENDAIRE (pas trente jours), la date
 * moyenne au-delà. L'horloge est injectée. Le formateur de relatif de la plateforme produit
 * DÉJÀ « il y a … » : aucun préfixe n'est ajouté ici, jamais de « il y a il y a ».
 */
sealed interface MyStoryDateLabel {

    enum class Unit { SECONDS, MINUTES, HOURS, DAYS, WEEKS }

    /** « il y a [amount] [unit] » à rendre par le formateur relatif localisé. */
    data class Relative(val amount: Long, val unit: Unit) : MyStoryDateLabel

    /** Date moyenne localisée (`DateFormat.MEDIUM`) de [epochMillis]. */
    data class Medium(val epochMillis: Long) : MyStoryDateLabel

    companion object {
        private const val MINUTE = 60L
        private const val HOUR = 3_600L
        private const val DAY = 86_400L
        private const val WEEK = 7 * DAY

        fun resolve(
            dateEpochMillis: Long,
            nowEpochMillis: Long,
            zone: ZoneId = ZoneId.systemDefault(),
        ): MyStoryDateLabel {
            val threshold = Instant.ofEpochMilli(nowEpochMillis).atZone(zone).minusMonths(1).toInstant().toEpochMilli()
            if (dateEpochMillis <= threshold) return Medium(dateEpochMillis)
            val seconds = ((nowEpochMillis - dateEpochMillis) / 1000L).coerceAtLeast(0L)
            return when {
                seconds < MINUTE -> Relative(seconds, Unit.SECONDS)
                seconds < HOUR -> Relative(seconds / MINUTE, Unit.MINUTES)
                seconds < DAY -> Relative(seconds / HOUR, Unit.HOURS)
                seconds < WEEK -> Relative(seconds / DAY, Unit.DAYS)
                else -> Relative(seconds / WEEK, Unit.WEEKS)
            }
        }
    }
}
