package me.meeshy.sdk.model.composer

/**
 * Les hashtags d'une publication, DÉRIVÉS de son texte, jamais déclarés à côté — miroir de
 * `ComposerHashtags` (iOS). Un `#voyage` écrit dans la phrase EST le hashtag ; l'outil écrit
 * dans le texte et la feuille d'audience ne fait que MONTRER ce que le texte contient.
 *
 * Un `#` précédé d'un caractère de nom appartient à autre chose (`a#b`, ancre d'URL) ; à
 * droite, la balise s'arrête au premier caractère qui n'est ni lettre, ni chiffre, ni `_`.
 */
object ComposerHashtags {

    private const val NAME = "\\p{L}\\p{N}_"
    private val tagRegex = Regex("(?<![$NAME])#([$NAME]+)")

    /** Les balises, sans `#`, dans l'ordre d'écriture, dédoublonnées sans égard à la casse. */
    fun tags(text: String): List<String> {
        val seen = mutableSetOf<String>()
        return tagRegex.findAll(text)
            .map { it.groupValues[1] }
            .filter { seen.add(it.lowercase()) }
            .toList()
    }

    /** Écrit [tag] à la fin de [text] (espace si besoin) ; sans effet s'il y est déjà ou s'il est vide. */
    fun inserting(tag: String, text: String): String {
        val clean = tag.trim('#', ' ')
        if (clean.isEmpty()) return text
        if (tags(text).any { it.equals(clean, ignoreCase = true) }) return text
        if (text.isEmpty()) return "#$clean"
        val separator = if (text.last().isWhitespace()) "" else " "
        return "$text$separator#$clean"
    }

    /** Retire [tag] (et l'espace qui le suit) de [text] ; une balise plus longue n'est jamais touchée. */
    fun removing(tag: String, text: String): String {
        val pattern = Regex(
            "(?<![$NAME])#${Regex.escape(tag)}(?![$NAME])\\s?",
            RegexOption.IGNORE_CASE,
        )
        return pattern.replace(text, "").trim()
    }

    /** Le texte sans ses balises. */
    fun prose(text: String): String =
        tags(text).fold(text) { rest, tag -> removing(tag, rest) }.trim()

    /**
     * Ce qu'il faut BASCULER pour revenir de [actual] à [before] : la différence symétrique,
     * comparée en minuscules et rendue telle qu'écrite.
     */
    fun togglesRestoring(actual: List<String>, before: List<String>): List<String> {
        val beforeKeys = before.mapTo(mutableSetOf()) { it.lowercase() }
        val actualKeys = actual.mapTo(mutableSetOf()) { it.lowercase() }
        return actual.filter { it.lowercase() !in beforeKeys } + before.filter { it.lowercase() !in actualKeys }
    }
}
