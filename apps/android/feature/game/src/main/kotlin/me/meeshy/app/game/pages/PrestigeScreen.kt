package me.meeshy.app.game.pages

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.game.gestures.GameGesture
import me.meeshy.app.game.gestures.GameGesturesUiState
import me.meeshy.app.game.gestures.GameGesturesViewModel
import me.meeshy.app.game.gestures.gestureMessage
import me.meeshy.sdk.model.game.GameHapticPattern
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.game.rememberGameHaptics
import me.meeshy.ui.theme.MeeshyRadius
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GamePrestigeBlock
import me.meeshy.ui.component.game.GameMaterial
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LA PAGE « RENAISSANCE » (iOS `GamePrestigePage`) — où j'en suis : les étoiles posées, ce qu'il reste à franchir, et ce
 * que le passage changera. La règle (niveau 100, cinq renaissances au plus) est celle que la passerelle sert.
 *
 * **Renaître** remet le niveau à 1 et les étincelles à 0 : jamais sans confirmation, qui dit ce qui repart, ce qui reste
 * et les portes qui se referment. Le passage est décidé et appliqué par la passerelle (une intention, un identifiant
 * d'idempotence) ; le niveau et les étincelles affichés ensuite sont ceux qu'elle sert, jamais un calcul d'ici.
 */
@Composable
fun PrestigeScreen(onBack: () -> Unit, gestures: GameGesturesViewModel = hiltViewModel()) {
    val state by gestures.state.collectAsStateWithLifecycle()
    GamePageHost(title = stringResource(R.string.game2_prestige_title), onBack = onBack) { game ->
        PrestigeContent(game, state, onPass = gestures::passPrestige)
    }
}

@Composable
private fun PrestigeContent(game: GameBlock, gestures: GameGesturesUiState, onPass: () -> Unit) {
    val prestige = game.prestige
    if (prestige == null) {
        GameCard { GameNote(stringResource(R.string.game2_unavailable)) }
        return
    }
    PrestigeSummary(prestige, level = game.level.shown.level, passed = gestures.prestigePassed)
    if (prestige.canPrestige && prestige.stars < prestige.max) {
        var confirming by rememberSaveable { mutableStateOf(false) }
        GameCard(title = stringResource(R.string.game2_door_prestige)) {
            GameNote(stringResource(R.string.game2_prestige_mee), tone = MeeshyTheme.tokens.textPrimary)
            GameNote(stringResource(R.string.game2_prestige_meo, count(prestige.gloryOnPass)))
            if (confirming) {
                PrestigeConfirmation(
                    next = prestige.stars + 1,
                    busy = gestures.passingPrestige,
                    online = gestures.online,
                    onConfirm = {
                        confirming = false
                        onPass()
                    },
                    onStay = { confirming = false },
                )
            } else {
                GameActionButton(
                    title = stringResource(R.string.game2_prestige_go),
                    onClick = { confirming = true },
                    busy = gestures.passingPrestige,
                    enabled = gestures.online,
                )
                GameNote(stringResource(R.string.game2_prestige_confirm_keeps))
            }
            GameErrorLine(gestureMessage(gestures.failures[GameGesture.Prestige]))
            GameOfflineNote(online = gestures.online)
        }
    }
}

/**
 * La CONFIRMATION : ce qui repart, ce qui reste, la porte de la joute et de l'alliance, et le consentement qui reste —
 * dit AVANT le geste, jamais découvert après. Aucun passage sans elle. Les valeurs « avant → après » que dit iOS ne sont
 * pas calculées ici : un solde se lit sur la passerelle, pas sur une loi rejouée par le client.
 */
@Composable
private fun PrestigeConfirmation(next: Int, busy: Boolean, online: Boolean, onConfirm: () -> Unit, onStay: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(tokens.textMuted.copy(alpha = CONFIRM_ALPHA))
            .padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            stringResource(R.string.game2_prestige_confirm_title, count(next)),
            Modifier.semantics { heading() },
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Bold,
            color = tokens.textPrimary,
        )
        listOf(
            R.string.game2_prestige_confirm_resets,
            R.string.game2_prestige_confirm_keeps,
            R.string.game2_prestige_confirm_access,
            R.string.game2_prestige_confirm_consent,
        ).forEach { GameNote(stringResource(it)) }
        GameActionButton(title = stringResource(R.string.game2_prestige_go), onClick = onConfirm, busy = busy, enabled = online)
        GameQuietButton(title = stringResource(R.string.game2_prestige_stay), onClick = onStay)
    }
}

@Composable
private fun PrestigeSummary(prestige: GamePrestigeBlock, level: Int, passed: Int?) {
    val haptics = rememberGameHaptics()
    val reduce = LocalReduceMotion.current
    val pulse = remember { Animatable(1f) }
    LaunchedEffect(passed) {
        if (passed == null) return@LaunchedEffect
        haptics.play(GameHapticPattern.levelGain)
        if (reduce) return@LaunchedEffect
        pulse.snapTo(PULSE_FROM)
        pulse.animateTo(1f, spring(dampingRatio = PULSE_DAMPING, stiffness = PULSE_STIFFNESS))
    }
    val line = stringResource(R.string.game2_prestige_stars, count(prestige.stars), count(prestige.max))
    GameCard(title = stringResource(R.string.game2_prestige_title), tint = MeeshyPalette.Indigo500) {
        Row(
            Modifier.fillMaxWidth().clearAndSetSemantics { },
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm, Alignment.CenterHorizontally),
        ) {
            repeat(prestige.max) { index ->
                Text(
                    "★",
                    style = MaterialTheme.typography.headlineMedium,
                    color = if (index < prestige.stars) GameMaterial.GOLD.lineColor else MeeshyTheme.tokens.textMuted.copy(alpha = STAR_OFF_ALPHA),
                    modifier = Modifier.graphicsLayer {
                        val lit = passed != null && index == prestige.stars - 1
                        scaleX = if (lit) pulse.value else 1f
                        scaleY = if (lit) pulse.value else 1f
                    },
                )
            }
        }
        Text(
            line,
            Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
        )
        if (passed != null) {
            Text(
                stringResource(R.string.game2_prestige_done, count(passed)),
                Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Bold,
                color = MeeshyPalette.Success,
                textAlign = TextAlign.Center,
            )
        }
        when {
            prestige.stars >= prestige.max -> GameNote(stringResource(R.string.game2_prestige_max))
            !prestige.canPrestige && passed == null -> GameNote(stringResource(R.string.game2_prestige_locked, count(level)))
        }
    }
}

private const val STAR_OFF_ALPHA = 0.35f
private const val CONFIRM_ALPHA = 0.1f
private const val PULSE_FROM = 0.5f
private const val PULSE_DAMPING = 0.45f
private const val PULSE_STIFFNESS = 300f
