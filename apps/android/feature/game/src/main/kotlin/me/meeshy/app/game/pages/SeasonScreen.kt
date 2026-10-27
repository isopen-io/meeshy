package me.meeshy.app.game.pages

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.game.GameAgreement
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GloryLaws
import me.meeshy.sdk.model.game.GameSeason
import me.meeshy.sdk.model.game.GameSeasonBlock
import me.meeshy.sdk.model.game.GameUpcomingSeasonBlock
import me.meeshy.sdk.model.game.SeasonRewardKind
import me.meeshy.sdk.model.game.pages.SeasonPath
import me.meeshy.sdk.model.game.pages.SeasonStepState
import me.meeshy.ui.component.game.SignatureMark
import me.meeshy.ui.component.game.SignatureStyle
import me.meeshy.ui.motion.staggeredAppear
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LA PAGE « VOYAGE » (iOS `GameSeasonPage`) — huit semaines, un thème (une langue), quarante haltes GRATUITES, une
 * rangée Sceau purement décorative. Les pas viennent des missions du jour et de l'alliance ; quatre pas ouvrent une
 * halte. Chaque halte dit son état par le TEXTE (réclamée, à réclamer, à venir), pas seulement par la couleur.
 *
 * LECTURE SEULE : le parcours est celui que la passerelle sert (`claimedSteps`, `steps`) et la récompense d'une halte
 * est la loi partagée — le client ne calcule ni ne crédite rien. Réclamer une halte et prendre le Sceau (qui se paie
 * en Meeshes) sont des gestes qui touchent un solde : ils viennent avec leur audit.
 *
 * Aucune saison ouverte est une VALEUR, pas une panne : la prochaine commence bientôt.
 */
@Composable
fun SeasonScreen(onBack: () -> Unit) {
    GamePageHost(title = stringResource(R.string.game2_season_title), onBack = onBack) { game ->
        SeasonContent(game)
    }
}

@Composable
private fun SeasonContent(game: GameBlock) {
    val season = game.season
    val upcoming = game.seasonUpcoming
    when {
        season != null -> {
            SeasonHeader(season)
            SeasonPathCard(season)
            SeasonSealCard(season)
        }
        upcoming != null -> SeasonUpcoming(upcoming)
        else -> GameCard(title = stringResource(R.string.game2_season_title)) { GameNote(stringResource(R.string.game2_season_none)) }
    }
}

@Composable
private fun themeLine(themeKey: String): String? {
    val locale = currentLocale()
    return SeasonPath.themeLanguage(themeKey)?.let { stringResource(R.string.game2_season_theme, languageName(it, locale)) }
}

@Composable
private fun starsText(count: Int): String {
    val one = GameAgreement.isSingular(count, currentLocale().language)
    return stringResource(if (one) R.string.game2_season_stars_one else R.string.game2_season_stars_other, count(count))
}

