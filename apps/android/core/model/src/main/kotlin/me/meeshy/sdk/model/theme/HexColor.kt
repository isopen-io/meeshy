package me.meeshy.sdk.model.theme

import kotlin.math.pow
import kotlin.math.sqrt

/** Encre lisible sur une surface teintée : noir ou blanc. */
enum class InkColor {
    BLACK, WHITE;

    companion object {
        /**
         * Celle des deux encres qui rend le PLUS de contraste WCAG. À égalité exacte de contraste
         * (luminance == [HexColor.INK_SWITCH_LUMINANCE]) le blanc est élu, comme `luminance > pivot ?
         * noir : blanc` d'iOS `Color.readableInk`.
         */
        fun forLuminance(luminance: Double): InkColor =
            if (luminance > HexColor.INK_SWITCH_LUMINANCE) BLACK else WHITE
    }
}

/**
 * Analyseur hexadécimal UNIQUE (miroir de `HexColor.swift`, `Color(hex:)` iOS). Formes : `RRGGBB`,
 * `RRGGBBAA` (alpha en DERNIER, convention du dépôt), `RGB`, préfixe `#` optionnel, espaces de bord
 * ignorés. Toute autre entrée rend `null` (l'UI la traduit en `Color.Unspecified`).
 */
data class HexColor(val red: Int, val green: Int, val blue: Int, val alpha: Int = 255) {

    val alphaFraction: Double get() = alpha / 255.0

    /** Luminance relative WCAG 2.x dans [0, 1] (l'alpha n'y entre pas). */
    val luminance: Double
        get() = 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)

    val readableInk: InkColor get() = InkColor.forLuminance(luminance)

    companion object {
        /** `L = √(0,05 × 1,05) − 0,05 ≈ 0,179` : égalité de contraste entre noir et blanc. */
        val INK_SWITCH_LUMINANCE: Double = sqrt(0.05 * 1.05) - 0.05

        fun parse(hex: String): HexColor? {
            val digits = hex.trim().removePrefix("#")
            if (digits.any { Character.digit(it, 16) < 0 || it.code > 127 }) return null
            return when (digits.length) {
                3 -> HexColor(nibble(digits[0]) * 17, nibble(digits[1]) * 17, nibble(digits[2]) * 17)
                6 -> HexColor(byte(digits, 0), byte(digits, 2), byte(digits, 4))
                8 -> HexColor(byte(digits, 0), byte(digits, 2), byte(digits, 4), byte(digits, 6))
                else -> null
            }
        }

        private fun nibble(c: Char): Int = Character.digit(c, 16)

        private fun byte(s: String, at: Int): Int = nibble(s[at]) * 16 + nibble(s[at + 1])

        private fun channel(value: Int): Double {
            val c = value / 255.0
            return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
        }
    }
}
