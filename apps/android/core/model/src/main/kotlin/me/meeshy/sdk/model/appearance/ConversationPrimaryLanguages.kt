package me.meeshy.sdk.model.appearance

/**
 * Les langues qui comptent dans une conversation : celles dans lesquelles ses membres écrivent le plus. Elles
 * décident si le fond Signature porte la surcouche de drapeaux (trois langues et plus).
 */
object ConversationPrimaryLanguages {
    const val LIMIT: Int = 10

    fun top(codes: List<String?>, limit: Int = LIMIT): List<String> {
        val counts = LinkedHashMap<String, Int>()
        codes.forEach { raw ->
            val base = raw?.trim()?.lowercase()?.substringBefore('-')?.substringBefore('_').orEmpty()
            if (base.isNotEmpty()) counts[base] = (counts[base] ?: 0) + 1
        }
        return counts.entries.withIndex()
            .sortedWith(compareByDescending<IndexedValue<Map.Entry<String, Int>>> { it.value.value }.thenBy { it.index })
            .take(limit)
            .map { it.value.key }
    }
}