@Composable
private fun SeasonUpcoming(upcoming: GameUpcomingSeasonBlock) {
    GameCard(title = stringResource(R.string.game2_season_title), tint = MeeshyPalette.Indigo500) {
        Text(
            stringResource(R.string.game2_season_upcoming, count(upcoming.number), dayLabel(upcoming.startDay, currentLocale())),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        themeLine(upcoming.themeKey)?.let {
            Text(it, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = MeeshyPalette.Indigo500)
        }
        GameNote(stringResource(R.string.game2_season_how, count(GameSeason.STARS_PER_STEP)))
    }
}

@Composable
private fun SeasonHeader(season: GameSeasonBlock) {
    val stepsLine = stringResource(R.string.game2_season_steps_line, count(season.steps), count(season.stepsTotal))
    val heading = stringResource(
        R.string.game2_season_heading, count(season.number), count(season.week), count(GameSeason.WEEKS),
    )
    GameCard(title = heading, tint = MeeshyPalette.Indigo500) {
        themeLine(season.themeKey)?.let {
            Text(it, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = MeeshyPalette.Indigo500)
        }
        Text(
            starsText(season.stars) + " · " + stepsLine,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        GameProgressBar(season.steps.toFloat() / maxOf(1, season.stepsTotal), MeeshyPalette.Indigo500, stepsLine)
        if (season.completed) {
            GameNote(stringResource(R.string.game2_season_completed, count(GloryLaws.POINTS_SEASON)), tone = MeeshyPalette.Success)
        } else {
            GameNote(stringResource(R.string.game2_season_to_next, starsText(season.starsToNext)))
        }
        GameNote(stringResource(R.string.game2_season_how, count(GameSeason.STARS_PER_STEP)))
    }
}

private const val STEPS_PER_ROW = 5

@Composable
private fun SeasonPathCard(season: GameSeasonBlock) {
    GameCard(title = stringResource(R.string.game2_season_path)) {
        SeasonPath.steps.chunked(STEPS_PER_ROW).forEachIndexed { rowIndex, steps ->
            Row(
                Modifier.fillMaxWidth().staggeredAppear(minOf(rowIndex, MAX_STAGGER_ROW)),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                steps.forEach { step -> SeasonStepCell(step, season, Modifier.weight(1f)) }
            }
        }
    }
}

/** Une halte (44 dp) : son état est dit par un mot, jamais par la seule couleur ; les récompenses spéciales portent leur marque. */
@Composable
private fun SeasonStepCell(step: Int, season: GameSeasonBlock, modifier: Modifier = Modifier) {
    val state = SeasonPath.state(step, season)
    val reward = SeasonPath.reward(step, season)
    val tokens = MeeshyTheme.tokens
    val tint = when (state) {
        SeasonStepState.Claimed -> MeeshyPalette.Success
        SeasonStepState.Ready -> MeeshyPalette.Indigo500
        SeasonStepState.Locked -> tokens.textMuted
    }
    val mark = when {
        state == SeasonStepState.Claimed -> "✓"
        reward?.kind == SeasonRewardKind.Fragment -> "◆"
        reward?.kind == SeasonRewardKind.Freeze -> "✦"
        reward?.kind == SeasonRewardKind.SeasonCup -> "★"
        else -> " "
    }
    val spoken = stringResource(R.string.game2_season_step, count(step)) + ", " +
        stringResource(stepStateRes(state)) + ", " + (reward?.let { rewardLabel(it) }.orEmpty())
    val shape = RoundedCornerShape(MeeshyRadius.sm)
    Column(
        modifier
            .heightIn(min = 44.dp)
            .clip(shape)
            .background(if (state == SeasonStepState.Locked) Color.Transparent else tint.copy(alpha = if (state == SeasonStepState.Ready) READY_ALPHA else DONE_ALPHA))
            .border(1.dp, tint.copy(alpha = if (state == SeasonStepState.Locked) LOCKED_BORDER else DONE_BORDER), shape)
            .semantics(mergeDescendants = true) { contentDescription = spoken },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(count(step), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = tint)
        Text(mark, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Medium, color = tint)
    }
}

/** La rangée Sceau : un cosmétique toutes les quatre haltes, SANS AUCUN avantage de jeu. Allumée quand possédée ET atteinte. */
@Composable
private fun SeasonSealCard(season: GameSeasonBlock) {
    GameCard(title = stringResource(R.string.game2_season_seal_title)) {
        GameNote(stringResource(R.string.game2_season_seal_body, count(GameSeason.SEAL_EVERY)))
        val cosmetic = stringResource(R.string.game2_season_seal_cosmetic)
        Column(
            Modifier.semantics(mergeDescendants = true) { contentDescription = cosmetic },
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            SeasonPath.sealSteps.chunked(STEPS_PER_ROW).forEach { steps ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                    steps.forEach { step -> SealMark(step, lit = SeasonPath.sealLit(step, season), Modifier.weight(1f)) }
                }
            }
        }
        if (season.sealOwned) GameNote(stringResource(R.string.game2_season_seal_owned), tone = MeeshyPalette.Success)
    }
}

@Composable
private fun SealMark(step: Int, lit: Boolean, modifier: Modifier = Modifier) {
    val muted = MeeshyTheme.tokens.textMuted
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
        Box(
            Modifier
                .size(44.dp)
                .clip(androidx.compose.foundation.shape.CircleShape)
                .background(if (lit) SEAL_GOLD else muted.copy(alpha = UNLIT_ALPHA))
                .padding(MeeshySpacing.xs),
            contentAlignment = Alignment.Center,
        ) {
            SignatureMark(color = if (lit) SEAL_INK else muted, style = if (lit) SignatureStyle.Engraved else SignatureStyle.Flat, modifier = Modifier.size(30.dp))
        }
        Text(count(step), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Medium, color = muted)
    }
}

private val SEAL_GOLD = Color(0xFFE9B949)
private val SEAL_INK = Color(0xFF6B4610)
private const val MAX_STAGGER_ROW = 8
private const val READY_ALPHA = 0.14f
private const val DONE_ALPHA = 0.08f
private const val LOCKED_BORDER = 0.3f
private const val DONE_BORDER = 0.6f
private const val UNLIT_ALPHA = 0.1f
