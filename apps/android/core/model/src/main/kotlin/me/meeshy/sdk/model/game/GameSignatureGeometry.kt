package me.meeshy.sdk.model.game

/**
 * La Signature Meeshy (miroir de `SignatureMark.swift`) : trois traits 500 · 400 · 300 dans un carré
 * de 1 024, opacités 0,7 · 1 · 0,75, jamais déformés. Trois styles : plate, frappée (relief), gravée (creux).
 */
enum class GameSignatureStyle { FLAT, STRUCK, ENGRAVED }

object GameSignatureGeometry {

    const val VIEWPORT: Float = 1024f
    const val DEFAULT_STROKE_WIDTH: Float = 92f

    /** Un trait : de (x0, y) à (x1, y) dans le carré de 1 024, avec son opacité propre. */
    data class Dash(val x0: Float, val x1: Float, val y: Float, val opacity: Float) {
        val length: Float get() = x1 - x0
    }

    val dashes: List<Dash> = listOf(
        Dash(262f, 762f, 384f, 0.7f),
        Dash(262f, 662f, 512f, 1f),
        Dash(262f, 562f, 640f, 0.75f),
    )

    enum class Tint { SHADOW, WHITE, INK }

    /**
     * Une couche : les trois traits à leurs opacités propres ([uniformOpacity] nul) ou tous à
     * [uniformOpacity], décalés de ([dx], [dy]) en fractions du côté.
     */
    data class Layer(val tint: Tint, val uniformOpacity: Float?, val dx: Float, val dy: Float)

    fun layers(style: GameSignatureStyle): List<Layer> = when (style) {
        GameSignatureStyle.FLAT -> listOf(Layer(Tint.INK, null, 0f, 0f))
        GameSignatureStyle.STRUCK -> listOf(
            Layer(Tint.SHADOW, 0.5f, 0.018f, 0.022f),
            Layer(Tint.WHITE, 0.85f, -0.012f, -0.014f),
            Layer(Tint.INK, null, 0f, 0f),
        )
        GameSignatureStyle.ENGRAVED -> listOf(
            Layer(Tint.WHITE, 0.35f, 0.012f, 0.016f),
            Layer(Tint.INK, 0.85f, 0f, 0f),
        )
    }

    /** L'épaisseur du trait pour un carré de [side] unités. */
    fun lineWidth(strokeWidth: Float, side: Float): Float = strokeWidth * side / VIEWPORT
}
