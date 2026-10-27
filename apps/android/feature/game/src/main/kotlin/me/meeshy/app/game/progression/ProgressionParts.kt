package me.meeshy.app.game.progression

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.app.game.gameString
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameNumberFormat
import me.meeshy.sdk.model.game.engagement.EngagementMeeshProgress
import me.meeshy.sdk.model.game.progression.ProgressionConceptModel
import me.meeshy.sdk.model.game.progression.ProgressionNotice
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.game.RankBlason
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LE GROUPE DE L'EN-TÊTE DE LA PREMIÈRE PAGE — à droite du titre, UN seul groupe : le blason de rang et le nombre
 * de Meeshes avec sa pièce. Le blason ouvre la fiche du Rang ; le compteur ouvre la fiche des Meeshes, seul site
 * de la frappe. Rien si la passerelle ne sert pas la donnée : pas de blason sans bloc `game`, pas de compteur sans
 * solde.
 */
@Composable
internal fun RowScope.ProgressionHeaderStanding(
    standing: ProgressionStanding,
    onOpenRank: () -> Unit,
    onOpenMeesh: () -> Unit,
) {
    standing.glory?.let { glory ->
        val label = gameString(ProgressionConceptModel.rankLabel(glory))
        RankBlason(
            rank = glory.rank,
            division5 = glory.shownDivision,
            mythic = glory.mythicSeat,
            figures = null,
            modifier = Modifier
                .height(BLASON_SIDE)
                .clickable(onClickLabel = label, role = Role.Button, onClick = onOpenRank)
                .semantics { contentDescription = label },
        )
    }
    standing.meesh?.let { MeeshEntry(it, onOpenMeesh) }
}

@Composable
private fun MeeshEntry(meesh: EngagementMeeshProgress, onOpen: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    val locale = LocalConfiguration.current.locales[0]
    val held = remember(meesh.balance, locale) { GameNumberFormat.formatCount(meesh.balance, locale) }
    val description = gameString(GameCopyLaws.meeshes(meesh.balance))
    Row(
        Modifier
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .clickable(onClickLabel = description, role = Role.Button) {
                haptics.light()
                onOpen()
            }
            .padding(horizontal = MeeshySpacing.sm)
            .semantics(mergeDescendants = true) { contentDescription = description },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(MeeshyIcons.MonetizationOn, contentDescription = null, tint = MeeshyPalette.Warning, modifier = Modifier.size(20.dp))
        Text(held, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MeeshyTheme.tokens.textPrimary)
    }
}

/** Les avis de l'écran : l'état vide, la coupure, l'échec — chacun DIT quoi faire, aucun ne bloque ce qui est peint. */
@Composable
internal fun ProgressionNoticeView(notice: ProgressionNotice, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val (icon, tint, text) = when (notice) {
        ProgressionNotice.Empty -> Triple(MeeshyIcons.Sparkles, MeeshyPalette.Indigo500, stringResource(R.string.game_progression_empty))
        is ProgressionNotice.Offline -> Triple(
            MeeshyIcons.WifiOff,
            MeeshyPalette.Warning,
            stringResource(if (notice.hasSnapshot) R.string.game_progression_offline else R.string.game_progression_offline_empty),
        )
        ProgressionNotice.Error -> Triple(MeeshyIcons.WarningFilled, MeeshyPalette.Error, stringResource(R.string.game_progression_load_error))
    }
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(tint.copy(alpha = NOTICE_ALPHA))
            .padding(MeeshySpacing.md)
            .semantics(mergeDescendants = true) { },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(24.dp))
        Text(text, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = tokens.textPrimary)
        if (notice == ProgressionNotice.Error) {
            TextButton(onClick = onRetry) { Text(stringResource(R.string.game_progression_retry), color = tint) }
        }
    }
}

/**
 * Le squelette de démarrage à froid — la FORME de l'écran (deux pastilles, trois cartes), jamais un spinner. Un seul
 * souffle d'opacité pour tout le bloc, lu en couche de dessin : aucune recomposition par image.
 */
@Composable
internal fun ProgressionSkeleton(modifier: Modifier = Modifier) {
    val reduce = LocalReduceMotion.current
    val label = stringResource(R.string.game_progression_loading)
    val pulse by rememberInfiniteTransition(label = "progressionSkeleton").animateFloat(
        initialValue = 1f,
        targetValue = if (reduce) 1f else SKELETON_LOW,
        animationSpec = infiniteRepeatable(tween(SKELETON_MILLIS), RepeatMode.Reverse),
        label = "progressionSkeletonPulse",
    )
    Column(
        modifier
            .fillMaxWidth()
            .graphicsLayer { alpha = pulse }
            .semantics(mergeDescendants = true) { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        repeat(SKELETON_CARDS) {
            MeeshySkeletonBox(Modifier.fillMaxWidth().height(SKELETON_CARD_HEIGHT), RoundedCornerShape(MeeshyRadius.md))
        }
    }
}

private val BLASON_SIDE = 30.dp
private val SKELETON_CARD_HEIGHT = 76.dp
private const val SKELETON_CARDS = 6
private const val SKELETON_LOW = 0.45f
private const val SKELETON_MILLIS = 900
private const val NOTICE_ALPHA = 0.10f
