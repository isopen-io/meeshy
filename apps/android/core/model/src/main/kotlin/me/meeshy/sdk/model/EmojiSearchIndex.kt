package me.meeshy.sdk.model

import java.text.Normalizer

/**
 * Real-time search over the picker catalog — the iOS `EmojiDataManager.searchEmojis`
 * (exact keyword or the emoji itself) made forgiving for a typing user: case and
 * accents are folded on both sides, and a typed prefix finds the keyword it starts.
 *
 * Built once ([EmojiCatalogSnapshot]) and read from the UI thread afterwards: [search]
 * is a scan over a few hundred folded keywords, with no allocation beyond the result.
 */
class EmojiSearchIndex private constructor(
    private val keywords: List<Pair<String, List<String>>>,
    private val catalogEmojis: List<String>,
) {

    /**
     * The emojis answering [query], most relevant first, at most [MAX_RESULTS]:
     * whole-keyword matches, then keywords the query is a prefix of, then emojis
     * that contain the typed text (a pasted or typed emoji). A single character
     * only matches whole keywords — a prefix of one letter would match half the table.
     */
    fun search(query: String): List<String> {
        val folded = fold(query)
        if (folded.isEmpty()) return emptyList()
        val exact = keywords.filter { (word, _) -> word == folded }
        val prefixed = if (folded.length >= MIN_PREFIX_LENGTH) {
            keywords.filter { (word, _) -> word != folded && word.startsWith(folded) }
        } else {
            emptyList()
        }
        val literal = catalogEmojis.filter { it.contains(query.trim()) }
        return (exact.flatMap { it.second } + prefixed.flatMap { it.second } + literal)
            .distinct()
            .take(MAX_RESULTS)
    }

    companion object {
        const val MAX_RESULTS: Int = 60
        const val MIN_PREFIX_LENGTH: Int = 2

        fun build(
            categories: List<EmojiCategory> = EmojiCatalog.searchableCategories,
            entries: List<EmojiKeywordEntry> = EmojiKeywords.entries,
        ): EmojiSearchIndex {
            val catalogEmojis = categories.flatMap { it.emojis }.distinct()
            val known = catalogEmojis.toSet()
            val byWord = LinkedHashMap<String, MutableList<String>>()
            entries.forEach { entry ->
                val served = entry.emojis.filter { it in known }
                entry.words.forEach { word ->
                    val bucket = byWord.getOrPut(fold(word)) { mutableListOf() }
                    served.filterNot { it in bucket }.forEach { bucket.add(it) }
                }
            }
            return EmojiSearchIndex(
                keywords = byWord.entries.filter { it.key.isNotEmpty() }.map { it.key to it.value.toList() },
                catalogEmojis = catalogEmojis,
            )
        }

        /**
         * Lower-cases, strips combining marks (so « é » and « e » meet) and spells out the
         * ligatures that carry no mark (« œ », « æ », « ß »), then trims.
         */
        fun fold(text: String): String {
            val decomposed = Normalizer.normalize(text, Normalizer.Form.NFD)
            val stripped = decomposed.filterNot { Character.getType(it) == Character.NON_SPACING_MARK.toInt() }
            return stripped
                .lowercase()
                .replace("œ", "oe")
                .replace("æ", "ae")
                .replace("ß", "ss")
                .trim()
        }
    }
}
