package me.meeshy.sdk.model.game.rules

import me.meeshy.sdk.model.game.AchievementRarity
import me.meeshy.sdk.model.game.FlameFormKey
import me.meeshy.sdk.model.game.GameFlameLaw
import me.meeshy.sdk.model.game.GameLevels
import me.meeshy.sdk.model.game.GameMaterial
import me.meeshy.sdk.model.game.GloryLaws
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.TreasuryTierKey
import me.meeshy.sdk.model.game.engagement.BadgeMaterialKey
import me.meeshy.sdk.model.game.engagement.GameBadgeTiers
import me.meeshy.sdk.model.game.engagement.RarityBorder
import me.meeshy.sdk.model.game.minHeld

/**
 * Les neuf familles de l'atlas illustré (iOS `GameRulesAtlas.Family`), dans l'ordre du document : ce que le joueur monte,
 * ce qu'il garde, ce qui le distingue, ce qu'il montre. Mee montre le geste, Meo explique la règle : ils se relaient.
 */
public enum class AtlasFamily(public val wire: String, public val speaker: GuideSpeaker) {
    Tiers("tiers", GuideSpeaker.Mee),
    Coin("coin", GuideSpeaker.Meo),
    Treasury("treasury", GuideSpeaker.Mee),
    Ranks("ranks", GuideSpeaker.Meo),
    Flames("flames", GuideSpeaker.Mee),
    Leagues("leagues", GuideSpeaker.Meo),
    Medals("medals", GuideSpeaker.Mee),
    Trophies("trophies", GuideSpeaker.Meo),
    Rarities("rarities", GuideSpeaker.Mee),
}

/** Les quatre faces de la Meesh (iOS `CoinPlate`) : l'avers, le revers numéroté, l'or de chaque centième, le prisme de chaque millième. */
public enum class AtlasCoinPlate(public val edition: MeeshEdition, public val number: Int) {
    Obverse(MeeshEdition.Silver, 13),
    Reverse(MeeshEdition.Silver, 13),
    Gold(MeeshEdition.Gold, 100),
    Prism(MeeshEdition.Prism, 1000),
    ;

    public val isReverse: Boolean get() = this != Obverse
}

/** Les trois formes d'un badge (iOS `MedalShape`), chacune dans la matière et avec l'inscription qu'iOS lui donne. */
public enum class AtlasMedalShape(public val material: GameMaterial, public val label: String?) {
    Accumulation(GameMaterial.Gold, "100"),
    Record(GameMaterial.Platinum, "100"),
    Collection(GameMaterial.Prism, null),
    ;

    public companion object {
        public const val COLLECTION_FILLED: Int = 4
        public const val COLLECTION_TOTAL: Int = 6
        public const val IMPRINT_LABEL: String = "−37"
    }
}

/** Les trophées (iOS `TrophyPlate`) : trois coupes de joute, la coupe du voyage, le trophée de renaissance couronné, celui de la Flamme. */
public enum class AtlasTrophyPlate(public val material: GameMaterial) {
    LeagueGold(GameMaterial.Gold),
    LeagueSilver(GameMaterial.Silver),
    LeagueBronze(GameMaterial.Bronze),
    Season(GameMaterial.Platinum),
    Prestige(GameMaterial.Prism),
    Flame(GameMaterial.Flame),
    ;

    public val isLeagueCup: Boolean get() = this == LeagueGold || this == LeagueSilver || this == LeagueBronze

    /** Mee et Meo couronnés à la base : le trophée de renaissance seul (iOS `TrophyView(figures:)`). */
    public val crowned: Boolean get() = this == Prestige
}

/** Un objet dessiné de l'atlas : ce que la vue pose, avec ce que sa légende dit. [id] est unique dans sa famille. */
public sealed interface AtlasPlate {
    public val id: String

    public data class Tier(val tier: LevelTierKey, val firstLevel: Int) : AtlasPlate {
        override val id: String get() = tier.name.lowercase()
    }

    public data class Coin(val plate: AtlasCoinPlate) : AtlasPlate {
        override val id: String get() = plate.name.lowercase()
    }

