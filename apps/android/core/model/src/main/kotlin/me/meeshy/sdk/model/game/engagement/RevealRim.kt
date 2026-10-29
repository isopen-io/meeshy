package me.meeshy.sdk.model.game.engagement

import me.meeshy.sdk.model.game.AchievementRarity
import me.meeshy.sdk.model.game.GameRarityEntry
import kotlin.math.roundToInt

/** Le trait du liseré de rareté (miroir de `RarityBorder`, iOS) : ardoise, bleu, violet, or, prisme tournant. */
public enum class RarityBorder {
    Slate, Blue, Violet, Gold, Prism;

    public companion object {
        public fun of(rarity: AchievementRarity): RarityBorder = when (rarity) {
            AchievementRarity.Common -> Slate
            AchievementRarity.Rare -> Blue
            AchievementRarity.Epic -> Violet
            AchievementRarity.Legendary -> Gold
            AchievementRarity.Mythic -> Prism
        }
    }
}

/**
 * La clé sous laquelle la passerelle MESURE la rareté d'un succès — celle du dictionnaire `achievementRarities`
 * (miroir de `EngagementReveal.achievementRarityKey`, iOS). `null` pour un badge, une série ou un niveau : la rareté
 * ne mesure que les succès.
 */
public val EngagementReveal.achievementRarityKey: String?
    get() = when (this) {
        is EngagementReveal.Achievement -> key.wire
        is EngagementReveal.ComposedAchievement -> family.key(tier)
        is EngagementReveal.Badge, is EngagementReveal.Streak, is EngagementReveal.Level -> null
    }

/**
 * **La rareté de la célébration** (miroir de `RevealRim`, iOS #9390) : lue dans le dernier bloc `game` CONNU, jamais au
 * réseau, et FAIL-CLOSED — une rareté non mesurée ne pose aucun liseré ; « Jeu masqué » retire le liseré avec le jeu.
 */
public object RevealRim {

    /** La rareté mesurée du succès célébré, ou `null` : un badge, une série, un niveau, une rareté absente, un jeu masqué. */
    public fun entry(reveal: EngagementReveal, rarities: Map<String, GameRarityEntry>?, hidden: Boolean): GameRarityEntry? =
        if (hidden) null else reveal.achievementRarityKey?.let { rarities?.get(it) }

    /** Le liseré à poser : celui de la rareté qu'on a le DROIT de montrer, `null` sinon. */
    public fun border(entry: GameRarityEntry?): RarityBorder? = entry?.visibleRarity?.let(RarityBorder::of)

    /** Ce que la ligne sous le titre dit : la rareté nommée avec sa part, ou « en cours de mesure », ou rien. */
    public sealed interface Line {
        public data class Measured(val rarity: AchievementRarity, val sharePercent: Double) : Line
        public data object Measuring : Line
    }

    public fun line(entry: GameRarityEntry?): Line? = when {
        entry == null -> null
        entry.visibleRarity != null -> Line.Measured(entry.visibleRarity!!, entry.sharePercent)
        else -> Line.Measuring
    }

    /** Sous un dixième de pour cent, la part s'écrit « < 0,1 % » et jamais plus bas. */
    public fun isBelowTenth(share: Double): Boolean = share < 0.1

    /** (décimales, valeur arrondie) : entiers dès 1 %, une décimale sous 1 %, plancher à 0,1. */
    public fun percentDigits(share: Double): Pair<Int, Double> = when {
        share < 0.1 -> 1 to 0.1
        share < 1 -> 1 to (share * 10).roundToInt() / 10.0
        else -> 0 to share.roundToInt().toDouble()
    }
}
