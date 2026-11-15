package me.meeshy.sdk.model

import java.util.Locale

/** Drapeau emoji d'un code pays ISO-3166-1 alpha-2 (miroir de `CountryFlag.emoji` iOS). Invalide : vide. */
public object CountryFlag {
    private const val REGIONAL_BASE = 0x1F1E5

    public fun emoji(countryCode: String): String {
        val code = countryCode.uppercase(Locale.ROOT)
        if (code.length != 2 || !code.all { it in 'A'..'Z' }) return ""
        return code.map { String(Character.toChars(REGIONAL_BASE + (it - 'A' + 1))) }.joinToString("")
    }
}
