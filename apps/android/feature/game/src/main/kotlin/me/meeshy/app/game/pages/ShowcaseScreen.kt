package me.meeshy.app.game.pages

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import java.time.temporal.IsoFields
import java.util.Locale
import me.meeshy.app.game.gameString
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameAgreement
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.LeagueCup
import me.meeshy.sdk.model.game.pages.GameTrophyShelf
import me.meeshy.sdk.model.game.pages.TrophyPeriod
import me.meeshy.sdk.model.game.pages.TrophySpec
import me.meeshy.ui.component.game.GameMaterial
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.motion.staggeredAppear
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LA PAGE « VITRINE » (iOS `GameShowcasePage`) — coupes de ligue, de saison, de Renaissance et de Flamme, dans l'ordre
 * que la personne a rangé et que la passerelle sert. Un trophée ne rapporte JAMAIS de points ni de Gloire : c'est un
 * objet reçu à un moment précis. Les clés d'une version plus récente de l'app ne se montrent pas : on ne nomme pas ce
 * qu'on ne comprend pas.
 *
 * LECTURE SEULE : ranger (monter, descendre) et régler QUI voit sont des écritures d'une partie suivante ; le réglage
 * courant se dit ici, tel que la passerelle le sert.
 */
@Composable
fun ShowcaseScreen(onBack: () -> Unit) {
    GamePageHost(title = stringResource(R.string.game2_showcase_title), onBack = onBack) { game ->
        ShowcaseContent(game)
    }
}

@Composable
private fun ShowcaseContent(game: GameBlock) {
    val trophies = game.trophies
    if (trophies == null) {
        GameCard { GameNote(stringResource(R.string.game2_unavailable)) }
        return
    }
    val shown = GameTrophyShelf.shown(trophies)
    val awarded = trophies.items.associate { it.key to it.awardedAt }
    val locale = currentLocale()
    val countLabel = stringResource(
        if (GameAgreement.isSingular(shown.size, locale.language)) R.string.game2_door_showcase_count_one else R.string.game2_door_showcase_count_other,
        count(shown.size),
    )
    GameCard(title = stringResource(R.string.game2_showcase_title) + " · " + countLabel) {
        if (shown.isEmpty()) {
            GameNote(stringResource(R.string.game2_showcase_empty))
        } else {
            shown.chunked(COLUMNS).forEachIndexed { rowIndex, keys ->
                Row(
                    Modifier.fillMaxWidth().staggeredAppear(minOf(rowIndex, MAX_STAGGER_ROW)),
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
                ) {
                    keys.forEach { key -> TrophyCell(key, awarded[key], Modifier.weight(1f)) }
                    repeat(COLUMNS - keys.size) { Box(Modifier.weight(1f)) }
                }
            }
        }
    }
    GameCard(title = stringResource(R.string.game2_showcase_visibility)) {
        val level = game.visibility?.showcase
        if (level != null) {
            GameNote(stringResource(R.string.game2_visibility_field_showcase) + " : " + stringResource(visibilityRes(level)), tone = MeeshyTheme.tokens.textPrimary)
        }
        GameNote(stringResource(R.string.game2_showcase_visibility_hint))
    }
}

