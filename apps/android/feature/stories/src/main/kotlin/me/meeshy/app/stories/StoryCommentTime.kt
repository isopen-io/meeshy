package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import java.time.ZoneId
import java.util.Locale

/** L'âge d'un commentaire, court et discret (« 5 min », « 2 h ») ; vide quand l'instant est illisible. */
@Composable
internal fun storyCommentRelativeTime(iso: String): String {
    val strings = rememberRelativeTimeStrings()
    val millis = isoToEpochMillisOrNull(iso) ?: return ""
    return RelativeTimeFormat.short(
        epochMillis = millis,
        referenceMillis = System.currentTimeMillis(),
        zone = ZoneId.systemDefault(),
        locale = Locale.getDefault(),
        strings = strings,
    )
}
