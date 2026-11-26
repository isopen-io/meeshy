package me.meeshy.app.game.gestures

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.app.game.gameString
import me.meeshy.app.game.pages.GameActionButton
import me.meeshy.app.game.pages.GameErrorLine
import me.meeshy.app.game.pages.GameNote
import me.meeshy.app.game.pages.count
import me.meeshy.app.game.pages.dayMonthLabel
import me.meeshy.app.game.pages.currentLocale
import me.meeshy.app.game.pages.weekdayLabel
import me.meeshy.sdk.model.game.FlamePauseSection
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameErrorCode
import me.meeshy.sdk.model.game.GameFlamePauseLaw
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LA FLAMME EN VEILLE (#17372, #20511 — iOS `GameFlamePanelView.pauseSection`, #20510 ; web #20509). Une Flamme vivante
 * se met en veille en DEUX gestes : la durée (1 à 7 jours, sept choisis d'avance), puis l'annonce. Tant qu'une veille
 * est servie — ou vient d'être annoncée, en attendant la relecture —, la carte dit jusqu'à quand elle attend, et
 * l'annonce se tait. Le trimestre pris (#20535), l'annonce se tait aussi et la carte dit dès quand la prochaine veille
 * sera possible. Rien sur une Flamme absente ou éteinte.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun FlamePauseGestures(game: GameBlock, gestures: GameGesturesUiState, onPause: (Int) -> Unit) {
    val today = game.missions.dayKey
    when (val section = GameFlamePauseLaw.section(game.flame, game.flame.pause ?: gestures.announcedPause, today)) {
        is FlamePauseSection.Paused -> Text(
            gameString(GameCopyLaws.flamePaused(section, weekdayLabel(section.pause.until, currentLocale()))),
            modifier = Modifier.testTag("game.flame.paused"),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        is FlamePauseSection.Next -> GameNote(
            gameString(GameCopyLaws.flamePauseNext(dayMonthLabel(section.from, currentLocale()))),
            modifier = Modifier.testTag("game.flame.pause.next"),
        )
        FlamePauseSection.Chooser -> {
            var days by rememberSaveable { mutableIntStateOf(GameFlamePauseLaw.MAX_DAYS) }
            GameNote(gameString(GameCopyLaws.flamePauseIntro()))
            val group = gameString(GameText(GameTextKey.FlamePauseDays))
            FlowRow(
                modifier = Modifier.selectableGroup().semantics { contentDescription = group },
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                GameFlamePauseLaw.dayChoices.forEach { choice ->
                    PauseDayChip(choice, chosen = choice == days, label = gameString(GameCopyLaws.days(choice))) { days = choice }
                }
            }
            GameActionButton(
                title = gameString(GameCopyLaws.flamePauseAction(days)),
                onClick = { onPause(days) },
                modifier = Modifier.testTag("game.flame.pause"),
                busy = gestures.pausing,
                enabled = gestures.online,
                tint = MeeshyPalette.Warning,
                ink = MeeshyPalette.Indigo950,
            )
            GameErrorLine(pauseMessage(gestures.failures[GameGesture.Pause]))
        }
        FlamePauseSection.Hidden -> Unit
    }
}

/** Une durée : une cible de 48 dp, dite « 3 jours » au lecteur d'écran, sélectionnée ou non. */
@Composable
private fun PauseDayChip(choice: Int, chosen: Boolean, label: String, onChoose: () -> Unit) {
    Box(
        modifier = Modifier
            .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
            .clip(CircleShape)
            .background(if (chosen) MeeshyPalette.Warning else Color.Transparent)
            .selectable(selected = chosen, role = Role.RadioButton, onClick = onChoose)
            .semantics { contentDescription = label }
            .testTag("game.flame.pause.days.$choice"),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            count(choice),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = if (chosen) MeeshyPalette.Indigo950 else MeeshyTheme.tokens.textPrimary,
        )
    }
}

/** Une veille refusée dit sa raison (le trimestre pris, une veille en cours, pas de Flamme) ; tout autre échec, le sien. */
@Composable
private fun pauseMessage(failure: GameGestureFailure?): String? {
    failure ?: return null
    val refusal = if (!failure.offline && GameErrorCode.fromWire(failure.code) == GameErrorCode.FlamePauseNotAllowed) {
        GameCopyLaws.flamePauseRefusal(failure.reason)
    } else {
        null
    }
    return refusal?.let { gameString(it) } ?: gestureMessage(failure)
}
