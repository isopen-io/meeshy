package me.meeshy.sdk.model.game

/*
 * Les fragments d'étoile (#10011) : un objet de COLLECTION, qui ne se convertit en rien. MIROIR de
 * `packages/shared/utils/game/star-fragments.ts`. Le total se LIT (chaque source est idempotente) ;
 * le serveur en est la seule source, aucun client ne l'écrit.
 */
public object GameStarFragments {

    private const val SEASON_STEPS = 40

    /** Une étape de saison donne un fragment toutes les cinq étapes, sauf la dizaine (gel) et la 40e (coupe). */
    public fun seasonStepGivesFragment(step: Int): Boolean = step in 1 until SEASON_STEPS && step % 10 != 0 && step % 5 == 0

    /** Les étapes réclamées d'UNE saison qui donnent un fragment : une étape rejouée ne compte qu'une fois. */
    public fun seasonFragments(claimedSteps: List<Int>): Int = claimedSteps.toSet().count(::seasonStepGivesFragment)

    /** Le total collecté par un compte, toutes sources confondues. */
    public fun collected(chestDays: Int, seasons: List<List<Int>>): Int =
        maxOf(0, chestDays) + seasons.sumOf(::seasonFragments)
}
