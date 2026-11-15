package me.meeshy.sdk.model.game.pages

import me.meeshy.sdk.model.game.GameSeason
import me.meeshy.sdk.model.game.GameSeasonBlock
import me.meeshy.sdk.model.game.SeasonRewardBlock

/** L'état d'une halte, dit par le TEXTE et pas seulement par la couleur. */
public enum class SeasonStepState { Claimed, Ready, Locked }

/**
 * Le parcours d'une saison tel que la passerelle le sert (iOS `GameSeasonStepState`, `GameSeasonScreen`) : il lit
 * `claimedSteps` et `steps`, il ne calcule aucune récompense à la place du serveur — la récompense d'une étape est la
 * LOI partagée ([GameSeason.stepReward]), aux points de LA saison.
 */
public object SeasonPath {

    public fun state(step: Int, season: GameSeasonBlock): SeasonStepState = when {
        step in season.claimedSteps -> SeasonStepState.Claimed
        step <= season.steps -> SeasonStepState.Ready
        else -> SeasonStepState.Locked
    }

    public fun reward(step: Int, season: GameSeasonBlock): SeasonRewardBlock? =
        GameSeason.stepReward(step, season.stepPoints)

    /** Les quarante haltes, de 1 à [GameSeason.STEPS]. */
    public val steps: List<Int> = (1..GameSeason.STEPS).toList()

    /** Les haltes qui portent un Sceau : une toutes les [GameSeason.SEAL_EVERY]. */
    public val sealSteps: List<Int> = (GameSeason.SEAL_EVERY..GameSeason.STEPS step GameSeason.SEAL_EVERY).toList()

    /** Une pastille du Sceau est allumée quand le Sceau est possédé ET la halte atteinte. */
    public fun sealLit(step: Int, season: GameSeasonBlock): Boolean = season.sealOwned && step <= season.steps

    /** Le thème d'une saison : aujourd'hui une langue (`language:sw`) ; un thème inconnu ne se nomme pas. */
    public fun themeLanguage(themeKey: String): String? {
        val parts = themeKey.split(':', limit = 2)
        return parts.takeIf { it.size == 2 && it[0] == "language" && it[1].isNotEmpty() }?.get(1)
    }
}
