package me.meeshy.app.game.progression

import android.content.res.Resources
import java.util.Locale
import me.meeshy.app.game.GameCopy
import me.meeshy.app.game.reveal.RevealCopy
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameNumberFormat
import me.meeshy.sdk.model.game.engagement.BadgeGuide
import me.meeshy.sdk.model.game.engagement.BadgeGuideResolver
import me.meeshy.sdk.model.game.engagement.BadgeMaterialKey
import me.meeshy.sdk.model.game.engagement.BadgeReachReason
import me.meeshy.sdk.model.game.engagement.BadgeRung
import me.meeshy.sdk.model.game.engagement.BadgeRungState
import me.meeshy.sdk.model.game.engagement.RevealTitle

/** Un palier de l'échelle mis en mots : « Argent · 50 », sa ligne (« Obtenu le … », « Prochaine étoile · 13 de plus », « À 100 »). */
internal data class GameRungText(
    val threshold: Int,
    val material: BadgeMaterialKey,
    val state: BadgeRungState,
    val title: String,
    val line: String,
    val spoken: String,
)

/** Une ligne de données : libellé → valeur (iOS `ProgressionConceptFact`). */
internal data class GameFactText(val label: String, val value: String)

/**
 * CE QUE LA FEUILLE DIT d'un élément (miroir de `GameElementDetail.what` / `.how` / `.statusLine` et de
 * `GameBadgeGuideModel`, iOS) : le nom, l'état en une ligne, les deux phrases et leurs titres, et pour une médaille
 * ses étoiles, sa matière et pourquoi, ses sept paliers. Toutes les phrases sont celles du catalogue iOS.
 */
