package me.meeshy.app.widget.kit

import android.content.Context
import android.text.format.DateUtils

/** Heure relative d'une rangée de widget (`Text(date, style: .relative)` côté iOS). */
internal object WidgetRelativeTime {
    sealed interface Bucket {
        data object Now : Bucket
        data class Minutes(val value: Int) : Bucket
        data class Hours(val value: Int) : Bucket
        data class Days(val value: Int) : Bucket
    }

    private const val MINUTE = 60_000L
    private const val HOUR = 60 * MINUTE
    private const val DAY = 24 * HOUR

    fun bucket(nowMillis: Long, thenMillis: Long): Bucket {
        val elapsed = nowMillis - thenMillis
        return when {
            elapsed < MINUTE -> Bucket.Now
            elapsed < HOUR -> Bucket.Minutes((elapsed / MINUTE).toInt())
            elapsed < DAY -> Bucket.Hours((elapsed / HOUR).toInt())
            else -> Bucket.Days((elapsed / DAY).toInt())
        }
    }

    /** Libellé localisé par le système (langue de l'appareil), abrégé. */
    fun format(context: Context, thenMillis: Long, nowMillis: Long = System.currentTimeMillis()): String =
        DateUtils.getRelativeTimeSpanString(
            thenMillis.coerceAtMost(nowMillis),
            nowMillis,
            DateUtils.MINUTE_IN_MILLIS,
            DateUtils.FORMAT_ABBREV_RELATIVE,
        ).toString()
}
