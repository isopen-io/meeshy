package me.meeshy.sdk.model.game.progression

import me.meeshy.sdk.model.game.engagement.EngagementProgress

/**
 * Un bloc du hub historique de « Progression » (iOS `ProgressionBlock`) — le repli quand la première page ne porte pas
 * encore ses cartes de concept. Les portes de section ne désignent que les concepts qui ont une sous-page.
 */
public sealed interface ProgressionBlock {
    public data object LastAchievement : ProgressionBlock
    public data object Level : ProgressionBlock
    public data object Elans : ProgressionBlock

    /** La série de jours, en hero à part entière. */
    public data object Flamme : ProgressionBlock

    /** Les Meeshes, sous le niveau : ce qui se CONVERTIT vient juste après ce qui se GAGNE. Conditionnel. */
    public data object Meesh : ProgressionBlock

    public data class SectionLink(val section: ProgressionConcept) : ProgressionBlock
}

/** La composition du hub (miroir de `ProgressionLayout`, iOS, et de `progression-layout.ts`). */
public object ProgressionLayout {

    private val doors: List<ProgressionConcept> =
        listOf(ProgressionConcept.Badges, ProgressionConcept.Defis, ProgressionConcept.Succes)

    /**
     * Dernier succès, niveau, Meesh (si servi), élans, flamme, puis les portes Badges / Défis / Succès. Les trois heros
     * sont TOUJOURS servis, y compris sur un compte vide ; la porte des Défis n'existe que s'il y a des défis, car elle
     * annoncerait « 0 / 0 » et ouvrirait une page vide.
     */
    public fun blocks(progress: EngagementProgress): List<ProgressionBlock> {
        val heroes = listOf(
            ProgressionBlock.LastAchievement,
            ProgressionBlock.Level,
            ProgressionBlock.Meesh,
            ProgressionBlock.Elans,
            ProgressionBlock.Flamme,
        ).filter { it != ProgressionBlock.Meesh || progress.meesh != null }
        val links = doors
            .filter { it != ProgressionConcept.Defis || progress.achievementSections.isNotEmpty() }
            .map { ProgressionBlock.SectionLink(it) }
        return heroes + links
    }
}
