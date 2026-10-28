package me.meeshy.sdk.model.game.engagement

/**
 * POURQUOI la révélation est à l'écran (miroir de `AchievementRevealView.Occasion`, iOS) : célébrer annonce un fait qui
 * vient de tomber ; consulter revient sur un palier depuis le tableau de bord — on n'y refête rien, on n'y « va » nulle
 * part, et un palier PAS ENCORE obtenu s'y regarde aussi : c'est là qu'on lit ce qu'il faut faire pour l'avoir.
 */
public sealed interface RevealOccasion {
    public data object Celebration : RevealOccasion
    public data class Consultation(val unlocked: Boolean, val reachedAt: String?) : RevealOccasion

    public val isCelebration: Boolean get() = this is Celebration

    public val isObtained: Boolean
        get() = when (this) {
            Celebration -> true
            is Consultation -> unlocked
        }
}

public sealed interface RevealBanner {
    public data object Achievement : RevealBanner
    public data object Badge : RevealBanner
    public data object Streak : RevealBanner
    public data object Level : RevealBanner
    public data object Locked : RevealBanner

    /** Obtenu, sans date gravée. */
    public data object Obtained : RevealBanner

    /** Obtenu à la date gravée (ISO 8601) ; l'écran la met en forme, et retombe sur [Obtained] si elle est illisible. */
    public data class ObtainedOn(val reachedAt: String) : RevealBanner
}

/** La teinte : la couleur EST le signal « c'est à vous » — un palier verrouillé se peint en GRIS. */
public enum class RevealTint { Locked, Achievement, Badge, Streak, Level }

public enum class RevealSymbol { Lock, Rosette, Medal, Flame, StarCircle }

/** La médaille d'un BADGE obtenu : la même que sur l'étagère de Progression. */
public data class RevealMedalSpec(val axis: EngagementAxisKey, val threshold: Int, val material: BadgeMaterialKey)

/** Ce que le titre DIT : le mot, jamais la clé technique. */
public sealed interface RevealTitle {
    public data class Legacy(val key: EngagementAchievementKey) : RevealTitle
    public data class Composed(val family: AchievementFamily, val tier: Int) : RevealTitle
    public data class BadgeTier(val axis: EngagementAxisKey, val threshold: Int) : RevealTitle

    /** Un axe ajouté au serveur avant la mise à jour : le seuil seul, jamais une clé technique. */
    public data class UnknownBadgeTier(val threshold: Int) : RevealTitle
    public data class Streak(val days: Int) : RevealTitle
    public data class Level(val rank: Int) : RevealTitle
}

public sealed interface RevealSubtitle {
    public data class LegacyCondition(val key: EngagementAchievementKey) : RevealSubtitle

    /** Le titre PORTE déjà la condition : ce qui manque au lecteur, c'est OÙ le palier se range. */
    public data class Composed(val section: String) : RevealSubtitle
    public data object BadgeAxis : RevealSubtitle
    public data class Streak(val days: Int) : RevealSubtitle
    public data object Level : RevealSubtitle
}

/**
 * Ce que la révélation d'un palier MONTRE — dérivé du palier servi et de l'occasion, JAMAIS fabriqué (miroir des
 * propriétés de `AchievementRevealView` iOS). Pure : la mise en mots et en pixels reste à l'écran.
 */
