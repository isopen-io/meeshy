package me.meeshy.sdk.model.game

/** Le liseré d'une rareté : ardoise, bleu, violet, or, prisme. */
public enum class RarityBorder { Slate, Blue, Violet, Gold, Prism }

/**
 * LA RARETÉ DES SUCCÈS (#9390) — miroir de `packages/shared/utils/game/rarity.ts` et de `GameRarity`.
 * commun > 40 % · rare 10 à 40 % · épique 2 à 10 % · légendaire 0,2 à 2 % · mythique < 0,2 %. Borne basse incluse,
 * haute exclue (le commun est la seule borne stricte) ; calcul en ENTIERS, au millième par produit en croix. La
 * Gloire est FIGÉE à l'obtention ; la rareté est NON MESURÉE sous [MIN_POPULATION] comptes et son pourcentage ne
 * s'affiche qu'à partir de [MIN_DISPLAY_HOLDERS] titulaires (G-2). Le client ne calcule jamais le Mythe.
 */
public object GameRarity {
    public const val MIN_POPULATION: Int = 1000
    public const val MIN_DISPLAY_HOLDERS: Int = 20
    public const val MYTHE_SIZE: Int = GloryLaws.MYTHE_SIZE

    public fun border(rarity: GloryLaws.AchievementRarity): RarityBorder = when (rarity) {
        GloryLaws.AchievementRarity.Common -> RarityBorder.Slate
        GloryLaws.AchievementRarity.Rare -> RarityBorder.Blue
        GloryLaws.AchievementRarity.Epic -> RarityBorder.Violet
        GloryLaws.AchievementRarity.Legendary -> RarityBorder.Gold
        GloryLaws.AchievementRarity.Mythic -> RarityBorder.Prism
    }

    public fun border(rarity: AchievementRarity): RarityBorder = border(glory(rarity))

    /** La rareté du serveur, lue par la table de Gloire. */
    public fun glory(rarity: AchievementRarity): GloryLaws.AchievementRarity = when (rarity) {
        AchievementRarity.Common -> GloryLaws.AchievementRarity.Common
        AchievementRarity.Rare -> GloryLaws.AchievementRarity.Rare
        AchievementRarity.Epic -> GloryLaws.AchievementRarity.Epic
        AchievementRarity.Legendary -> GloryLaws.AchievementRarity.Legendary
        AchievementRarity.Mythic -> GloryLaws.AchievementRarity.Mythic
    }

    /** Les bornes basses en millièmes de la population, de la plus commune à la plus rare. */
    private data class Band(val rarity: GloryLaws.AchievementRarity, val floor: Int, val inclusive: Boolean)

    private val bands = listOf(
        Band(GloryLaws.AchievementRarity.Common, 400, false),
        Band(GloryLaws.AchievementRarity.Rare, 100, true),
        Band(GloryLaws.AchievementRarity.Epic, 20, true),
        Band(GloryLaws.AchievementRarity.Legendary, 2, true),
    )

    public fun rarity(holders: Int, population: Int): GloryLaws.AchievementRarity {
        val scaled = holders.toLong() * 1000
        val hit = bands.firstOrNull { band ->
            val bar = band.floor.toLong() * population
            if (band.inclusive) scaled >= bar else scaled > bar
        }
        return hit?.rarity ?: GloryLaws.AchievementRarity.Mythic
    }

    /** La rareté de la nuit, `null` quand elle n'est pas mesurable. */
    public fun measure(holders: Int, population: Int): GloryLaws.AchievementRarity? =
        if (holders < 0 || population < MIN_POPULATION) null else rarity(holders, population)

    /** `true` quand le pourcentage peut s'afficher ; sinon le client dit « rareté en cours de mesure ». */
    public fun isShareDisplayable(holders: Int, population: Int): Boolean =
        holders >= MIN_DISPLAY_HOLDERS && population >= MIN_POPULATION

    /** La Gloire d'un succès à l'obtention : Commun tant que la rareté n'est pas mesurée. */
    public fun gloryAtEarning(measured: GloryLaws.AchievementRarity?): Int =
        GloryLaws.gloryForAchievement(measured ?: GloryLaws.AchievementRarity.Common)
}
