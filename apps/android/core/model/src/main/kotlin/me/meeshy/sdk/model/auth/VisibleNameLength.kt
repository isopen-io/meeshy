package me.meeshy.sdk.model.auth

import java.text.BreakIterator
import java.text.Normalizer

/**
 * LA LONGUEUR D'UN NOM TELLE QUE LE LECTEUR LA VOIT — miroir de `packages/shared/utils/visible-name-length.ts`
 * (le TypeScript fait foi), la mesure que la passerelle applique au plancher des noms (#13825).
 *
 * Balises, invisibles et caractères de contrôle retirés, forme NFC, puis comptage des GRAPHÈMES qui portent
 * une lettre, un chiffre ou un émoji : « É » décomposé vaut 1, « 😀😀 » 2, « 🇫🇷🇨🇲 » 2, une lettre suivie d'une
 * marque de direction (U+200E), d'un gluon (U+2060) ou d'un trait d'union conditionnel (U+00AD) vaut 1, et un
 * remplissage hangul ne compte pas.
 *
 * Le JVM n'expose pas `Extended_Pictographic` sur toutes les versions d'Android : un graphème se VOIT ici s'il
 * porte une lettre, un chiffre, un symbole (catégories So, Sm) ou un point de code pictographique hors de ces
 * catégories. C'est une sur-approximation assumée de la mesure du serveur — jamais l'inverse : l'écran ne
 * refuse aucun nom que la passerelle accepte.
 */
public object VisibleNameLength {

    private val markupTag = Regex("<[^>]*>")
    private val invisibleOrControl = Regex("[\\u200B\\uFEFF\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\uFFF9-\\uFFFB]")
    private val hangulFillers = Regex("[\\u115F\\u1160\\u3164\\uFFA0]")

    /** Pictogrammes classés en ponctuation (‼ ⁉ 〰 〽) ; le reste des émojis est en So ou Sm. */
    private val pictographicPunctuation = setOf(0x203C, 0x2049, 0x3030, 0x303D)
    private const val PICTOGRAPHIC_PLANE_START = 0x1F000
    private const val PICTOGRAPHIC_PLANE_END = 0x1FFFD

    /** Le texte qu'un nom laisse voir une fois nettoyé : ce que la passerelle stocke, au rognage près. */
    public fun visibleText(value: String): String =
        Normalizer.normalize(value.replace(markupTag, "").replace(invisibleOrControl, ""), Normalizer.Form.NFC).trim()

    /** Combien de graphèmes VISIBLES porte ce nom. */
    public fun of(value: String): Int = graphemes(visibleText(value)).count(::isVisibleGrapheme)

    private fun graphemes(text: String): List<String> {
        val iterator = BreakIterator.getCharacterInstance().apply { setText(text) }
        return generateSequence(iterator.first()) { iterator.next().takeIf { it != BreakIterator.DONE } }
            .zipWithNext { start, end -> text.substring(start, end) }
            .toList()
    }

    private fun isVisibleGrapheme(grapheme: String): Boolean =
        grapheme.replace(hangulFillers, "").codePoints().anyMatch(::isVisibleCodePoint)

    private fun isVisibleCodePoint(codePoint: Int): Boolean = when (Character.getType(codePoint).toByte()) {
        Character.UPPERCASE_LETTER, Character.LOWERCASE_LETTER, Character.TITLECASE_LETTER,
        Character.MODIFIER_LETTER, Character.OTHER_LETTER,
        Character.DECIMAL_DIGIT_NUMBER, Character.LETTER_NUMBER, Character.OTHER_NUMBER,
        Character.OTHER_SYMBOL, Character.MATH_SYMBOL,
        -> true
        else -> codePoint in pictographicPunctuation || codePoint in PICTOGRAPHIC_PLANE_START..PICTOGRAPHIC_PLANE_END
    }
}
