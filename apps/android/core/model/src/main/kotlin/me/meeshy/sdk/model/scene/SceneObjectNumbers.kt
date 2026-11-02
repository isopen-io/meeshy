package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryKeyframe

/**
 * Les nombres d'un objet de story publié par un TIERS (texte, sticker, keyframes) sont des données non
 * fiables : NaN, infinis, 1e30 ou négatifs ne doivent ni lever dans la mise en page ni geler le lecteur.
 * Chaque grandeur est bornée une fois, à la projection, par la règle de son sens. Aucune borne iOS n'existe
 * pour ces champs (le décodeur Swift les laisse tels quels) : les plafonds se calent sur le plus grand cran
 * du composeur (200 unités de dessin). L'échelle n'en a aucun (#14298) : [SceneObjectScalePolicy.served] ne
 * garde que sa finitude, et le lecteur coupe sa taille entre mise en page et calque ([LayeredScale]).
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

    /** Jusqu'où la mise en page d'un sticker suit son côté, en largeurs de scène ; au-delà, son calque l'agrandit. */
    const val MAX_STICKER_LAYOUT_FRACTION: Double = 4.0

    /** Les bornes du ratio d'un média que la passerelle accepte (`StoryMediaObjectSchema.aspectRatio`). */
    const val MIN_ASPECT_RATIO: Double = 0.05
    const val MAX_ASPECT_RATIO: Double = 20.0

    /**
     * Objets d'une même famille (textes, médias, stickers, puces) et keyframes d'un objet qu'une slide lit au plus : le plafond
     * d'un document v3 (`CanvasV3Schema.objects`, 60), que la forme v1 (32 par famille) ne dépasse pas. Au-delà,
     * chaque objet de plus recompose à chaque image du lecteur : des milliers d'objets le gèlent.
     */
    const val MAX_OBJECTS_PER_FAMILY: Int = 60

    /** Deux fois le plafond d'un texte de story à la passerelle (`STORY_TEXT_MAX`, 2000) : un texte plus long ne vient que d'un tiers. */
    const val MAX_TEXT_CHARS: Int = 4000

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

    fun aspectRatio(value: Double): Double =
        if (value.isFinite() && value > 0.0) value.coerceIn(MIN_ASPECT_RATIO, MAX_ASPECT_RATIO) else 1.0

    /** Une épaisseur de trait finie, positive ou nulle, au plus la largeur de la scène de référence. */
    fun strokeWidth(value: Double): Double =
        if (value.isFinite() && value > 0.0) value.coerceAtMost(DESIGN_CANVAS_WIDTH) else 0.0

    fun <T> capped(objects: List<T>): List<T> =
        if (objects.size <= MAX_OBJECTS_PER_FAMILY) objects else objects.take(MAX_OBJECTS_PER_FAMILY)

    /** Un texte coupé à [MAX_TEXT_CHARS], sans jamais séparer une paire de substitution. */
    fun text(value: String): String {
        if (value.length <= MAX_TEXT_CHARS) return value
        val cut = value.take(MAX_TEXT_CHARS)
        return if (cut.last().isHighSurrogate()) cut.dropLast(1) else cut
    }

    /** Le côté d'un sticker en largeurs de scène, à son échelle entière : fini, sans plafond. */
    fun stickerSideFraction(baseSize: Double, scale: Double): Double {
        val base = if (baseSize.isFinite()) baseSize.coerceAtLeast(0.0) else 0.0
        val side = base * SceneObjectScalePolicy.served(scale) / DESIGN_CANVAS_WIDTH
        return if (side.isFinite()) side else Double.MAX_VALUE
    }

    fun keyframe(frame: StoryKeyframe): StoryKeyframe = frame.copy(
        time = if (frame.time.isFinite()) frame.time else 0f,
        x = frame.x?.takeIf { it.isFinite() }?.let(::position),
        y = frame.y?.takeIf { it.isFinite() }?.let(::position),
        scale = frame.scale?.takeIf { it.isFinite() }?.let(SceneObjectScalePolicy::served),
        opacity = frame.opacity?.takeIf { !it.isNaN() }?.let(::opacity),
    )
}
