package me.meeshy.app.game.pages

import android.text.format.DateFormat
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import me.meeshy.app.game.gameString
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameNumberFormat
import me.meeshy.sdk.model.game.LeagueCup
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LeagueZone
import me.meeshy.sdk.model.game.SeasonRewardBlock
import me.meeshy.sdk.model.game.SeasonRewardKind
import me.meeshy.sdk.model.game.ShowcaseVisibility
import me.meeshy.sdk.model.game.pages.GameDuration
import me.meeshy.sdk.model.game.pages.SeasonStepState

/**
 * Ce que les pages du jeu disent, habillé dans la langue de l'interface : les noms que la loi rend en clés fermées
 * (ligue, zone, coupe, visibilité) deviennent des phrases ICI, jamais ailleurs. Les nombres sont formatés par la
 * locale AVANT d'entrer dans la phrase ; les dates par le motif que la locale choisit (jamais écrit à la main).
 */
@Composable
internal fun currentLocale(): Locale = LocalConfiguration.current.locales[0]

@Composable
internal fun count(value: Int): String {
    val locale = currentLocale()
    return remember(value, locale) { GameNumberFormat.formatCount(value, locale) }
}

@Composable
internal fun points(value: Int): String = gameString(GameCopyLaws.points(value))

@StringRes
internal fun leagueNameRes(league: LeagueKey): Int = when (league) {
    LeagueKey.Quartz -> R.string.game2_league_name_quartz
    LeagueKey.Ambre -> R.string.game2_league_name_ambre
    LeagueKey.Jade -> R.string.game2_league_name_jade
    LeagueKey.Saphir -> R.string.game2_league_name_saphir
    LeagueKey.Rubis -> R.string.game2_league_name_rubis
    LeagueKey.Amethyste -> R.string.game2_league_name_amethyste
    LeagueKey.Diamant -> R.string.game2_league_name_diamant
    LeagueKey.Prisme -> R.string.game2_league_name_prisme
}

@StringRes
internal fun zoneRes(zone: LeagueZone): Int = when (zone) {
    LeagueZone.Promotion -> R.string.game2_league_zone_promotion
    LeagueZone.Safe -> R.string.game2_league_zone_safe
    LeagueZone.Relegation -> R.string.game2_league_zone_relegation
}

@StringRes
internal fun cupRes(cup: LeagueCup): Int = when (cup) {
    LeagueCup.Gold -> R.string.game2_league_cup_gold
    LeagueCup.Silver -> R.string.game2_league_cup_silver
    LeagueCup.Bronze -> R.string.game2_league_cup_bronze
}

@StringRes
internal fun visibilityRes(level: ShowcaseVisibility): Int = when (level) {
    ShowcaseVisibility.Everyone -> R.string.game2_visibility_everyone
    ShowcaseVisibility.Friends -> R.string.game2_visibility_friends
    ShowcaseVisibility.Me -> R.string.game2_visibility_me
}

@StringRes
internal fun stepStateRes(state: SeasonStepState): Int = when (state) {
    SeasonStepState.Claimed -> R.string.game2_season_step_claimed
    SeasonStepState.Ready -> R.string.game2_season_step_ready
    SeasonStepState.Locked -> R.string.game2_season_step_locked
}

/** « +100 », « Un fragment d'étoile », « Une Veilleuse pour ta Flamme », « La coupe du voyage » (iOS `seasonRewardLabel`). */
@Composable
internal fun rewardLabel(reward: SeasonRewardBlock): String = when (reward.kind) {
    SeasonRewardKind.Points -> "+" + count(reward.amount)
    SeasonRewardKind.Fragment -> stringResource(R.string.game2_season_reward_fragment)
    SeasonRewardKind.Freeze -> stringResource(R.string.game2_season_reward_freeze)
    SeasonRewardKind.SeasonCup -> stringResource(R.string.game2_season_reward_season_cup)
}

@Composable
internal fun durationText(duration: GameDuration?): String = when (duration) {
    null -> ""
    is GameDuration.DaysHours -> stringResource(R.string.game2_duration_days_hours, count(duration.days), count(duration.hours))
    is GameDuration.Hours -> stringResource(R.string.game2_duration_hours, count(duration.hours))
    is GameDuration.Minutes -> stringResource(R.string.game2_duration_minutes, count(duration.minutes))
}

/** « 2 août 2026 » — un tampon, un jour de saison (UTC : une date locale ne glisse jamais d'un jour). */
internal fun dayLabel(dayKey: String, locale: Locale): String =
    runCatching { formatUtc(LocalDate.parse(dayKey), "dMMMMy", locale) }.getOrDefault(dayKey)

/** « octobre 2026 » — ce qu'un visiteur voit d'un trophée : le mois, jamais le jour. */
internal fun monthLabel(month: String, locale: Locale): String =
    runCatching { formatUtc(LocalDate.parse("$month-01"), "MMMMy", locale) }.getOrDefault(month)

/** « oct. 2026 » — la plaque d'une coupe de ligue vue sur un mois. */
internal fun shortMonthLabel(month: String, locale: Locale): String =
    runCatching { formatUtc(LocalDate.parse("$month-01"), "MMMy", locale) }.getOrDefault(month)

/** « 2 novembre » — la semaine s'identifie par son lundi. */
internal fun weekDateLabel(weekKey: String, locale: Locale): String =
    runCatching { formatUtc(LocalDate.parse(weekKey), "dMMMM", locale) }.getOrDefault(weekKey)

/** La date d'un trophée vue PAR SON PROPRIÉTAIRE : « 26 octobre 2026 », depuis l'horodatage ISO servi. */
internal fun awardedLabel(iso: String, locale: Locale): String =
    runCatching { formatUtc(java.time.Instant.parse(iso).atZone(ZoneOffset.UTC).toLocalDate(), "dMMMMy", locale) }.getOrDefault(iso)

private fun formatUtc(day: LocalDate, skeleton: String, locale: Locale): String {
    val pattern = DateFormat.getBestDateTimePattern(locale, skeleton)
    return DateTimeFormatter.ofPattern(pattern, locale).withZone(ZoneOffset.UTC).format(day.atStartOfDay(ZoneOffset.UTC))
}

/** Le nom d'une langue DANS la langue de l'interface (« Swahili », « Japonais »). */
internal fun languageName(code: String, locale: Locale): String {
    val name = Locale.forLanguageTag(code).getDisplayLanguage(locale)
    if (name.isBlank() || name.equals(code, ignoreCase = true)) return code.uppercase(Locale.ROOT)
    return name.replaceFirstChar { it.titlecase(locale) }
}