internal data class GameElementTexts(
    val name: String,
    val status: String,
    val whatTitle: String,
    val what: String,
    val howTitle: String,
    /** La seconde phrase ; une donnée n'en a qu'une (iOS `how == nil`). */
    val how: String?,
    val reason: String?,
    val stars: String?,
    val starsSpoken: String?,
    val ladder: List<GameRungText>,
    val facts: List<GameFactText>,
) {
    companion object {
        fun of(res: Resources, locale: Locale, detail: GameElementDetail): GameElementTexts {
            val status = statusLine(res, locale, detail.status)
            return when (detail) {
                is GameElementDetail.Badge -> badge(res, locale, detail, status)
                is GameElementDetail.Challenge -> GameElementTexts(
                    name = RevealCopy.title(res, locale, RevealTitle.Composed(detail.entry.family, detail.entry.tier)),
                    status = status,
                    whatTitle = res.getString(R.string.game_fiche_what),
                    what = res.getString(R.string.game_detail_defi_what),
                    howTitle = res.getString(R.string.game_detail_obtain_label),
                    how = res.getString(R.string.game_detail_defi_how),
                    reason = null,
                    stars = null,
                    starsSpoken = null,
                    ladder = emptyList(),
                    facts = listOf(GameFactText(res.getString(R.string.game_concept_defis_name), RevealCopy.sectionName(res, detail.entry.section))),
                )
                is GameElementDetail.ElanFamily -> GameElementTexts(
                    name = res.getString(familyTitle(detail.family)),
                    status = status,
                    whatTitle = res.getString(R.string.game_fiche_what),
                    what = res.getString(R.string.game_detail_elan_what),
                    howTitle = res.getString(R.string.game_detail_gives_label),
                    how = res.getString(R.string.game_detail_elan_how),
                    reason = null,
                    stars = null,
                    starsSpoken = null,
                    ladder = emptyList(),
                    facts = listOfNotNull(
                        detail.topPoints?.let {
                            GameFactText(res.getString(R.string.game_concept_points_name), res.getString(R.string.game_detail_elan_points, count(it, locale)))
                        },
                        detail.windowDays?.let {
                            GameFactText(res.getString(R.string.game_concept_fact_window), GameCopy.resolve(res, GameCopyLaws.days(it), locale))
                        },
                    ),
                )
                is GameElementDetail.Fact -> GameElementTexts(
                    name = GameCopy.resolve(res, detail.label, locale),
                    status = status,
                    whatTitle = res.getString(R.string.game_fiche_what),
                    what = res.getString(detail.key?.let(GameDetailFactCopy::sentence) ?: ConceptCopy.why(detail.concept)),
                    howTitle = res.getString(R.string.game_detail_obtain_label),
                    how = null,
                    reason = null,
                    stars = null,
                    starsSpoken = null,
                    ladder = emptyList(),
                    facts = emptyList(),
                )
            }
        }

        private fun badge(res: Resources, locale: Locale, detail: GameElementDetail.Badge, status: String): GameElementTexts {
            val guide = detail.guide
            val stars = res.getString(R.string.game_concept_ratio, count(guide.stars, locale), count(BadgeGuideResolver.STARS_MAX, locale))
            return GameElementTexts(
                name = RevealCopy.axisTitle(res, detail.axis),
                status = status,
                whatTitle = res.getString(R.string.game_badge_counts_label),
                what = res.getString(axisCounts(detail.axis)),
                howTitle = res.getString(R.string.game_detail_obtain_label),
                how = next(res, locale, guide),
                reason = reason(res, locale, guide),
                stars = stars,
                starsSpoken = res.getString(R.string.game_badge_a11y_stars, count(guide.stars, locale), count(BadgeGuideResolver.STARS_MAX, locale)),
                ladder = guide.rungs.map { rung(res, locale, guide, it) },
                facts = listOfNotNull(
                    guide.reached?.let { GameFactText(res.getString(R.string.game_badge_material_label), res.getString(materialName(it.material))) },
                    GameFactText(res.getString(R.string.game_badge_stars_label), stars),
                ),
            )
        }

        private fun statusLine(res: Resources, locale: Locale, status: GameElementStatus): String = when (status) {
            is GameElementStatus.Obtained -> status.reachedAt?.let { RevealCopy.longDate(locale, it) }
                ?.let { res.getString(R.string.game_detail_earned_on, it) }
                ?: res.getString(R.string.game_detail_earned)
            is GameElementStatus.Locked -> {
                val locked = res.getString(R.string.game_detail_locked)
                status.missing?.let { "$locked · ${missing(res, locale, it)}" } ?: locked
            }
            is GameElementStatus.Value -> GameCopy.resolve(res, status.value, locale)
        }

        private fun missing(res: Resources, locale: Locale, missing: GameElementMissing): String = when (missing) {
            is GameElementMissing.FirstStar -> res.getString(R.string.game_detail_badge_missing, count(missing.count, locale))
            is GameElementMissing.Rekindle -> res.getString(R.string.game_badge_a11y_imprint, count(missing.count, locale))
        }

        private fun reason(res: Resources, locale: Locale, guide: BadgeGuide): String {
            val reached = guide.reached ?: return res.getString(R.string.game_badge_reason_none)
            val material = res.getString(materialName(reached.material))
            val threshold = count(reached.threshold, locale)
            return when (reached.reason) {
                BadgeReachReason.ThresholdCrossed -> res.getString(R.string.game_badge_reason_crossed, material, threshold, count(guide.count, locale))
                BadgeReachReason.Served -> res.getString(R.string.game_badge_reason_served, material, threshold)
            }
        }

        private fun next(res: Resources, locale: Locale, guide: BadgeGuide): String {
            val next = guide.next ?: return res.getString(R.string.game_badge_complete)
            return res.getString(R.string.game_badge_next, count(next.missing, locale), res.getString(materialName(next.material)), count(next.threshold, locale))
        }

        private fun rung(res: Resources, locale: Locale, guide: BadgeGuide, rung: BadgeRung): GameRungText {
            val state = guide.stateOf(rung)
            val material = res.getString(materialName(rung.material))
            val threshold = count(rung.threshold, locale)
            val date = rung.reachedAt?.let { RevealCopy.longDate(locale, it) }
            val missing = count(guide.next?.missing ?: 0, locale)
            val (line, spoken) = when (state) {
                BadgeRungState.Reached -> (date?.let { res.getString(R.string.game_detail_earned_on, it) } ?: res.getString(R.string.game_detail_earned)) to
                    (date?.let { res.getString(R.string.game_badge_rung_a11y_reached_on, material, threshold, it) }
                        ?: res.getString(R.string.game_badge_rung_a11y_reached, material, threshold))
                BadgeRungState.Next -> res.getString(R.string.game_badge_rung_next, missing) to
                    res.getString(R.string.game_badge_rung_a11y_next, material, threshold, missing)
                BadgeRungState.Upcoming -> res.getString(R.string.game_badge_rung_upcoming, threshold) to
                    res.getString(R.string.game_badge_rung_a11y_upcoming, material, threshold)
            }
            return GameRungText(rung.threshold, rung.material, state, "$material · $threshold", line, spoken)
        }

        private fun count(value: Int, locale: Locale): String = GameNumberFormat.formatCount(value, locale)
    }
}
