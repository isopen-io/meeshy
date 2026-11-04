package me.meeshy.app.game

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.app.game.progression.AtlasStampGeometry
import me.meeshy.app.game.progression.ProgressionConceptEmblem
import me.meeshy.app.game.progression.toUi
import me.meeshy.sdk.model.game.FlameFormKey
import me.meeshy.sdk.model.game.element.GameElementEmblem
import me.meeshy.sdk.model.game.element.GameElementMedalShape
import me.meeshy.sdk.model.game.element.GameElementSymbol
import me.meeshy.ui.component.game.AtlasStampState
import me.meeshy.ui.component.game.AtlasStampView
import me.meeshy.ui.component.game.GameBadgeShape
import me.meeshy.ui.component.game.GameBadgeState
import me.meeshy.ui.component.game.GameBadgeView
import me.meeshy.ui.component.game.GameMedalFamily
import me.meeshy.ui.component.game.GameMedalGlyph
import me.meeshy.ui.component.game.GameMedalState
import me.meeshy.ui.component.game.GameMedalView
import me.meeshy.ui.component.game.LeagueGemView
import me.meeshy.ui.component.game.TrophyView
import me.meeshy.ui.component.game.ChestView
import me.meeshy.ui.component.game.FlameView
import me.meeshy.ui.component.game.LevelRing
import me.meeshy.ui.component.game.MeeshCoin
import me.meeshy.ui.component.game.RankBlason
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/** L'emblème d'un élément, dessiné par les briques du jeu. DÉCORATIF : le nom voisin dit tout. */
@Composable
internal fun GameElementEmblemView(emblem: GameElementEmblem, modifier: Modifier = Modifier, size: Dp = EMBLEM_SIZE) {
    val tokens = MeeshyTheme.tokens
    Box(modifier.size(size).clearAndSetSemantics {}, contentAlignment = Alignment.Center) {
        val fill = Modifier.size(size)
        when (emblem) {
            is GameElementEmblem.Concept -> ProgressionConceptEmblem(emblem.concept, game = null, modifier = fill, size = size)
            is GameElementEmblem.Tier -> LevelRing(
                level = emblem.level,
                progress = emblem.progress.toFloat(),
                tier = emblem.tier,
                modifier = fill,
                trackColor = tokens.textMuted.copy(alpha = RING_TRACK_ALPHA),
                inkColor = tokens.textPrimary,
                discColor = tokens.backgroundPrimary,
            )
            is GameElementEmblem.Rank -> RankBlason(rank = emblem.rank, division5 = emblem.division5, mythic = emblem.mythic, modifier = fill)
            is GameElementEmblem.Coin -> MeeshCoin(modifier = fill, edition = emblem.edition)
            is GameElementEmblem.Flame -> FlameView(
                form = emblem.form ?: FlameFormKey.Braise,
                modifier = fill.alpha(if (emblem.form == null) OUT_FLAME_ALPHA else 1f),
                lit = emblem.form != null,
                flickers = false,
            )
            is GameElementEmblem.Chest -> ChestView(openProgress = if (emblem.open) 1f else 0f, modifier = fill)
            is GameElementEmblem.Badge -> GameMedalView(
                family = GameMedalFamily.of(emblem.axis.family),
                glyph = GameMedalGlyph.of(emblem.axis),
                material = emblem.material.toUi(),
                state = if (emblem.lit) GameMedalState.Lit else GameMedalState.Imprint,
                progress = emblem.progress,
                surface = tokens.backgroundPrimary,
                muted = tokens.textMuted,
                modifier = fill,
            )
            is GameElementEmblem.Medal -> GameBadgeView(
                material = emblem.material.toUi(),
                shape = when (val shape = emblem.shape) {
                    is GameElementMedalShape.Collection -> GameBadgeShape.Collection(shape.filled, shape.total)
                    GameElementMedalShape.Record -> GameBadgeShape.Record
                },
                state = if (emblem.lit) GameBadgeState.Lit else GameBadgeState.Imprint,
                surface = tokens.backgroundPrimary,
                muted = tokens.textMuted,
                modifier = fill,
            )
            is GameElementEmblem.Trophy -> TrophyView(material = emblem.material.toUi(), label = "", modifier = fill)
            is GameElementEmblem.Stamp -> AtlasStampView(
                code = AtlasStampGeometry.label(emblem.code),
                tint = MeeshyPalette.Indigo500,
                muted = tokens.textMuted,
                state = if (emblem.stamped) AtlasStampState.Stamped else AtlasStampState.Pending,
                modifier = fill,
            )
            is GameElementEmblem.League -> LeagueGemView(league = emblem.league, modifier = fill)
            is GameElementEmblem.Symbol -> Icon(
                imageVector = when (emblem.symbol) {
                    GameElementSymbol.Target -> MeeshyIcons.CheckCircle
                    GameElementSymbol.Snowflake -> MeeshyIcons.Sparkles
                    GameElementSymbol.Seal -> MeeshyIcons.VerifiedFilled
                },
                contentDescription = null,
                tint = MeeshyPalette.Indigo500,
                modifier = Modifier.size(size * SYMBOL_FRACTION),
            )
        }
    }
}

internal val EMBLEM_SIZE = 112.dp
private const val RING_TRACK_ALPHA = 0.22f
private const val OUT_FLAME_ALPHA = 0.45f
private const val SYMBOL_FRACTION = 0.6f
