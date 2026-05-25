package me.meeshy.sdk.theme

import kotlin.math.min

/**
 * Faithful Kotlin port of the iOS `DynamicColorGenerator`
 * (packages/MeeshySDK/Sources/MeeshySDK/Theme/ColorGeneration.swift).
 *
 * Pure logic — no Android/Compose dependency — so it is unit-testable on the JVM.
 * Hex strings are uppercase, 6 chars, no leading '#'.
 */
object DynamicColorGenerator {

    enum class ConversationType { DIRECT, GROUP, COMMUNITY, CHANNEL, BOT }

    enum class ConversationLanguage {
        FRENCH, ENGLISH, SPANISH, GERMAN, JAPANESE,
        ARABIC, CHINESE, PORTUGUESE, ITALIAN, OTHER,
    }

    enum class ConversationTheme {
        GENERAL, WORK, SOCIAL, GAMING, MUSIC,
        SPORTS, TECH, ART, TRAVEL, FOOD,
    }

    enum class ThemeMode { DARK, LIGHT }

    data class ConversationContext(
        val name: String,
        val type: ConversationType = ConversationType.DIRECT,
        val language: ConversationLanguage = ConversationLanguage.FRENCH,
        val theme: ConversationTheme = ConversationTheme.GENERAL,
        val memberCount: Int = 2,
    )

    data class ColorPalette(
        val primary: String,
        val secondary: String,
        val accent: String,
        val saturationBoost: Double = 0.0,
    )

    private val languageColors = mapOf(
        ConversationLanguage.FRENCH to "3498DB",
        ConversationLanguage.ENGLISH to "E74C3C",
        ConversationLanguage.SPANISH to "F39C12",
        ConversationLanguage.GERMAN to "27AE60",
        ConversationLanguage.JAPANESE to "E91E63",
        ConversationLanguage.ARABIC to "F8B500",
        ConversationLanguage.CHINESE to "C0392B",
        ConversationLanguage.PORTUGUESE to "2ECC71",
        ConversationLanguage.ITALIAN to "1ABC9C",
        ConversationLanguage.OTHER to "9B59B6",
    )

    private val typeColors = mapOf(
        ConversationType.DIRECT to "FF6B6B",
        ConversationType.GROUP to "4ECDC4",
        ConversationType.COMMUNITY to "9B59B6",
        ConversationType.CHANNEL to "F8B500",
        ConversationType.BOT to "00CED1",
    )

    private val themeColors = mapOf(
        ConversationTheme.GENERAL to "4ECDC4",
        ConversationTheme.WORK to "3498DB",
        ConversationTheme.SOCIAL to "E91E63",
        ConversationTheme.GAMING to "2ECC71",
        ConversationTheme.MUSIC to "9B59B6",
        ConversationTheme.SPORTS to "F39C12",
        ConversationTheme.TECH to "00CED1",
        ConversationTheme.ART to "E74C3C",
        ConversationTheme.TRAVEL to "1ABC9C",
        ConversationTheme.FOOD to "FF7F50",
    )

    private val postTypeColors = mapOf(
        "POST" to "FF7F50",
        "STORY" to "9B59B6",
        "STATUS" to "00CED1",
    )

    private val postLanguageColors = mapOf(
        "fr" to "3498DB", "en" to "E74C3C", "es" to "F39C12",
        "de" to "27AE60", "ja" to "E91E63", "ar" to "F8B500",
        "zh" to "C0392B", "pt" to "2ECC71", "it" to "1ABC9C",
        "ko" to "6366F1", "ru" to "4F46E5", "hi" to "D946EF",
        "tr" to "EA580C", "nl" to "0891B2", "pl" to "16A34A",
        "sv" to "0EA5E9", "vi" to "EC4899", "th" to "CA8A04",
    )

    private val vibrantPalette = listOf(
        "E74C3C", "C0392B", "DC4A5A", "D94452", "F43F5E",
        "FF7F50", "E67E22", "F97316", "EA580C", "D4763B",
        "D97706", "B8860B", "CA8A04",
        "2ECC71", "27AE60", "059669", "16A34A", "22C55E",
        "1ABC9C", "14B8A6", "0D9488", "0891B2", "00CED1",
        "3498DB", "2980B9", "0EA5E9", "3B82F6", "2563EB",
        "6366F1", "4F46E5", "7C3AED", "6D28D9",
        "9B59B6", "A855F7", "D946EF", "C026D3",
        "EC4899", "E91E63", "DB2777",
    )

    fun colorFor(context: ConversationContext): ColorPalette {
        val langColor = languageColors[context.language] ?: "4ECDC4"
        val typeColor = typeColors[context.type] ?: "FF6B6B"
        val themeColor = themeColors[context.theme] ?: "4ECDC4"

        val saturationBoost = min(1.0, context.memberCount / 100.0) * 0.2
        val primary = blendColors(langColor, 0.3, typeColor, 0.3, themeColor, 0.4)

        return ColorPalette(
            primary = primary,
            secondary = shiftHue(primary, 30.0),
            accent = shiftHue(primary, -30.0),
            saturationBoost = saturationBoost,
        )
    }