@Composable
private fun TrophyCell(key: String, awardedAt: String?, modifier: Modifier = Modifier) {
    val spec = GameTrophyShelf.parse(key) ?: return
    val tokens = MeeshyTheme.tokens
    val locale = currentLocale()
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        TrophyArt(spec, plate = trophyPlate(spec, locale))
        Text(
            trophyTitle(spec, locale),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = tokens.textPrimary,
            textAlign = TextAlign.Center,
        )
        awardedAt?.takeIf { it.isNotBlank() }?.let {
            Text(
                stringResource(R.string.game2_showcase_awarded, awardedLabel(it, locale)),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Medium,
                color = tokens.textMuted,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** La matière d'une coupe : or, argent ou bronze pour la ligue, platine pour le voyage, prisme pour la Renaissance, flamme. */
internal fun trophyMaterial(spec: TrophySpec): GameMaterial = when (spec) {
    is TrophySpec.LeagueCupOf -> when (spec.cup) {
        LeagueCup.Gold -> GameMaterial.GOLD
        LeagueCup.Silver -> GameMaterial.SILVER
        LeagueCup.Bronze -> GameMaterial.BRONZE
    }
    is TrophySpec.SeasonCup -> GameMaterial.PLATINUM
    is TrophySpec.Prestige -> GameMaterial.PRISM
    is TrophySpec.Flame -> GameMaterial.FLAME
}

/** Ce que lit TalkBack : « Coupe d'or — joute Jade, semaine du 26 octobre ». */
@Composable
internal fun trophyTitle(spec: TrophySpec, locale: Locale): String = when (spec) {
    is TrophySpec.LeagueCupOf -> {
        val cup = stringResource(cupRes(spec.cup))
        val league = stringResource(leagueNameRes(spec.league))
        when (val period = spec.period) {
            is TrophyPeriod.Week -> stringResource(R.string.game2_trophy_league_cup, cup, league, weekDateLabel(period.weekKey, locale))
            is TrophyPeriod.Month -> stringResource(R.string.game2_trophy_league_cup_month, cup, league, monthLabel(period.month, locale))
        }
    }
    is TrophySpec.SeasonCup -> stringResource(R.string.game2_trophy_season_cup, count(spec.season))
    is TrophySpec.Prestige -> stringResource(R.string.game2_trophy_prestige, count(spec.number))
    is TrophySpec.Flame -> stringResource(R.string.game2_trophy_flame, gameString(GameCopyLaws.days(spec.days)))
}

/** Ce que la plaque grave, en capitales : « JADE · S44 ». */
@Composable
internal fun trophyPlate(spec: TrophySpec, locale: Locale): String = when (spec) {
    is TrophySpec.LeagueCupOf -> {
        val league = stringResource(leagueNameRes(spec.league)).uppercase(locale)
        when (val period = spec.period) {
            is TrophyPeriod.Week -> stringResource(R.string.game2_trophy_plate_league, league, count(isoWeekNumber(period.weekKey)))
            is TrophyPeriod.Month -> stringResource(R.string.game2_trophy_plate_league_month, league, shortMonthLabel(period.month, locale).uppercase(locale))
        }
    }
    is TrophySpec.SeasonCup -> stringResource(R.string.game2_trophy_plate_season, count(spec.season))
    is TrophySpec.Prestige -> stringResource(R.string.game2_trophy_plate_prestige, count(spec.number))
    is TrophySpec.Flame -> stringResource(R.string.game2_trophy_plate_flame, count(spec.days))
}

private fun isoWeekNumber(weekKey: String): Int =
    runCatching { LocalDate.parse(weekKey).get(IsoFields.WEEK_OF_WEEK_BASED_YEAR) }.getOrDefault(0)

/** Une coupe, dessinée dans sa matière — DÉCORATIVE : son titre, lu à côté, dit ce qu'elle est. */
@Composable
internal fun TrophyArt(spec: TrophySpec, plate: String, modifier: Modifier = Modifier) {
    val material = trophyMaterial(spec)
    Column(
        modifier.clearAndSetSemantics { },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        Box(
            Modifier
                .size(TROPHY_SIZE)
                .clip(CircleShape)
                .drawBehind { drawCircle(material.brush(Rect(0f, 0f, size.width, size.height))) },
            contentAlignment = Alignment.Center,
        ) {
            Icon(MeeshyIcons.Trophy, contentDescription = null, tint = material.ink, modifier = Modifier.size(TROPHY_SIZE / 2))
        }
        Text(plate, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = MeeshyTheme.tokens.textMuted, maxLines = 1)
    }
}

private val TROPHY_SIZE = 64.dp
private const val COLUMNS = 2
private const val MAX_STAGGER_ROW = 8
