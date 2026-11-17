package me.meeshy.ui.component.focal

import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import me.meeshy.sdk.model.reading.focal.FocalCallParticipants
import me.meeshy.ui.R
import java.util.Locale

/**
 * A1.2 — « Awa, Karim, Lina et vous » : l'ordre vient de la loi pure [FocalCallParticipants], la conjonction de la
 * langue de l'appareil (ICU `ListFormatter`, comme iOS `ListFormatter`). Sous l'API 30 l'ICU de la plateforme n'est
 * pas garanti : la liste se joint alors par des virgules plutôt que de risquer un plantage.
 */
internal fun joinParticipantNames(names: List<String>, locale: Locale): String =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        android.icu.text.ListFormatter.getInstance(locale).format(names)
    } else {
        names.joinToString(", ")
    }

/** La ligne des participants de cette carte, calculée une fois par jeu de noms et de langue ; `null` : aucune ligne. */
@Composable
internal fun rememberCallParticipantsLine(participants: FocalCallParticipants.Roster?): String? {
    if (participants == null) return null
    val you = stringResource(R.string.call_card_participants_you)
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    return remember(participants, you, locale) { joinParticipantNames(participants.names(you), locale) }
}