    fun colorForPost(authorId: String, type: String?, originalLanguage: String?): String {
        val authorColor = colorForName(authorId)
        val typeColor = postTypeColors[type ?: "POST"] ?: "FF7F50"
        val langColor = postLanguageColors[originalLanguage ?: ""] ?: "4ECDC4"
        return blendColors(authorColor, 0.40, typeColor, 0.25, langColor, 0.35)
    }

    /** Deterministic color for any stable identifier (userId preferred over displayName). */
    fun colorForName(name: String): String {
        val index = (stableHash(name) % vibrantPalette.size.toULong()).toInt()
        return vibrantPalette[index]
    }

    /** DJB2 hash — deterministic across launches (overflow wraps via ULong). */
    private fun stableHash(input: String): ULong {
        var hash = 5381UL
        for (byte in input.toByteArray(Charsets.UTF_8)) {
            hash = ((hash shl 5) + hash) + byte.toUByte().toULong()
        }
        return hash
    }

    fun adaptedColor(hex: String, mode: ThemeMode): String {
        val (h, s, v) = rgbToHsv(hexToRgb(hex))
        val (newS, newV) = when (mode) {
            ThemeMode.DARK -> min(s * 1.1, 1.0) to maxOf(v, 0.70)
            ThemeMode.LIGHT -> maxOf(s, 0.70) to min(v, 0.60)
        }
        return rgbToHex(hsvToRgb(Triple(h, newS, newV)))
    }

    fun hueShiftedHex(hex: String, degrees: Double): String = shiftHue(hex, degrees)

    private fun shiftHue(hex: String, degrees: Double): String {
        val (h, s, v) = rgbToHsv(hexToRgb(hex))
        var newH = h + degrees / 360.0
        if (newH > 1) newH -= 1.0
        if (newH < 0) newH += 1.0
        return rgbToHex(hsvToRgb(Triple(newH, s, v)))
    }

    private fun blendColors(
        c1: String, w1: Double,
        c2: String, w2: Double,
        c3: String, w3: Double,
    ): String {
        val (r1, g1, b1) = hexToRgb(c1)
        val (r2, g2, b2) = hexToRgb(c2)
        val (r3, g3, b3) = hexToRgb(c3)
        val r = (r1 * w1 + r2 * w2 + r3 * w3).toInt()
        val g = (g1 * w1 + g2 * w2 + g3 * w3).toInt()
        val b = (b1 * w1 + b2 * w2 + b3 * w3).toInt()
        return rgbHex(min(255, r), min(255, g), min(255, b))
    }

    fun blendTwo(hex1: String, weight1: Double, hex2: String, weight2: Double): String {
        val (r1, g1, b1) = hexToRgb(hex1)
        val (r2, g2, b2) = hexToRgb(hex2)
        val r = (r1 * weight1 + r2 * weight2).toInt()
        val g = (g1 * weight1 + g2 * weight2).toInt()
        val b = (b1 * weight1 + b2 * weight2).toInt()
        return rgbHex(min(255, r), min(255, g), min(255, b))
    }

    private data class Rgb(val r: Int, val g: Int, val b: Int)

    private fun hexToRgb(hex: String): Rgb {
        val clean = hex.trim().removePrefix("#")
        val value = clean.toLongOrNull(16) ?: 0L
        return Rgb(
            r = ((value and 0xFF0000) shr 16).toInt(),
            g = ((value and 0x00FF00) shr 8).toInt(),
            b = (value and 0x0000FF).toInt(),
        )
    }

    private fun rgbToHex(rgb: Rgb): String = rgbHex(rgb.r, rgb.g, rgb.b)

    private fun rgbHex(r: Int, g: Int, b: Int): String =
        "%02X%02X%02X".format(r, g, b)

    /** RGB (0-255) → HSV with hue normalized to 0..1, matching iOS UIColor.getHue. */
    private fun rgbToHsv(rgb: Rgb): Triple<Double, Double, Double> {
        val r = rgb.r / 255.0
        val g = rgb.g / 255.0
        val b = rgb.b / 255.0
        val max = maxOf(r, g, b)
        val minC = minOf(r, g, b)
        val delta = max - minC

        val h = when {
            delta == 0.0 -> 0.0
            max == r -> 60.0 * (((g - b) / delta) % 6.0)
            max == g -> 60.0 * (((b - r) / delta) + 2.0)
            else -> 60.0 * (((r - g) / delta) + 4.0)
        }.let { if (it < 0) it + 360.0 else it }

        val s = if (max == 0.0) 0.0 else delta / max
        return Triple(h / 360.0, s, max)
    }

    /** HSV (hue 0..1) → RGB (0-255). */
    private fun hsvToRgb(hsv: Triple<Double, Double, Double>): Rgb {
        val (hNorm, s, v) = hsv
        val h = (hNorm * 360.0)
        val c = v * s
        val x = c * (1 - kotlin.math.abs((h / 60.0) % 2 - 1))
        val m = v - c
        val (r1, g1, b1) = when {
            h < 60 -> Triple(c, x, 0.0)
            h < 120 -> Triple(x, c, 0.0)
            h < 180 -> Triple(0.0, c, x)
            h < 240 -> Triple(0.0, x, c)
            h < 300 -> Triple(x, 0.0, c)
            else -> Triple(c, 0.0, x)
        }
        return Rgb(
            r = ((r1 + m) * 255).toInt(),
            g = ((g1 + m) * 255).toInt(),
            b = ((b1 + m) * 255).toInt(),
        )
    }
}
