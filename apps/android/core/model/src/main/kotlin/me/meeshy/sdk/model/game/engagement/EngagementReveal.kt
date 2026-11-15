package me.meeshy.sdk.model.game.engagement

import me.meeshy.sdk.model.MeeshyNotificationType
import me.meeshy.sdk.model.NotificationMetadata

/**
 * Ce qu'un palier a de CÉLÉBRABLE — dérivé de la notification, JAMAIS fabriqué. MIROIR de `EngagementReveal.swift`.
 *
 * [from] rend `null` dès que la charge ne dit pas QUOI célébrer : l'appelant ouvre alors le tableau de bord.
 * Fabriquer un palier par défaut donnerait une célébration cohérente et FAUSSE (le repli menteur).
 */
public sealed interface EngagementReveal {

    /** L'identité EST le palier célébré : la clé canonique que la passerelle grave elle-même. */
    public val id: String

    public data class Achievement(val key: EngagementAchievementKey) : EngagementReveal {
        override val id: String get() = "achievement:${key.wire}"
    }

    /** Un succès de la GRAMMAIRE : il porte sa famille et son palier plutôt que sa chaîne. */
    public data class ComposedAchievement(val family: AchievementFamily, val tier: Int) : EngagementReveal {
        override val id: String get() = "achievement:${family.key(tier)}"
    }

    /** Un BADGE : l'axe reste une CHAÎNE (un axe inconnu doit pouvoir s'afficher). */
    public data class Badge(val axis: String, val threshold: Int) : EngagementReveal {
        override val id: String get() = "badge:$axis:$threshold"
    }

    public data class Streak(val days: Int) : EngagementReveal {
        override val id: String get() = "streak:$days"
    }

    public data class Level(val rank: Int) : EngagementReveal {
        override val id: String get() = "level:$rank"
    }

    /**
     * Ce qui se célèbre TOUT SEUL : un SUCCÈS nomme un fait rare et mérite qu'on interrompe ; un badge, une série
     * ou un niveau tombent au fil de l'usage (le tap sur la notification reste servi pour les cinq formes).
     */
    public val celebratesUnprompted: Boolean
        get() = this is Achievement || this is ComposedAchievement

    public companion object {
        /** Les types de notification qui annoncent un palier (les deux casses du succès comptent pour une). */
        public val announcingTypes: Set<MeeshyNotificationType> = setOf(
            MeeshyNotificationType.ACHIEVEMENT_UNLOCKED,
            MeeshyNotificationType.LEGACY_ACHIEVEMENT_UNLOCKED,
            MeeshyNotificationType.STREAK_MILESTONE,
            MeeshyNotificationType.LEVEL_UP,
            MeeshyNotificationType.BADGE_EARNED,
        )

        public fun from(type: MeeshyNotificationType, metadata: NotificationMetadata?): EngagementReveal? =
            from(type, metadata?.achievementKey, metadata?.axisKey, metadata?.threshold, metadata?.level)

        /** La règle, à son site unique. */
        public fun from(
            type: MeeshyNotificationType,
            achievementKey: String?,
            axisKey: String?,
            threshold: Int?,
            level: Int?,
        ): EngagementReveal? = when (type) {
            MeeshyNotificationType.ACHIEVEMENT_UNLOCKED,
            MeeshyNotificationType.LEGACY_ACHIEVEMENT_UNLOCKED,
            -> achievementKey?.let(::achievement)
            // Le badge a sa PROPRE branche : une notification de badge ne porte jamais de clé de succès.
            MeeshyNotificationType.BADGE_EARNED ->
                if (!axisKey.isNullOrEmpty() && threshold != null && threshold > 0) Badge(axisKey, threshold) else null
            MeeshyNotificationType.LEVEL_UP -> level?.takeIf { it > 0 }?.let(::Level)
            MeeshyNotificationType.STREAK_MILESTONE -> threshold?.takeIf { it > 0 }?.let(::Streak)
            else -> null
        }

        private fun achievement(raw: String): EngagementReveal? {
            // Les CINQ legacy d'abord : leur clé n'a pas la forme composée.
            EngagementAchievementKey.fromWire(raw)?.let { return Achievement(it) }
            val parsed = AchievementCatalog.parse(raw) ?: return null
            return ComposedAchievement(parsed.family, parsed.tier)
        }
    }
}
