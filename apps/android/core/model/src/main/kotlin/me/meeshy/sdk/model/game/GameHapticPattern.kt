package me.meeshy.sdk.model.game

/** Un toucher du motif : à quel instant ([timeSeconds] depuis le début), avec quelle force. */
data class GameHapticTap(
    val timeSeconds: Double,
    val intensity: Float,
    val sharpness: Float,
)

/**
 * Les motifs haptiques du jeu, en DONNÉES (miroir de `GameHapticPattern`) : frappe « choc net, léger
 * rebond » ; rang « trois tapes, une par trait » ; niveau gagné et badge allumé « tape légère » ;
 * coffre « une tape par récompense » ; niveau perdu : aucune. Le motif se prouve sans moteur haptique.
 */
object GameHapticPattern {

    /** Le choc net de la frappe à 0,45 s (le « tchak »), puis un léger rebond à 0,54 s. */
    val strike: List<GameHapticTap> = listOf(
        GameHapticTap(0.45, 1.0f, 1.0f),
        GameHapticTap(0.54, 0.45f, 0.55f),
    )

    /** La frappe EN PLACE : le choc tombe au déclenchement, sans le préambule de la scène. */
    val strikeInPlace: List<GameHapticTap> = listOf(
        GameHapticTap(0.0, 1.0f, 1.0f),
        GameHapticTap(0.09, 0.45f, 0.55f),
    )

    /** Un coup de la cérémonie : une tape franche, et au DERNIER coup le choc net de la frappe. */
    fun ceremonyBlow(final: Boolean): List<GameHapticTap> =
        if (final) strikeInPlace else listOf(GameHapticTap(0.0, 0.6f, 0.75f))

    /** Une tape par trait de la Signature qui se grave. */
    val rank: List<GameHapticTap> = listOf(
        GameHapticTap(0.55, 0.55f, 0.6f),
        GameHapticTap(0.8, 0.7f, 0.7f),
        GameHapticTap(1.05, 0.9f, 0.85f),
    )

    val levelGain: List<GameHapticTap> = listOf(GameHapticTap(0.45, 0.4f, 0.5f))

    val badgeLit: List<GameHapticTap> = listOf(GameHapticTap(0.5, 0.4f, 0.5f))

    /** Le niveau perdu ne vibre pas. */
    val levelLoss: List<GameHapticTap> = emptyList()

    /** Une tape par récompense, au moment où elle monte du coffre. */
    fun chest(rewards: Int): List<GameHapticTap> =
        (0 until maxOf(0, rewards)).map { GameHapticTap(0.5 + it * 0.3, 0.55f, 0.6f) }
}
