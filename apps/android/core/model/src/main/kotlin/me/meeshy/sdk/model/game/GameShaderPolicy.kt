package me.meeshy.sdk.model.game

/** Le chemin de rendu d'un effet du jeu : shader AGSL (API 33+) ou dégradé statique du socle. */
enum class GameShaderPath { AGSL, GRADIENT }

/**
 * Le choix du chemin et les gardes de « quand l'effet joue » — pures, hors des Composables (miroir des
 * garanties de `GameShaders.swift` : shader récent, repli sans shader, Reduce Motion, hors du temps rien).
 */
object GameShaderPolicy {
    const val AGSL_MIN_SDK: Int = 33
    const val MAX_SHEEN_PASSES: Int = 3

    /** Mouvement réduit : le repli statique sur toutes les API, jamais de shader animé. */
    fun path(sdkInt: Int, reduceMotion: Boolean): GameShaderPath =
        if (!reduceMotion && sdkInt >= AGSL_MIN_SDK) GameShaderPath.AGSL else GameShaderPath.GRADIENT

    fun sheenPlays(progress: Double, intensity: Double, reduceMotion: Boolean): Boolean =
        !reduceMotion && GameEffectsLaw.isActive(progress) && intensity > 0

    fun wavePlays(progress: Double, amplitude: Float, reduceMotion: Boolean): Boolean =
        !reduceMotion && GameEffectsLaw.isActive(progress) && amplitude > 0f

    /** L'irisation reste posée sous mouvement réduit (figée) ; seule une intensité nulle l'ôte. */
    fun iridescencePlays(intensity: Double): Boolean = intensity > 0

    fun iridescenceTilt(tilt: Double, reduceMotion: Boolean): Double = GameEffectsLaw.effectiveTilt(tilt, reduceMotion)

    /** Règle de l'hôte : le reflet s'arrête après trois passages. */
    fun sheenMayReplay(passesPlayed: Int): Boolean = passesPlayed < MAX_SHEEN_PASSES
}
