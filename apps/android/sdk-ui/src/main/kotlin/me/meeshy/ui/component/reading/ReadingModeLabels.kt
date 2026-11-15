package me.meeshy.ui.component.reading

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import me.meeshy.sdk.model.reading.mode.LensUnavailableReason
import me.meeshy.sdk.model.reading.mode.ReadingModeChoice
import me.meeshy.sdk.model.reading.mode.ReadingModeMenuEntry
import me.meeshy.ui.R

/** Le nom d'un mode — source UNIQUE des trois portes (puce, menu d'appui long, feuille, sous-menu de la liste). */
@Composable
public fun readingModeTitle(mode: ConversationReadingMode): String = stringResource(
    when (mode) {
        ConversationReadingMode.FOCAL -> R.string.reading_mode_focal_title
        ConversationReadingMode.SCRIPT -> R.string.reading_mode_script_title
        ConversationReadingMode.SUMMARY -> R.string.reading_mode_summary_title
        ConversationReadingMode.RIVER -> R.string.reading_mode_river_title
        ConversationReadingMode.BUBBLES -> R.string.reading_mode_bubbles_title
    },
)

@Composable
public fun readingModeChoiceTitle(choice: ReadingModeChoice): String = when (choice) {
    ReadingModeChoice.Auto -> stringResource(R.string.reading_mode_menu_auto)
    is ReadingModeChoice.Mode -> readingModeTitle(choice.mode)
}

/** La raison VIVANTE d'une entrée grisée, ou `null` si l'entrée est disponible. */
@Composable
public fun readingModeReasonText(reason: LensUnavailableReason?): String? = when (reason) {
    null -> null
    LensUnavailableReason.RiverNever -> stringResource(R.string.reading_mode_river_never)
    is LensUnavailableReason.RiverThresholdOnly ->
        stringResource(R.string.reading_mode_river_threshold_only, reason.threshold)
    is LensUnavailableReason.RiverBelowThreshold ->
        stringResource(R.string.reading_mode_river_unavailable_reason, reason.threshold, reason.current)
    LensUnavailableReason.Generic -> stringResource(R.string.reading_mode_unavailable_generic)
    LensUnavailableReason.NotYetRendered -> stringResource(R.string.reading_mode_not_yet_rendered)
}

/** Le sous-titre d'une entrée : sa description, ou la VRAIE raison quand elle est grisée. Le mode usuel (Bulles) n'en a pas. */
@Composable
public fun readingModeSubtitle(entry: ReadingModeMenuEntry): String? =
    readingModeReasonText(entry.reason) ?: when (val choice = entry.choice) {
        ReadingModeChoice.Auto -> null
        is ReadingModeChoice.Mode -> when (choice.mode) {
            ConversationReadingMode.FOCAL -> stringResource(R.string.reading_mode_focal_subtitle)
            ConversationReadingMode.SCRIPT -> stringResource(R.string.reading_mode_script_subtitle)
            ConversationReadingMode.SUMMARY -> stringResource(R.string.reading_mode_summary_subtitle)
            ConversationReadingMode.RIVER -> stringResource(R.string.reading_mode_river_subtitle)
            ConversationReadingMode.BUBBLES -> null
        }
    }

/** « <mode>, <raison>, sélectionné » — l'annonce d'une entrée, sans que la couleur porte l'état. */
@Composable
public fun readingModeEntryAnnouncement(entry: ReadingModeMenuEntry): String {
    val selected = stringResource(R.string.lentille_mode_menu_selected)
    val title = readingModeChoiceTitle(entry.choice)
    val reason = readingModeReasonText(entry.reason)
    return listOfNotNull(title, reason, selected.takeIf { entry.isSelected }).joinToString(", ")
}
