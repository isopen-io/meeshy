package me.meeshy.ui.component.focal

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/** Ce que la bulle d'appel du fil demande au journal d'après l'appel : lequel, daté depuis quand, à quelle teinte. */
public data class CallJournalRequest(
    val callId: String,
    /** Heure du message d'appel : repli de la date de début quand le serveur ne la sert pas. */
    val startedAtIso: String,
    val accent: Color,
)

/** Le journal d'après l'appel, dessiné sous la bulle par `:feature:calls` (sans que `:sdk-ui` en dépende). */
public typealias CallJournalSlot = @Composable (CallJournalRequest) -> Unit

/** Sans hôte (aperçus, tests) : la bulle n'offre aucune bascule, elle ne montre pas de porte morte. */
public val LocalCallJournal: ProvidableCompositionLocal<CallJournalSlot?> = staticCompositionLocalOf { null }