    /** [pile] : combien de pièces la pile dessine, une de plus à chaque palier. */
    public data class Treasury(val tier: TreasuryTierKey, val minHeld: Int, val pile: Int) : AtlasPlate {
        override val id: String get() = tier.name.lowercase()
    }

    /** [division5] : la plus basse (V) sous laquelle le blason se montre, `null` pour Mythe ; [minGlory] `null` pour Mythe. */
    public data class Rank(val rank: GloryRank, val division5: Int?, val minGlory: Int?) : AtlasPlate {
        override val id: String get() = rank.name.lowercase()
    }

    /** [andMore] : « 7 jours + » — la braise seule n'a pas de suite à dire. */
    public data class Flame(val form: FlameFormKey, val minDays: Int, val andMore: Boolean) : AtlasPlate {
        override val id: String get() = form.name.lowercase()
    }

    public data class League(val league: LeagueKey) : AtlasPlate {
        override val id: String get() = league.name.lowercase()
    }

    public data class MedalShape(val shape: AtlasMedalShape) : AtlasPlate {
        override val id: String get() = "shape-${shape.name.lowercase()}"
    }

    public data class MedalMaterial(val material: GameMaterial, val threshold: Int) : AtlasPlate {
        override val id: String get() = "material-${material.name.lowercase()}"
    }

    public data object MedalImprint : AtlasPlate {
        override val id: String get() = "imprint"
    }

    public data class Trophy(val plate: AtlasTrophyPlate) : AtlasPlate {
        override val id: String get() = plate.name.lowercase()
    }

    public data class Rarity(val rarity: AchievementRarity, val border: RarityBorder, val glory: Int) : AtlasPlate {
        override val id: String get() = rarity.name.lowercase()
    }
}

/** La règle des niveaux sous la grille des paliers (iOS `GameAtlasCopy.levelRules`, #9688) : nombres et rangs lus dans la loi. */
public sealed interface AtlasLevelRule {
    /** « Jusqu'au niveau [level] sous le rang [opening]. » */
    public data class CapBase(val level: Int, val opening: GloryRank) : AtlasLevelRule

    /** « Jusqu'au niveau [level] au rang [rank]. » */
    public data class CapOne(val level: Int, val rank: GloryRank) : AtlasLevelRule

    /** « Jusqu'au niveau [level] aux rangs [from] et [to]. » */
    public data class CapRanks(val level: Int, val from: GloryRank, val to: GloryRank) : AtlasLevelRule

    /** « Sans limite à partir du rang [from]. » */
    public data class CapNone(val from: GloryRank) : AtlasLevelRule

    public data class Prestige(val level: Int) : AtlasLevelRule

    public data class FirstPassGlory(val perLevel: Int, val upTo: Int, val perDecade: Int) : AtlasLevelRule
}

/**
 * L'ATLAS ILLUSTRÉ DU CARNET (miroir de `GameRulesAtlas`, iOS #9538) : quelles familles, dans quel ordre, avec quels
 * objets. Tout est DÉRIVÉ des lois du jeu (paliers, plafonds, trésor, Flamme, badges, raretés) : aucun nombre recopié
 * ne peut dériver de la règle qu'il illustre.
 */
public object GameRulesAtlas {

    public val families: List<AtlasFamily> = AtlasFamily.entries

    public fun plates(family: AtlasFamily): List<AtlasPlate> = when (family) {
        AtlasFamily.Tiers -> LevelTierKey.entries.map { AtlasPlate.Tier(it, GameLevels.tierStart(it)) }
        AtlasFamily.Coin -> AtlasCoinPlate.entries.map(AtlasPlate::Coin)
        AtlasFamily.Treasury -> TreasuryTierKey.entries.map { AtlasPlate.Treasury(it, it.minHeld, it.ordinal + 1) }
        AtlasFamily.Ranks -> GloryRank.entries.map(::rankPlate)
        AtlasFamily.Flames -> FlameFormKey.entries.map { form -> AtlasPlate.Flame(form, flameMinDays(form), form != FlameFormKey.Braise) }
        AtlasFamily.Leagues -> LeagueKey.entries.map(AtlasPlate::League)
        AtlasFamily.Medals -> medals
        AtlasFamily.Trophies -> AtlasTrophyPlate.entries.map(AtlasPlate::Trophy)
        AtlasFamily.Rarities -> AchievementRarity.entries.map { AtlasPlate.Rarity(it, RarityBorder.of(it), rarityGlory(it)) }
    }

