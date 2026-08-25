package me.meeshy.sdk.model

import kotlin.random.Random

/**
 * The story-composer background authoring palette — the Android port of iOS's
 * `StoryBackgroundPalette` (`packages/MeeshySDK/.../MeeshyUI/Story/StoryComposerSupportTypes.swift`).
 *
 * It owns the picker's preset solid colours and gradient pairs and the soft-pastel
 * random generator. Everything here is **pure**: no `Color`, no clock — the RNG is
 * injected so the composer/ViewModel stay glue and the generation rule lives in one
 * unit-tested place. Values are hex **without** `#`, the exact form
 * `StoryEffects.background` carries and [StoryBackgroundValue] round-trips.
 */
object StoryBackgroundPalette {

    /** The 17 preset solid colours, hex without `#` (iOS `colors`, uppercased for the wire). */
    val SOLID_COLORS: List<String> = listOf(
        "0F0C29", "302B63", "24243E", "1A1A2E", "16213E",
        "FF2E63", "E94057", "F27121", "F8B500", "2ECC71",
        "08D9D6", "3498DB", "9B59B6", "45B7D1", "FF6B6B",
        "000000", "FFFFFF",
    )

    /** The 6 preset two-colour gradient pairs `(start, end)` (iOS `gradients`). */
    val GRADIENTS: List<Pair<String, String>> = listOf(
        "FF2E63" to "08D9D6",
        "9B59B6" to "FF6B6B",
        "F8B500" to "FF2E63",
        "0F0C29" to "302B63",
        "1A1A2E" to "E94057",
        "2ECC71" to "3498DB",
    )

    /**
     * The full picker roster as authored [StoryBackgroundValue]s — the solids as
     * [StoryBackgroundValue.Hex] then the gradients as [StoryBackgroundValue.Gradient],
     * so the composer can render one uniform swatch list and hand the chosen value
     * straight to the deck.
     */
    fun presets(): List<StoryBackgroundValue> =
        SOLID_COLORS.map { StoryBackgroundValue.Hex(it) } +
            GRADIENTS.map { (start, end) -> StoryBackgroundValue.Gradient(start, end) }

    /**
     * A soft-pastel random hex — low saturation + very high brightness, so the picker
     * tiles and text overlays stay legible on top (iOS `randomBackgroundColor()`). The
     * pick never collides with a preset [SOLID_COLORS] entry. Pure given [random].
     */
    fun randomPastelHex(random: Random = Random.Default): String {
        val presets = SOLID_COLORS.toHashSet()
        while (true) {
            val hue = random.nextDouble(0.0, 1.0)
            val saturation = random.nextDouble(0.14, 0.24)
            val brightness = random.nextDouble(0.93, 0.98)
            val hex = hsbToHex(hue, saturation, brightness)
            if (hex !in presets) return hex
        }
    }

    /** [randomPastelHex] wrapped as the authored [StoryBackgroundValue.Hex] the deck stores. */
    fun randomPastel(random: Random = Random.Default): StoryBackgroundValue.Hex =
        StoryBackgroundValue.Hex(randomPastelHex(random))

    /**
     * Converts an HSB colour (each component in `[0, 1]`) to an uppercase six-digit
     * RGB hex without `#`, matching iOS `UIColor(hue:saturation:brightness:)` +
     * `String(format: "%02X%02X%02X", Int(r*255), …)` (truncating toward zero).
     */
    fun hsbToHex(hue: Double, saturation: Double, brightness: Double): String {
        val sector = (hue * 6.0)
        val index = sector.toInt() % 6
        val f = sector - sector.toInt()
        val p = brightness * (1.0 - saturation)
        val q = brightness * (1.0 - f * saturation)
        val t = brightness * (1.0 - (1.0 - f) * saturation)
        val (r, g, b) = when (index) {
            0 -> Triple(brightness, t, p)
            1 -> Triple(q, brightness, p)
            2 -> Triple(p, brightness, t)
            3 -> Triple(p, q, brightness)
            4 -> Triple(t, p, brightness)
            else -> Triple(brightness, p, q)
        }
        return "%02X%02X%02X".format((r * 255).toInt(), (g * 255).toInt(), (b * 255).toInt())
    }
}
