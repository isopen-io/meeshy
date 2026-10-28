package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryKeyframe

/**
 * Les nombres d'un objet de story publié par un TIERS (texte, sticker, keyframes) sont des données non
 * fiables : NaN, infinis, 1e30 ou négatifs ne doivent ni lever dans la mise en page ni geler le lecteur.
 * Chaque grandeur est bornée une fois, à la projection, par la règle de son sens. Aucune borne iOS n'existe
 * pour ces champs (le décodeur Swift les laisse tels quels) : les plafonds se calent sur le plus grand cran
 * du composeur (200 unités de dessin) et sur [SceneObjectScalePolicy] pour l'échelle.
 */
object SceneObjectNumbers {

    /** Taille de police par défaut d'un texte (`StoryTextObject.fontSize`), en design-pixels. */
    const val DEFAULT_FONT_SIZE: Double = 64.0
    const val MIN_FONT_SIZE: Double = 1.0

    /** 3× le plus grand cran du composeur (200) : assez pour tout texte authentique, sans permettre une police absurde. */
    const val MAX_FONT_SIZE: Double = 600.0

    /** Un centre normalisé peut sortir de la scène (objet rogné), pas la quitter à l'infini. */
    const val MIN_POSITION: Double = -1.0
    const val MAX_POSITION: Double = 2.0

    /** Un sticker ne couvre pas plus de quatre largeurs de scène. */
    const val MAX_STICKER_SIDE_FRACTION: Double = 4.0

    private const val CENTER: Double = 0.5
    private const val FULL_TURN: Double = 360.0
    private const val DESIGN_CANVAS_WIDTH: Double = 1080.0

    fun fontSize(value: Double): Double =
        if (value.isFinite() && value > 0.0) value.coerceIn(MIN_FONT_SIZE, MAX_FONT_SIZE) else DEFAULT_FONT_SIZE

    fun position(value: Double): Double =
        if (value.isFinite()) value.coerceIn(MIN_POSITION, MAX_POSITION) else CENTER

    fun opacity(value: Double): Double = if (value.isNaN()) 1.0 else value.coerceIn(0.0, 1.0)

    fun rotation(value: Double): Double = if (value.isFinite()) value.rem(FULL_TURN) else 0.0

    /** Un départ, une durée, un fondu : fini et positif ou nul (zéro : non borné, comme l'absence du champ). */
    fun seconds(value: Double): Double = if (value.isFinite() && value > 0.0) value else 0.0

    fun stickerSideFraction(baseSize: Double, scale: Double): Double {
        val base = if (baseSize.isFinite()) baseSize.coerceAtLeast(0.0) else 0.0
        return (base * SceneObjectScalePolicy.clamped(scale) / DESIGN_CANVAS_WIDTH).coerceAtMost(MAX_STICKER_SIDE_FRACTION)
    }

    fun keyframe(frame: StoryKeyframe): StoryKeyframe = frame.copy(
        time = if (frame.time.isFinite()) frame.time else 0f,
        x = frame.x?.takeIf { it.isFinite() }?.let(::position),
        y = frame.y?.takeIf { it.isFinite() }?.let(::position),
        scale = frame.scale?.takeIf { it.isFinite() }?.let(SceneObjectScalePolicy::clamped),
        opacity = frame.opacity?.takeIf { !it.isNaN() }?.let(::opacity),
    )
}
