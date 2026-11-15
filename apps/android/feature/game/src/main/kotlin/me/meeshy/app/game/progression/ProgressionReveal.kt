package me.meeshy.app.game.progression

import me.meeshy.sdk.model.game.GameRarityEntry
import me.meeshy.sdk.model.game.engagement.BadgeGuide
import me.meeshy.sdk.model.game.engagement.BadgeGuideResolver
import me.meeshy.sdk.model.game.engagement.BadgeMaterialKey
import me.meeshy.sdk.model.game.engagement.EngagementAchievementKey
import me.meeshy.sdk.model.game.engagement.EngagementAchievementProgress
import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import me.meeshy.sdk.model.game.engagement.EngagementAxisKey
import me.meeshy.sdk.model.game.engagement.EngagementAxisProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import me.meeshy.sdk.model.game.engagement.EngagementReveal
import me.meeshy.sdk.model.game.engagement.GameBadgeTiers
import me.meeshy.sdk.model.game.engagement.RevealOccasion
import me.meeshy.sdk.model.game.engagement.RevealTitle

/**
 * CE QU'UNE PORTE DE PROGRESSION DEMANDE D'OUVRIR — le palier, sa date, et s'il est OBTENU (miroir de
 * `ProgressionRevealRequest`, iOS). Trois valeurs passées de main en main finiraient par se désordonner : un palier
 * verrouillé ouvert « obtenu » afficherait « Succès obtenu » sur un succès qu'on n'a pas. On arrive DEPUIS le tableau
 * de bord : c'est toujours une CONSULTATION — ni haptique de succès, ni sortie vers la progression.
 */
data class ProgressionRevealRequest(val reveal: EngagementReveal, val reachedAt: String?, val unlocked: Boolean) {
    val occasion: RevealOccasion get() = RevealOccasion.Consultation(unlocked = unlocked, reachedAt = reachedAt)
}

/**
 * LE HÉROS DU DERNIER HAUT FAIT, ET DU PROCHAIN À DÉFAUT (miroir de `ProgressionLastAchievementHero`, iOS). Il ne
 * disparaît jamais : sans rien d'obtenu il nomme le PROCHAIN verrouillé et sa condition, et sans même un prochain il
 * dit comment accomplir le premier. Obtenu ou visé, il s'ouvre — un succès pas encore obtenu s'y regarde aussi.
 */
sealed interface AchievementHero {
    val request: ProgressionRevealRequest?

    /** Le plus récent des succès obtenus et DATÉS, nommés ou de la grammaire. */
    data class Obtained(val title: RevealTitle, val reachedAt: String, override val request: ProgressionRevealRequest) : AchievementHero

    /** Rien d'obtenu : le prochain succès nommé à débloquer, dans l'ordre du catalogue. */
    data class Next(val key: EngagementAchievementKey, override val request: ProgressionRevealRequest) : AchievementHero

    /** Ni obtenu daté, ni prochain : la carte dit comment accomplir le premier, et ne s'ouvre pas. */
    data object First : AchievementHero {
        override val request: ProgressionRevealRequest? get() = null
    }

    companion object {
        /**
         * Les deux provenances concourent : les succès NOMMÉS et les paliers de la GRAMMAIRE. Un palier sans date
         * lisible ne concourt pas — le dater « maintenant » le ferait gagner à tort.
         */
        fun of(progress: EngagementProgress): AchievementHero {
            val named = progress.achievements.filter { it.unlocked }.mapNotNull { achievement ->
                dated(achievement.reachedAt)?.let { (at, iso) ->
                    Candidate(at, iso, RevealTitle.Legacy(achievement.key), EngagementReveal.Achievement(achievement.key))
                }
            }
            val composed = progress.achievementSections.flatMap { it.entries }.filter { it.unlocked }.mapNotNull { entry ->
                dated(entry.reachedAt)?.let { (at, iso) ->
                    Candidate(at, iso, RevealTitle.Composed(entry.family, entry.tier), EngagementReveal.ComposedAchievement(entry.family, entry.tier))
                }
            }
            val latest = (named + composed).maxByOrNull { it.at }
            if (latest != null) {
                return Obtained(latest.title, latest.iso, ProgressionRevealRequest(latest.reveal, latest.iso, unlocked = true))
            }
            val next = progress.heroAchievement?.takeUnless { it.unlocked } ?: return First
            return Next(next.key, ProgressionRevealRequest(EngagementReveal.Achievement(next.key), next.reachedAt, unlocked = false))
        }

        private fun dated(iso: String?): Pair<Long, String>? =
            iso?.let { value -> EngagementProgressResolver.reachedEpochMillis(value)?.let { it to value } }
    }

