package me.meeshy.sdk.model.avatar

/** Mouvement de la pastille d'humeur : respire, se tait (plein écran du pair) ou reste immobile. */
public enum class MoodMotion { BREATHE, HUSH, STILL }

/** Lois pures de `MeeshyMoodBadge` (MoodBadge.swift). */
public object MoodBadgeMotion {
    public const val RESTING_SCALE: Float = 1.0f
    public const val PULSED_SCALE: Float = 1.18f
    public const val HUSHED_SCALE: Float = 1.05f
    public const val HUSHED_DURATION_MILLIS: Int = 1600
    public const val SPRING_RESPONSE: Float = 0.5f
    public const val SPRING_DAMPING: Float = 0.4f

    /** Départ décalé au hasard : sans lui, N pastilles respirent à l'unisson. */
    public const val MAXIMUM_START_DELAY_MILLIS: Int = 1500

    /** Fenêtre de respiration après l'apparition (~4 cycles de ressort), puis la pastille SE POSE. */
    public const val BREATHING_DURATION_MILLIS: Int = 8000

    /** Le glyphe occupe cette fraction du cadre ; le cadre porte la place et la zone de toucher. */
    public const val GLYPH_RATIO: Float = 0.65f

    /** Cible tactile minimale Android (Material) ; plus grande que les 44 pt iOS. */
    public const val MINIMUM_HIT_TARGET: Float = 48f

    /** Réduire les animations ÉTEINT le mouvement, il ne le raccourcit pas ; il ne l'ajoute jamais. */
    public fun shouldAnimate(animates: Boolean, reduceMotion: Boolean): Boolean = animates && !reduceMotion

    public fun motion(animates: Boolean, reduceMotion: Boolean, hushed: Boolean): MoodMotion = when {
        !shouldAnimate(animates, reduceMotion) -> MoodMotion.STILL
        hushed -> MoodMotion.HUSH
        else -> MoodMotion.BREATHE
    }

    /** Zone de toucher : déborde la pastille sans rien déplacer, jamais sous [MINIMUM_HIT_TARGET]. */
    public fun hitDiameter(diameter: Float): Float = maxOf(MINIMUM_HIT_TARGET, diameter)

    /** Épaisseur du contour : proportionnelle à la pastille, jamais un filet. */
    public fun outlineWidth(diameter: Float): Float = maxOf(1.5f, diameter * 0.07f)
}
