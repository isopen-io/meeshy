package me.meeshy.sdk.model.game

import java.text.NumberFormat
import java.util.Locale
import me.meeshy.sdk.model.format.CompactCountFormat
import me.meeshy.sdk.model.format.CompactPrecision

/**
 * Les nombres du jeu, écrits par la locale AVANT d'entrer dans la phrase :
 * séparateurs de la langue, chiffres arabes en arabe, un seul trou par nombre.
 * MIROIR de `GameCopy.formatCount` / `compactCount` (iOS).
 *
 * L'abrégé n'est pas réécrit ici : il vient de [CompactCountFormat], la source unique, à la
 * précision du jeu (une décimale à tous les paliers, iOS `.fractionLength(0...1)`).
 *
 * La [Locale] est injectée : aucune lecture de la locale ambiante ici.
 */
public object GameNumberFormat {

    /** Le seuil à partir duquel un texte serré passe au nombre compact. */
    public const val COMPACT_THRESHOLD: Int = 10_000

    public fun formatCount(count: Int, locale: Locale): String =
        NumberFormat.getIntegerInstance(locale).format(count.toLong())

    /** « 8,7 k » dès 10 000, le chiffre plein en dessous — pour les textes serrés (bandeau). */
    public fun tightCount(count: Int, locale: Locale): String =
        if (count < COMPACT_THRESHOLD) {
            formatCount(count, locale)
        } else {
            CompactCountFormat.text(count, locale, CompactPrecision.UP_TO_ONE_DECIMAL)
        }
}
