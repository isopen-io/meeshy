package me.meeshy.app.notifications

import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import java.time.ZoneId
import java.util.Locale
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.RelativeTimeStrings

/**
 * Resolves the single instant a notification row shows as a relative timestamp —
 * the Android parity of iOS `NotificationRowView`'s trailing
 * `RelativeTimeFormatter.shortString(for: notification.createdAt)`.
 *
 * A notification's "arrival" instant is its [NotificationState.createdAt]; the
 * [isoToEpochMillisOrNull] SSOT parses it (whole- or fractional-second ISO-8601),
 * so a blank or malformed value yields `null` — the row then shows no timestamp
 * rather than a raw/garbled string — while a legitimate unix-epoch instant (0L) is
 * kept, not mistaken for "absent".
 */
public object NotificationRowTime {

    public fun epochMillis(notification: ApiNotification): Long? =
        isoToEpochMillisOrNull(notification.state.createdAt)

    /** L'heure courte relative (« 5 min », « 2 h ») d'un instant, à l'horloge de l'appareil. */
    public fun short(epochMillis: Long, strings: RelativeTimeStrings, referenceMillis: Long = System.currentTimeMillis()): String =
        RelativeTimeFormat.short(
            epochMillis = epochMillis,
            referenceMillis = referenceMillis,
            zone = ZoneId.systemDefault(),
            locale = Locale.getDefault(),
            strings = strings,
        )
}