    private data class Candidate(val at: Long, val iso: String, val title: RevealTitle, val reveal: EngagementReveal)
}

/** Une ligne de la liste des hauts faits : le succès nommé, sa rareté quand elle a le droit de se montrer, sa porte. */
data class AchievementRow(val achievement: EngagementAchievementProgress, val rarity: GameRarityEntry?) {
    val request: ProgressionRevealRequest
        get() = ProgressionRevealRequest(EngagementReveal.Achievement(achievement.key), achievement.reachedAt, achievement.unlocked)

    companion object {
        /** Dans l'ordre du catalogue ; la rareté est lue au bloc `game` CONNU, jamais sous « Jeu masqué ». */
        fun of(progress: EngagementProgress, rarities: Map<String, GameRarityEntry>?, hidden: Boolean): List<AchievementRow> =
            progress.achievements.map { AchievementRow(it, if (hidden) null else rarities?.get(it.key.wire)) }
    }
}

/**
 * UN BADGE DE L'ÉTAGÈRE (miroir de `GameBadgeShelfEntry`, iOS) : la médaille de SON axe à son plus haut palier gravé,
 * allumée quand le compteur la tient, en EMPREINTE quand une frappe l'a éteinte — avec ce qu'il manque pour la
 * rallumer. Elle s'ouvre en feuille de précisions ([GameElementDetails.badge]).
 */
data class BadgeShelfEntry(
    val axis: EngagementAxisKey,
    val threshold: Int,
    val material: BadgeMaterialKey,
    val lit: Boolean,
    val missing: Int,
    val value: Int,
    val nextThreshold: Int?,
    val stars: Int,
    val reachedAt: String?,
    /** Ce que la loi partagée dit de la médaille, dont la SUITE de ses paliers (iOS `GameBadgeShelfEntry.guide`). */
    val guide: BadgeGuide,
) {
    /** La part parcourue vers le palier suivant, de 0 à 1 ; 1 au sommet, 0 pour une empreinte. */
    val progress: Double
        get() {
            if (!lit) return 0.0
            val next = nextThreshold?.takeIf { it > threshold } ?: return 1.0
            return ((value - threshold).toDouble() / (next - threshold)).coerceIn(0.0, 1.0)
        }

    companion object {
        /** Les sept matières, du Cuivre au Prisme : les étoiles d'un badge se comptent sur elles. */
        val STARS_MAX: Int = GameBadgeTiers.materials.size
    }
}

data class BadgeShelfGroup(val family: EngagementAxisFamily, val entries: List<BadgeShelfEntry>)

/** L'ÉTAGÈRE : les badges GAGNÉS, un par axe, rangés par famille dans l'ordre du catalogue ; ni axe ni famille vides. */
object BadgeShelf {
    fun of(progress: EngagementProgress): List<BadgeShelfGroup> = progress.axesByFamily.mapNotNull { group ->
        group.axes.mapNotNull(::entryOf).takeIf { it.isNotEmpty() }?.let { BadgeShelfGroup(group.family, it) }
    }

    /** La médaille d'un axe à son plus haut palier gravé ; `null` pour un axe jamais gagné. */
    fun entryOf(axis: EngagementAxisProgress): BadgeShelfEntry? {
        val scale = axis.scale
        val top = scale.tiers.filter { it.reached }.maxByOrNull { it.threshold } ?: return null
        return BadgeShelfEntry(
            axis = axis.axis,
            threshold = top.threshold,
            material = GameBadgeTiers.materialOfThreshold(top.threshold) ?: BadgeMaterialKey.PRISME,
            lit = scale.value >= top.threshold,
            missing = (top.threshold - scale.value).coerceAtLeast(0),
            value = scale.value,
            nextThreshold = scale.tiers.map { it.threshold }.filter { it > top.threshold }.minOrNull(),
            stars = scale.reachedCount,
            reachedAt = top.reachedAt,
            guide = BadgeGuideResolver.resolve(axis),
        )
    }
}
