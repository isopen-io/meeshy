package me.meeshy.ui.theme

/** Les sept jetons de la table de mouvement (K26) : des verbes, jamais un écran. Liste fermée, la même sur iOS, Android et le web. */
public enum class MeeshyMotionToken { Morph, Travel, Flip, Collapse, Rise, Float, Pulse }

/** Les quatre retours de la table : léger, moyen, rigide, aucun. Une alerte (succès, erreur) n'en est pas un, elle reste à son site. */
public enum class MeeshyMotionHaptic { Light, Medium, Rigid, None }

/** Comment la valeur se lit : un ressort, une durée, le défilement qui conduit, une boucle, ou l'image de repos ([Still]). */
public enum class MeeshyMotionNature { Spring, Timed, Driven, Loop, Still }

/** L'instant du retour : un seul par jeton, jamais avant ni après le mouvement. */
public enum class MeeshyMotionHapticAt { Start, Landing, MidCourse, Lock, Never }

/**
 * La recette d'un jeton, en valeurs seules : ni vue, ni horloge, ni singleton. Miroir de `MeeshyMotionRecipe` (iOS).
 * `response` et `damping` sont ceux d'iOS (SwiftUI) ; la raideur Compose s'en déduit par [MeeshyMotion.stiffnessForResponse].
 */
public data class MeeshyMotionValues(
    val nature: MeeshyMotionNature,
    val durationMillis: Int,
    val response: Float?,
    val damping: Float?,
    val delayStepMillis: Int,
    val haptic: MeeshyMotionHaptic,
    val hapticAt: MeeshyMotionHapticAt,
)

public object MeeshyMotionRecipe {

    /** Sous « Réduire les animations » : un fondu court, décidé une fois pour toute l'app. */
    public const val REDUCED_FADE_MILLIS: Int = 160

    /** La course du repli piloté par le défilement, en dp : au bout, la barre se verrouille. */
    public const val COLLAPSE_RANGE_DP: Float = 220f

    /** La boucle d'ambiance `float` (9 s, va-et-vient doux) et le signal `pulse` (2,2 s, sortie douce). */
    public const val FLOAT_MILLIS: Int = 9000
    public const val PULSE_MILLIS: Int = 2200

    public fun resolve(token: MeeshyMotionToken, reduce: Boolean): MeeshyMotionValues {
        val full = full(token)
        if (!reduce) return full
        return when (full.nature) {
            MeeshyMotionNature.Loop -> MeeshyMotionValues(MeeshyMotionNature.Still, 0, null, null, 0, MeeshyMotionHaptic.None, MeeshyMotionHapticAt.Never)
            else -> full.copy(
                nature = MeeshyMotionNature.Timed,
                durationMillis = REDUCED_FADE_MILLIS,
                response = null,
                damping = null,
                delayStepMillis = 0,
            )
        }
    }

    private fun full(token: MeeshyMotionToken): MeeshyMotionValues = when (token) {
        MeeshyMotionToken.Morph -> spring(420, 0.42f, 0.7f, MeeshyMotionHaptic.Light, MeeshyMotionHapticAt.Start)
        MeeshyMotionToken.Travel -> spring(560, 0.56f, 0.82f, MeeshyMotionHaptic.Medium, MeeshyMotionHapticAt.Landing)
        MeeshyMotionToken.Flip -> spring(500, 0.5f, 0.86f, MeeshyMotionHaptic.Rigid, MeeshyMotionHapticAt.MidCourse)
        MeeshyMotionToken.Collapse ->
            MeeshyMotionValues(MeeshyMotionNature.Driven, 0, null, null, 0, MeeshyMotionHaptic.Light, MeeshyMotionHapticAt.Lock)
        MeeshyMotionToken.Rise ->
            spring(360, 0.36f, 0.86f, MeeshyMotionHaptic.None, MeeshyMotionHapticAt.Never).copy(delayStepMillis = MeeshyMotion.CASCADE_STEP_MILLIS)
        MeeshyMotionToken.Float -> loop(FLOAT_MILLIS)
        MeeshyMotionToken.Pulse -> loop(PULSE_MILLIS)
    }

    private fun spring(duration: Int, response: Float, damping: Float, haptic: MeeshyMotionHaptic, at: MeeshyMotionHapticAt) =
        MeeshyMotionValues(MeeshyMotionNature.Spring, duration, response, damping, 0, haptic, at)

    private fun loop(duration: Int) =
        MeeshyMotionValues(MeeshyMotionNature.Loop, duration, null, null, 0, MeeshyMotionHaptic.None, MeeshyMotionHapticAt.Never)
}
