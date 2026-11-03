package me.meeshy.sdk.model

/**
 * La peau des bulles d'une conversation (miroir de `BubbleSkin` iOS, #10753).
 *
 * Sans accent personnel (« Automatique »), la bulle ENVOYÉE garde l'indigo de marque et son encre
 * blanche ; avec un accent personnel elle le prend, avec l'encre noire ou blanche qui contraste le
 * plus. La bulle REÇUE est un aplat OPAQUE : l'accent se mêle à la surface de l'app (jamais à la
 * transparence) et un liseré fin la cerne. Aucun dégradé, aucune ombre par bulle.
 */
data class BubbleSkinSpec(val sentFillHex: String, val sentInk: BubbleInk) {

    /** L'accent qu'une pièce posée sur une bulle reçoit : celui de la bulle envoyée pour moi, sinon celui du reçu. */
    fun accentHex(isMe: Boolean, receivedHex: String): String = if (isMe) sentFillHex else receivedHex

    companion object {
        val BRAND = BubbleSkinSpec(BubbleSkinLaw.BRAND_PRIMARY_HEX, BubbleInk.WHITE)

        fun resolve(personalAccentHex: String?): BubbleSkinSpec {
            val accent = personalAccentHex?.trim()?.removePrefix("#")?.takeIf { it.length == 6 } ?: return BRAND
            val hex = accent.uppercase()
            return BubbleSkinSpec(hex, BubbleInk.readableOn(hex))
        }
    }
}

object BubbleSkinLaw {
    const val BRAND_PRIMARY_HEX: String = "6366F1"
    const val SURFACE_LIGHT_HEX: String = "FFFFFF"
    const val SURFACE_DARK_HEX: String = "09090B"

    /** Poids de l'accent dans le fond d'une bulle reçue. */
    const val RECEIVED_WEIGHT_LIGHT: Double = 0.16
    const val RECEIVED_WEIGHT_DARK: Double = 0.28

    /** Opacité du liseré d'une bulle reçue. */
    const val RECEIVED_STROKE_ALPHA_LIGHT: Float = 0.26f
    const val RECEIVED_STROKE_ALPHA_DARK: Float = 0.34f

    const val RECEIVED_STROKE_WIDTH_DP: Float = 1f

    /** Rayon du fond, du liseré et de la bordure arc-en-ciel des effets. */
    const val CORNER_RADIUS_DP: Float = 18f

    /** Espaceur minimal côté opposé : l'écart qui distingue envoyé et reçu. */
    const val MIN_SPACER_DP: Float = 50f

    fun receivedStrokeAlpha(isDark: Boolean): Float =
        if (isDark) RECEIVED_STROKE_ALPHA_DARK else RECEIVED_STROKE_ALPHA_LIGHT

    /** L'accent de l'expéditeur mêlé à 30 % dans l'indigo de marque (`otherBubbleColor` iOS). */
    fun receivedAccentHex(senderHex: String?): String =
        blend(senderHex ?: BRAND_PRIMARY_HEX, 0.30, BRAND_PRIMARY_HEX, 0.70)

    /** Le fond OPAQUE d'une bulle reçue : l'accent à 16 % (clair) / 28 % (sombre) sur la surface. */
    fun receivedFillHex(accentHex: String, isDark: Boolean): String {
        val weight = if (isDark) RECEIVED_WEIGHT_DARK else RECEIVED_WEIGHT_LIGHT
        return blend(accentHex, weight, if (isDark) SURFACE_DARK_HEX else SURFACE_LIGHT_HEX, 1.0 - weight)
    }

    /** Miroir de `DynamicColorGenerator.blendTwo` (troncature entière, comme iOS). */
    fun blend(hex1: String, weight1: Double, hex2: String, weight2: Double): String {
        val a = rgb(hex1)
        val b = rgb(hex2)
        fun mix(i: Int) = minOf(255, (a[i] * weight1 + b[i] * weight2).toInt())
        return "%02X%02X%02X".format(mix(0), mix(1), mix(2))
    }

    private fun rgb(hex: String): IntArray {
        val value = hex.trim().removePrefix("#").toLongOrNull(16) ?: 0L
        return intArrayOf(((value shr 16) and 0xFF).toInt(), ((value shr 8) and 0xFF).toInt(), (value and 0xFF).toInt())
    }
}
