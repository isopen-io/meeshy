package me.meeshy.app.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.game.GameActAdvance
import me.meeshy.sdk.model.game.MissionDifficulty
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La pastille « Acte II · 3 sur 5 » (#17367, tranche Android #19717), posée sous la bande de l'en-tête de la
 * conversation — miroir d'iOS `ConversationActAdvancePill` et du web `ActAdvancePill`. Capsule de verre neutre, jamais
 * sur la zone de saisie ni à la couleur d'accent, sans toucher. TalkBack la lit une fois à son arrivée (région vivante
 * polie : le focus reste sur la saisie). Réduire les animations : un fondu court, sans échelle.
 */
@Composable
internal fun ChatActAdvancePill(advance: GameActAdvance?, modifier: Modifier = Modifier) {
    // Le dernier acte montré reste peint pendant le fondu de sortie.
    val held = remember { HeldAct() }
    if (advance != null) held.value = advance
    val reduced = LocalReduceMotion.current
    val enter = if (reduced) fadeIn(tween(150)) else fadeIn(tween(250)) + scaleIn(tween(250), initialScale = 0.9f)
    val exit = if (reduced) fadeOut(tween(150)) else fadeOut(tween(250)) + scaleOut(tween(250), targetScale = 0.9f)
    AnimatedVisibility(visible = advance != null, modifier = modifier, enter = enter, exit = exit) {
        held.value?.let { shown ->
            val shape = RoundedCornerShape(percent = 50)
            Text(
                text = actAdvanceLabel(shown),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier
                    .testTag("chat.act.advance")
                    .semantics { liveRegion = LiveRegionMode.Polite }
                    .background(MeeshyTheme.tokens.backgroundSecondary.copy(alpha = 0.92f), shape)
                    .border(0.5.dp, MeeshyTheme.tokens.textPrimary.copy(alpha = 0.12f), shape)
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs + 2.dp),
            )
        }
    }
}

@Composable
internal fun actAdvanceLabel(advance: GameActAdvance): String =
    stringResource(R.string.chat_act_advance, stringResource(advance.difficulty.actName()), advance.progress, advance.target)

private fun MissionDifficulty.actName(): Int = when (this) {
    MissionDifficulty.Easy -> R.string.chat_act_advance_easy
    MissionDifficulty.Medium -> R.string.chat_act_advance_medium
    MissionDifficulty.Hard -> R.string.chat_act_advance_hard
    MissionDifficulty.Gold -> R.string.chat_act_advance_gold
}

/** Le dernier acte montré, gardé hors de l'état : le relire pendant le fondu ne recompose rien. */
private class HeldAct(var value: GameActAdvance? = null)
