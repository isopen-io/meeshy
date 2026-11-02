package me.meeshy.sdk.model.game.engagement

/**
 * Le barème et les échelles de l'engagement — SOURCE UNIQUE côté Android, MIROIR de
 * `packages/shared/types/engagement.ts` (+ `engagement-operations.ts`) et de
 * `EngagementCatalog.swift`. Ne rien y ajouter que le TypeScript ne porte déjà.
 */
public object EngagementCatalog {
    internal const val CONTENT_WEIGHT: Int = 9
    internal const val COMMENT_WEIGHT: Int = 3
    internal const val CONVERSATION_WEIGHT: Int = 5
    internal const val TOOL_WEIGHT: Int = 1
    internal const val GROUP_CREATION_WEIGHT: Int = 1
    internal const val SOCIAL_WEIGHT: Int = 7

    /** Les familles dans l'ordre d'affichage du tableau de bord. */
    public val families: List<EngagementAxisFamily> = EngagementAxisFamily.entries

    public val axes: List<EngagementAxisKey> = EngagementAxisKey.entries

    /** Le barème par FAMILLE (le TypeScript en pose cinq constantes). */
    public val familyWeights: Map<EngagementAxisFamily, Int> = mapOf(
        EngagementAxisFamily.CONTENT to CONTENT_WEIGHT,
        EngagementAxisFamily.SOCIAL to SOCIAL_WEIGHT,
        EngagementAxisFamily.CONVERSATION to CONVERSATION_WEIGHT,
        EngagementAxisFamily.COMMENT to COMMENT_WEIGHT,
        EngagementAxisFamily.TOOL to TOOL_WEIGHT,
    )

    /** « Comment gagner » : ce qu'un geste de chaque famille rapporte AU PLUS, avant multiplicateurs. */
    public val familyTopPoints: Map<EngagementAxisFamily, Int> = mapOf(
        EngagementAxisFamily.CONTENT to 1000,
        EngagementAxisFamily.COMMENT to 100,
        EngagementAxisFamily.SOCIAL to 7,
        EngagementAxisFamily.CONVERSATION to 5,
        EngagementAxisFamily.TOOL to 4,
    )

    /** Les cinq paliers d'origine — ce qu'un client qui ignore les deux derniers lit. */
    public val legacyBadgeThresholds: List<Int> = listOf(1, 10, 50, 100, 500)

    /** Sept paliers : 1 000 (Obsidienne) et 5 000 (Prisme) s'ajoutent, rien n'est retiré. */
    public val badgeThresholds: List<Int> = legacyBadgeThresholds + listOf(1000, 5000)
    public val streakThresholds: List<Int> = listOf(3, 7, 14, 30, 60, 100)
    public val levelThresholds: List<Int> = listOf(10, 50, 150, 400, 1000, 2500)

    /** Les familles par poids DÉCROISSANT du barème de score ; l'ordre du catalogue départage l'égalité. */
    public fun familiesByWeight(): List<EngagementAxisFamily> =
        families.sortedByDescending { familyWeights.getValue(it) }

    /** Les familles par gain maximal DÉCROISSANT (« Comment gagner ») ; l'ordre du catalogue départage l'égalité. */
    public fun familiesByTopPoints(): List<EngagementAxisFamily> =
        families.sortedByDescending { familyTopPoints.getValue(it) }

    public fun badgeMilestoneKey(axis: EngagementAxisKey, threshold: Int): String = "${axis.wire}:$threshold"

    public fun streakMilestoneKey(threshold: Int): String = "streak:$threshold"

    public fun levelMilestoneKey(threshold: Int): String = "level:$threshold"
}
