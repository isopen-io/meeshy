package me.meeshy.sdk.model

/**
 * L'abrègement d'un texte de post en MOTS (iOS `FeedPostCard.truncatedContent`, 20 mots) :
 * il compte et coupe sur les blancs, donc il ne dépend ni de la taille de police ni de la
 * largeur de l'écran. La coupe garde le texte ORIGINAL jusqu'au dernier mot montré (sauts de
 * ligne internes compris) pour que le rendu en blocs reste valide ; un emoji ou un
 * cluster Unicode n'est jamais scindé car on ne coupe qu'entre deux blancs.
 */
object PostTextTruncation {
    const val DEFAULT_MAX_WORDS: Int = 20

    data class Cut(val text: String, val isTruncated: Boolean)

    fun cut(text: String, maxWords: Int = DEFAULT_MAX_WORDS): Cut {
        if (maxWords <= 0 || text.isBlank()) return Cut(text, isTruncated = false)
        var count = 0
        var index = 0
        val length = text.length
        while (index < length) {
            while (index < length && text[index].isWhitespace()) index++
            if (index >= length) break
            val wordStart = index
            while (index < length && !text[index].isWhitespace()) index++
            count++
            if (count == maxWords) {
                val rest = text.substring(index)
                return if (rest.isBlank()) Cut(text, isTruncated = false)
                else Cut(text.substring(0, index), isTruncated = true)
            }
            check(wordStart < index)
        }
        return Cut(text, isTruncated = false)
    }
}
