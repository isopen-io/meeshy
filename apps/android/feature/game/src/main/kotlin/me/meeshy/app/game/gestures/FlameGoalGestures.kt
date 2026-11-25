package me.meeshy.app.game.gestures

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.app.game.gameString
import me.meeshy.app.game.pages.GameErrorLine
import me.meeshy.app.game.pages.GameNote
import me.meeshy.sdk.model.game.FlameGoalSection
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameErrorCode
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * L'OBJECTIF DE FLAMME (#17379, #20523 — iOS `GameFlamePanelView.goalSection`, #20522 ; web #20521). Au premier jour
 * d'une Flamme, la carte propose 7, 14 ou 30 jours, et la puce ENVOIE d'un seul toucher : ne rien choisir ne coûte
 * rien. En cours, elle dit ce qu'il reste ; atteint, le signe des aïeux, la marche suivante et « Plus tard ». Raté, rien
 * ne se dit : la passerelle cesse de le servir.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun FlameGoalGestures(
    game: GameBlock,
    gestures: GameGesturesUiState,
    onChoose: (Int) -> Unit,
    onCloseSign: (Int) -> Unit,
) {
    when (val section = gestures.flameGoal.section(game.flame.goal, game.guideSeen)) {
        is FlameGoalSection.Choose -> {
            GameNote(gameString(GameText(GameTextKey.FlameGoalIntro)))
            val group = gameString(GameText(GameTextKey.FlameGoalChoices))
            FlowRow(
                modifier = Modifier.semantics { contentDescription = group },
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                section.offer.forEach { target ->
                    GoalChoice(target, gameString(GameCopyLaws.days(target)), gestures, onChoose)
                }
            }
        }
        is FlameGoalSection.Running -> Text(
            gameString(GameCopyLaws.flameGoalRunning(section.target, section.remaining)),
            modifier = Modifier.testTag("game.flame.goal.running"),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        is FlameGoalSection.Reached -> Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Text(
                gameString(GameCopyLaws.flameGoalReached(section.target)),
                modifier = Modifier
                    .testTag("game.flame.goal.sign")
                    .semantics { liveRegion = LiveRegionMode.Polite },
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Bold,
                color = MeeshyPalette.Indigo500,
            )
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                section.next?.let { next -> GoalChoice(next, gameString(GameCopyLaws.flameGoalNext(next)), gestures, onChoose) }
                TextButton(
                    onClick = { onCloseSign(section.target) },
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp).testTag("game.flame.goal.later"),
                ) {
                    Text(
                        gameString(GameText(GameTextKey.FlameGoalLater)),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyTheme.tokens.textPrimary,
                    )
                }
            }
        }
        null -> Unit
    }
    GameErrorLine(goalMessage(gestures.failures[GameGesture.Goal]))
}

/** Un objectif se choisit d'un seul toucher : la puce envoie, il n'y a pas de bouton de confirmation. */
@Composable
private fun GoalChoice(target: Int, title: String, gestures: GameGesturesUiState, onChoose: (Int) -> Unit) {
    val usable = gestures.online && !gestures.choosingGoal
    Box(
        modifier = Modifier
            .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
            .clip(CircleShape)
            .background(MeeshyPalette.Warning.copy(alpha = if (usable) 1f else DISABLED_ALPHA))
            .clickable(enabled = usable, role = Role.Button) { onChoose(target) }
            .padding(horizontal = MeeshySpacing.md)
            .testTag("game.flame.goal.$target"),
        contentAlignment = Alignment.Center,
    ) {
        Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = MeeshyPalette.Indigo950)
    }
}

private const val DISABLED_ALPHA = 0.6f

/** Un objectif refusé dit sa raison (il ne se propose pas aujourd'hui, pas de Flamme) ; tout autre échec, le sien. */
@Composable
private fun goalMessage(failure: GameGestureFailure?): String? {
    failure ?: return null
    val refusal = if (!failure.offline && GameErrorCode.fromWire(failure.code) == GameErrorCode.FlameGoalNotAllowed) {
        GameCopyLaws.flameGoalRefusal(failure.reason)
    } else {
        null
    }
    return refusal?.let { gameString(it) } ?: gestureMessage(failure)
}
