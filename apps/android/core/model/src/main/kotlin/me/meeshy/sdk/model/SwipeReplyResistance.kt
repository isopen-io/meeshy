package me.meeshy.sdk.model

import kotlin.math.abs

/**
 * Loi partagée du glissé « répondre » d'un commentaire (iOS `CommentSwipeRules` + `BubbleSwipeResistance`) : engagement
 * 3:1 au-delà de 22 dp, piste 1:1 jusqu'à 72 dp puis élastique, seuil de 66 dp. Un commentaire n'a qu'une action, donc
 * seul le glissé vers la fin de lecture déplace la ligne.
 */
public object SwipeReplyResistance {
    public const val MINIMUM_DISTANCE: Float = 22f
    public const val DOMINANCE_RATIO: Float = 3f
    public const val ACTION_ZONE: Float = 72f
    public const val RUBBER_BAND_FACTOR: Float = 0.15f
    public const val COMMIT_DISTANCE: Float = 66f

    /** Vrai quand le geste `(dx, dy)` est un glissé horizontal franc ; sinon il appartient au défilement. */
    public fun shouldEngage(dx: Float, dy: Float): Boolean {
        val horizontal = abs(dx)
        return horizontal > abs(dy) * DOMINANCE_RATIO && horizontal > MINIMUM_DISTANCE
    }

    /** 1:1 dans la zone d'action, élastique au-delà ; symétrique en signe. */
    public fun trackedOffset(translation: Float): Float {
        val magnitude = abs(translation)
        if (magnitude <= ACTION_ZONE) return translation
        val sign = if (translation > 0f) 1f else -1f
        return sign * (ACTION_ZONE + (magnitude - ACTION_ZONE) * RUBBER_BAND_FACTOR)
    }

    /** Décalage affiché pour une translation en sens de lecture : jamais négatif. */
    public fun offset(translation: Float): Float = trackedOffset(translation).coerceAtLeast(0f)

    public fun repliesOnRelease(offset: Float): Boolean = offset >= COMMIT_DISTANCE

    public fun progress(offset: Float): Float = (offset / COMMIT_DISTANCE).coerceIn(0f, 1f)
}