    /** Les rangs qui ouvrent les niveaux, regroupés par plafond (iOS `levelCapBands`) : 499, 1000, puis sans limite. */
    public data class LevelCapBand(val cap: Int?, val ranks: List<GloryRank>)

    public val levelCapBands: List<LevelCapBand> = GloryRank.entries.fold(emptyList()) { bands, rank ->
        val cap = GloryLaws.levelCap(rank)
        val last = bands.lastOrNull()
        if (last != null && last.cap == cap) bands.dropLast(1) + last.copy(ranks = last.ranks + rank) else bands + LevelCapBand(cap, listOf(rank))
    }

    public val levelRules: List<AtlasLevelRule> = levelCapBands.mapNotNull(::capRule) + listOf(
        AtlasLevelRule.Prestige(GameLevels.PRESTIGE_LEVEL),
        AtlasLevelRule.FirstPassGlory(GloryLaws.POINTS_FIRST_LEVEL, GameLevels.LEGACY_MAX_LEVEL, GloryLaws.POINTS_LEVEL_DECADE),
    )

    /** Mythe : les cent premiers à atteindre ce seuil de Gloire. */
    public const val MYTH_SEATS: Int = GloryLaws.MYTHE_SIZE
    public const val MYTH_GLORY: Int = GloryLaws.MYTHE_GLORY

    private const val LOWEST_DIVISION = 5
    private const val LONGEST_FLAME_DAYS = 365

    private fun rankPlate(rank: GloryRank): AtlasPlate.Rank =
        AtlasPlate.Rank(rank, if (rank == GloryRank.Mythe) null else LOWEST_DIVISION, if (rank == GloryRank.Mythe) null else GloryLaws.minGlory(rank))

    private fun flameMinDays(form: FlameFormKey): Int = (1..LONGEST_FLAME_DAYS).first { GameFlameLaw.form(it) == form }

    private fun rarityGlory(rarity: AchievementRarity): Int =
        GloryLaws.gloryForAchievement(GloryLaws.AchievementRarity.entries[rarity.ordinal])

    private val medals: List<AtlasPlate> =
        AtlasMedalShape.entries.map(AtlasPlate::MedalShape) +
            GameBadgeTiers.materials.map { AtlasPlate.MedalMaterial(it.key.material(), it.threshold) } +
            AtlasPlate.MedalImprint

    private fun BadgeMaterialKey.material(): GameMaterial = when (this) {
        BadgeMaterialKey.CUIVRE -> GameMaterial.Copper
        BadgeMaterialKey.BRONZE -> GameMaterial.Bronze
        BadgeMaterialKey.ARGENT -> GameMaterial.Silver
        BadgeMaterialKey.OR -> GameMaterial.Gold
        BadgeMaterialKey.PLATINE -> GameMaterial.Platinum
        BadgeMaterialKey.OBSIDIENNE -> GameMaterial.Obsidian
        BadgeMaterialKey.PRISME -> GameMaterial.Prism
    }

    private fun capRule(band: LevelCapBand): AtlasLevelRule? {
        val first = band.ranks.firstOrNull() ?: return null
        val cap = band.cap ?: return AtlasLevelRule.CapNone(first)
        val opening = rankOpening(cap).takeIf { first == GloryRank.entries.first() }
        if (opening != null) return AtlasLevelRule.CapBase(cap, opening)
        val last = band.ranks.last()
        return if (band.ranks.size > 1) AtlasLevelRule.CapRanks(cap, first, last) else AtlasLevelRule.CapOne(cap, first)
    }

    private fun rankOpening(cap: Int): GloryRank? =
        GloryRank.entries.firstOrNull { rank -> GloryLaws.levelCap(rank).let { it == null || it > cap } }
}
