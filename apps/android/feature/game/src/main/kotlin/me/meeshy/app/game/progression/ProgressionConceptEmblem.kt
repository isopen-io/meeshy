package me.meeshy.app.game.progression

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.MeeshCoinFace
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.ui.component.game.GameBadgeShape
import me.meeshy.ui.component.game.GameBadgeView
import me.meeshy.ui.component.game.LevelRing
import me.meeshy.ui.component.game.MeeshCoin
import me.meeshy.ui.component.game.RankBlason
import me.meeshy.ui.component.game.GameMaterial
import me.meeshy.ui.component.game.SignatureMark
import me.meeshy.app.game.pages.LeagueGem
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/** La teinte du concept : celle de sa carte et de sa jauge. */
internal fun ProgressionConcept.tint(): Color = when (this) {
    ProgressionConcept.Level, ProgressionConcept.Glory, ProgressionConcept.League,
    ProgressionConcept.Season, ProgressionConcept.Badges, ProgressionConcept.Atlas,
    -> MeeshyPalette.Indigo500
    ProgressionConcept.Points, ProgressionConcept.Meesh, ProgressionConcept.Flame,
    ProgressionConcept.Missions, ProgressionConcept.Prestige, ProgressionConcept.Showcase,
    -> MeeshyPalette.Warning
    ProgressionConcept.Elans, ProgressionConcept.Defis, ProgressionConcept.Succes -> MeeshyPalette.Success
}

/**
 * L'emblème d'un concept, dessiné comme sur iOS (`ProgressionConceptEmblem`) : anneau de palier, blason de rang, marque
 * des Points et des Élans, Flamme, coffre, gemme de ligue, coupe, tampon d'Atlas, badges — et la Signature quand le bloc
 * de jeu manque, et la Meesh frappée à l'édition de la prochaine frappe (`MeeshCoin`, avers). DÉCORATIF : le nom voisin dit tout, donc aucun
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
    val art = ProgressionEmblemArt.of(concept, game)
    Box(modifier.size(size).clearAndSetSemantics { testTag = EMBLEM_TAG_PREFIX + art.tag }, contentAlignment = Alignment.Center) {
        when (art) {
            ProgressionEmblemArt.Ring -> game?.level?.shown?.let { level ->
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
            ProgressionEmblemArt.Blason -> game?.let {
                RankBlason(
                    rank = it.glory.rank,
                    division5 = it.glory.shownDivision,
                    modifier = Modifier.height(size),
                    level = it.level.shown.level,
                    mythic = it.glory.mythicSeat,
                    figures = null,
                )
            }
            is ProgressionEmblemArt.Signature -> SignatureMark(color = MeeshyPalette.Indigo500, style = art.style, modifier = Modifier.fillMaxSize())
            is ProgressionEmblemArt.Mark -> ConceptMarkEmblem(art.kind, Modifier.fillMaxSize())
            is ProgressionEmblemArt.Flame -> FlameEmblem(art.form, Modifier.fillMaxSize())
            is ProgressionEmblemArt.Chest -> ChestEmblem(art.open, Modifier.fillMaxSize())
            is ProgressionEmblemArt.Gem -> LeagueGem(art.league, size)
            is ProgressionEmblemArt.Cup -> CupEmblem(art.material, Modifier.fillMaxSize())
            is ProgressionEmblemArt.Stamp -> AtlasStampEmblem(
                code = art.code,
                stamped = art.stamped,
                tint = MeeshyPalette.Indigo500,
                muted = tokens.textMuted,
                modifier = Modifier.fillMaxSize(),
            )
            is ProgressionEmblemArt.Badge -> badge(art.material, art.shape)
            is ProgressionEmblemArt.Coin -> MeeshCoin(Modifier.fillMaxSize(), face = MeeshCoinFace.Obverse, edition = art.edition)
        }
    }
}

@Composable
private fun badge(material: GameMaterial, shape: GameBadgeShape) {
    val tokens = MeeshyTheme.tokens
    GameBadgeView(material = material, modifier = Modifier.fillMaxSize(), shape = shape, surface = tokens.backgroundPrimary, muted = tokens.textMuted)
}

private const val TRACK_ALPHA = 0.2f

internal const val EMBLEM_TAG_PREFIX = "progression.emblem."
