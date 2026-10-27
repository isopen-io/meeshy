package me.meeshy.app.game.progression

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.ui.component.game.GameBadgeShape
import me.meeshy.ui.component.game.GameBadgeView
import me.meeshy.ui.component.game.LevelRing
import me.meeshy.ui.component.game.RankBlason
import me.meeshy.ui.component.game.GameMaterial
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/** La teinte du concept : celle de sa carte, de sa jauge et de son emblème de repli. */
internal fun ProgressionConcept.tint(): Color = when (this) {
    ProgressionConcept.Level, ProgressionConcept.Glory, ProgressionConcept.League,
    ProgressionConcept.Season, ProgressionConcept.Badges, ProgressionConcept.Atlas,
    -> MeeshyPalette.Indigo500
    ProgressionConcept.Points, ProgressionConcept.Meesh, ProgressionConcept.Flame,
    ProgressionConcept.Missions, ProgressionConcept.Prestige, ProgressionConcept.Showcase,
    -> MeeshyPalette.Warning
    ProgressionConcept.Elans, ProgressionConcept.Defis, ProgressionConcept.Succes -> MeeshyPalette.Success
}

private fun ProgressionConcept.icon(): ImageVector = when (this) {
    ProgressionConcept.Level -> MeeshyIcons.Sparkles
    ProgressionConcept.Points -> MeeshyIcons.SparklesStack
    ProgressionConcept.Meesh -> MeeshyIcons.MonetizationOn
    ProgressionConcept.Glory -> MeeshyIcons.StarFilled
    ProgressionConcept.Flame -> MeeshyIcons.FlameFilled
    ProgressionConcept.Missions -> MeeshyIcons.Gift
    ProgressionConcept.League -> MeeshyIcons.Diamond
    ProgressionConcept.Season, ProgressionConcept.Prestige, ProgressionConcept.Showcase -> MeeshyIcons.Trophy
    ProgressionConcept.Elans -> MeeshyIcons.Bolt
    ProgressionConcept.Atlas -> MeeshyIcons.Public
    ProgressionConcept.Badges, ProgressionConcept.Defis, ProgressionConcept.Succes -> MeeshyIcons.StarFilled
}

/**
 * L'emblème d'un concept, dessiné par les briques du jeu (anneau de palier, blason de rang, badges) et, à défaut,
 * par un pictogramme sur disque teinté — jamais une bulle vide. DÉCORATIF : le nom voisin dit tout, donc aucun
 * libellé d'accessibilité ici.
 */
@Composable
internal fun ProgressionConceptEmblem(
    concept: ProgressionConcept,
    game: GameBlock?,
    modifier: Modifier = Modifier,
    size: Dp = 40.dp,
) {
    val tokens = MeeshyTheme.tokens
    Box(modifier.size(size).clearAndSetSemantics { }, contentAlignment = Alignment.Center) {
        when {
            concept == ProgressionConcept.Level && game != null -> {
                val level = game.level.shown
                LevelRing(
                    level = level.level,
                    progress = level.progress.toFloat(),
                    tier = level.tier,
                    modifier = Modifier.fillMaxSize(),
                    trackColor = tokens.textMuted.copy(alpha = TRACK_ALPHA),
                    inkColor = tokens.textPrimary,
                    discColor = tokens.backgroundPrimary,
                )
            }
            concept == ProgressionConcept.Glory && game != null -> RankBlason(
                rank = game.glory.rank,
                division5 = game.glory.shownDivision,
                modifier = Modifier.height(size),
                level = game.level.shown.level,
                mythic = game.glory.mythicSeat,
                figures = null,
            )
            concept == ProgressionConcept.Badges -> badge(GameMaterial.GOLD, GameBadgeShape.Accumulation)
            concept == ProgressionConcept.Defis -> badge(GameMaterial.SILVER, GameBadgeShape.Record)
            concept == ProgressionConcept.Succes -> badge(GameMaterial.GOLD, GameBadgeShape.Collection(filled = 4, total = 6))
            else -> {
                val tint = concept.tint()
                Box(Modifier.fillMaxSize().clip(CircleShape).background(tint.copy(alpha = DISC_ALPHA)), Alignment.Center) {
                    Icon(concept.icon(), contentDescription = null, tint = tint, modifier = Modifier.size(size * ICON_SHARE))
                }
            }
        }
    }
}

@Composable
private fun badge(material: GameMaterial, shape: GameBadgeShape) {
    val tokens = MeeshyTheme.tokens
    GameBadgeView(material = material, modifier = Modifier.fillMaxSize(), shape = shape, surface = tokens.backgroundPrimary, muted = tokens.textMuted)
}

private const val TRACK_ALPHA = 0.2f
private const val DISC_ALPHA = 0.16f
private const val ICON_SHARE = 0.55f
