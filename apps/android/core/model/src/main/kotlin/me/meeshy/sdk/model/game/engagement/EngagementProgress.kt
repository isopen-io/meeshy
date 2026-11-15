package me.meeshy.sdk.model.game.engagement

/** Un palier d'une échelle (badge, série ou niveau), atteint ou à venir. */
public data class EngagementTier(val threshold: Int, val reached: Boolean, val reachedAt: String?)

/**
 * Une ÉCHELLE : la valeur courante posée sur ses paliers. [progress] est la fraction parcourue ENTRE le dernier
 * palier franchi et le suivant (jamais depuis zéro) ; `1` quand l'échelle est complète, et [nextThreshold] vaut
 * alors `null`.
 */
public data class EngagementScaleProgress(
    val value: Int,
    val tiers: List<EngagementTier>,
    val reachedCount: Int,
    val previousThreshold: Int,
    val nextThreshold: Int?,
    val progress: Double,
) {
    /** Ce qu'il reste avant le prochain palier — `null` quand l'échelle est complète. */
    val remainingToNext: Int? get() = nextThreshold?.let { (it - value).coerceAtLeast(0) }
}

public data class EngagementAxisProgress(val axis: EngagementAxisKey, val scale: EngagementScaleProgress) {
    val family: EngagementAxisFamily get() = axis.family
}

public data class EngagementLevelProgress(val scale: EngagementScaleProgress) {
    /** Le niveau COURANT — 0 avant le premier palier, le nombre de paliers au sommet. */
    val level: Int get() = scale.reachedCount
}

public data class EngagementStreakProgress(
    val scale: EngagementScaleProgress,
    /** La série QUI COURT : c'est elle qui avance vers le prochain jalon. */
    val currentDays: Int,
    /** Le record : c'est LUI qui tient un jalon pour atteint. */
    val longestDays: Int,
)

public data class EngagementAchievementProgress(
    val key: EngagementAchievementKey,
    val unlocked: Boolean,
    val reachedAt: String?,
)

public data class EngagementFamilyGroup(val family: EngagementAxisFamily, val axes: List<EngagementAxisProgress>)

/**
 * L'ÉLAN tel que l'écran le rend : [isAccelerated] est dérivé (vrai dès ×2) — au neutre, rien ne se montre.
 */
public data class EngagementElanProgress(
    val factor: Double,
    val activeFamilyCount: Int,
    val hasStanding: Boolean,
    val windowDays: Int,
    val isAccelerated: Boolean,
    /** Familles actives sur la fenêtre, ordre servi ; inconnue ignorée, liste absente ⇒ vide. */
    val activeFamilies: List<EngagementAxisFamily>,
)

/**
 * Les Meeshes tels que l'écran les rend. [canMint] et [progress] sont DÉRIVÉS ici, jamais servis : le bouton
 * n'apparaît que si [canMint], et la barre se mesure sur les points DÉBITABLES.
 */
public data class EngagementMeeshProgress(
    val balance: Int,
    val mintedLifetime: Int,
    val debitablePoints: Int,
    val floorPoints: Int,
    val missingPoints: Int,
    val mintCost: Int,
    val canMint: Boolean,
    val progress: Double,
    /** ISO 8601 des bornes du registre de frappe ; une chaîne illisible devient `null`. */
    val firstMintedAt: String?,
    val lastMintedAt: String?,
)

public data class EngagementProgress(
    val level: EngagementLevelProgress,
    val streak: EngagementStreakProgress,
    /** Dans l'ordre du catalogue — [axesByFamily] les range par section. */
    val axes: List<EngagementAxisProgress>,
    val achievements: List<EngagementAchievementProgress>,
    val badgesEarned: Int,
    val badgesTotal: Int,
    /** Aucune activité comptée, aucun palier gravé : l'ÉTAT VIDE de l'écran. */
    val isEmpty: Boolean,
    val meesh: EngagementMeeshProgress? = null,
    val elan: EngagementElanProgress? = null,
    /** Le catalogue GÉNÉRATIF des succès, par section, déjà tronqué à sa fenêtre. */
    val achievementSections: List<AchievementSectionView> = emptyList(),
) {
    /** Les axes rangés par SECTION, ordre du catalogue conservé dans chacune. */
    val axesByFamily: List<EngagementFamilyGroup>
        get() = EngagementCatalog.families
            .map { family -> EngagementFamilyGroup(family, axes.filter { it.family == family }) }
            .filter { it.axes.isNotEmpty() }

    val unlockedAchievementCount: Int get() = achievements.count { it.unlocked }

    /**
     * Le succès mis en AVANT : le DERNIER obtenu (une date absente perd contre toute date), sinon le PROCHAIN à
     * débloquer dans l'ordre du catalogue. `null` seulement si le catalogue est vide.
     */
    val heroAchievement: EngagementAchievementProgress?
        get() {
            val obtained = achievements.filter { it.unlocked }
            if (obtained.isNotEmpty()) return obtained.maxWithOrNull(compareBy { it.reachedAt.orEmpty() })
            return achievements.firstOrNull { !it.unlocked }
        }
}