public data class EngagementRevealPlan(
    val title: RevealTitle,
    val subtitle: RevealSubtitle,
    val banner: RevealBanner,
    val tint: RevealTint,
    val symbol: RevealSymbol,
    val medal: RevealMedalSpec?,
    /** Les rayons ne tournent QUE pour un palier obtenu (et seulement si l'animation est permise). */
    val raysWhenMotionAllowed: Boolean,
    /** L'haptique de succès annonce un fait NOUVEAU ; la rejouer à chaque consultation userait le signal. */
    val celebratesWithSuccessHaptic: Boolean,
    /** Seule la célébration MÈNE au tableau de bord ; on revient de lui en consultation. */
    val leadsToProgression: Boolean,
) {
    public companion object {
        public fun of(reveal: EngagementReveal, occasion: RevealOccasion): EngagementRevealPlan {
            val obtained = occasion.isObtained
            val medal = if (obtained) medalOf(reveal) else null
            return EngagementRevealPlan(
                title = titleOf(reveal),
                subtitle = subtitleOf(reveal),
                banner = bannerOf(reveal, occasion),
                tint = if (obtained) tintOf(reveal) else RevealTint.Locked,
                symbol = if (obtained) symbolOf(reveal) else RevealSymbol.Lock,
                medal = medal,
                raysWhenMotionAllowed = obtained,
                celebratesWithSuccessHaptic = occasion.isCelebration,
                leadsToProgression = occasion.isCelebration,
            )
        }

        private fun medalOf(reveal: EngagementReveal): RevealMedalSpec? {
            val badge = reveal as? EngagementReveal.Badge ?: return null
            val axis = EngagementAxisKey.fromWire(badge.axis) ?: return null
            val material = GameBadgeTiers.materialOfThreshold(badge.threshold)
                ?: GameBadgeTiers.materialReached(badge.threshold)
                ?: BadgeMaterialKey.CUIVRE
            return RevealMedalSpec(axis, badge.threshold, material)
        }

        private fun titleOf(reveal: EngagementReveal): RevealTitle = when (reveal) {
            is EngagementReveal.Achievement -> RevealTitle.Legacy(reveal.key)
            is EngagementReveal.ComposedAchievement -> RevealTitle.Composed(reveal.family, reveal.tier)
            is EngagementReveal.Badge -> EngagementAxisKey.fromWire(reveal.axis)
                ?.let { RevealTitle.BadgeTier(it, reveal.threshold) }
                ?: RevealTitle.UnknownBadgeTier(reveal.threshold)
            is EngagementReveal.Streak -> RevealTitle.Streak(reveal.days)
            is EngagementReveal.Level -> RevealTitle.Level(reveal.rank)
        }

        private fun subtitleOf(reveal: EngagementReveal): RevealSubtitle = when (reveal) {
            is EngagementReveal.Achievement -> RevealSubtitle.LegacyCondition(reveal.key)
            is EngagementReveal.ComposedAchievement -> RevealSubtitle.Composed(reveal.family.section)
            is EngagementReveal.Badge -> RevealSubtitle.BadgeAxis
            is EngagementReveal.Streak -> RevealSubtitle.Streak(reveal.days)
            is EngagementReveal.Level -> RevealSubtitle.Level
        }

        private fun bannerOf(reveal: EngagementReveal, occasion: RevealOccasion): RevealBanner {
            if (occasion is RevealOccasion.Consultation) {
                if (!occasion.unlocked) return RevealBanner.Locked
                return occasion.reachedAt?.takeIf(String::isNotBlank)?.let(RevealBanner::ObtainedOn) ?: RevealBanner.Obtained
            }
            return when (reveal) {
                is EngagementReveal.Achievement, is EngagementReveal.ComposedAchievement -> RevealBanner.Achievement
                is EngagementReveal.Badge -> RevealBanner.Badge
                is EngagementReveal.Streak -> RevealBanner.Streak
                is EngagementReveal.Level -> RevealBanner.Level
            }
        }

        private fun tintOf(reveal: EngagementReveal): RevealTint = when (reveal) {
            is EngagementReveal.Achievement, is EngagementReveal.ComposedAchievement -> RevealTint.Achievement
            is EngagementReveal.Badge -> RevealTint.Badge
            is EngagementReveal.Streak -> RevealTint.Streak
            is EngagementReveal.Level -> RevealTint.Level
        }

        private fun symbolOf(reveal: EngagementReveal): RevealSymbol = when (reveal) {
            is EngagementReveal.Achievement, is EngagementReveal.ComposedAchievement -> RevealSymbol.Rosette
            is EngagementReveal.Badge -> RevealSymbol.Medal
            is EngagementReveal.Streak -> RevealSymbol.Flame
            is EngagementReveal.Level -> RevealSymbol.StarCircle
        }
    }
}
