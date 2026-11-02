package me.meeshy.sdk.model.sticker

import kotlinx.serialization.Serializable

/** Une entrée de « Mes stickers » : son identifiant (nom de fichier) et son poids. */
@Serializable
data class StickerLibraryEntry(val id: String, val byteCount: Long)

/**
 * L'index de « Mes stickers » — miroir de l'index de `StickerLibraryStore` (iOS). L'ORDRE porte la récence : le premier
 * est le plus récent, le dernier le prochain à partir. Pur : le magasin écrit les octets et supprime ce que [saving] évince.
 */
data class StickerLibraryIndex(val entries: List<StickerLibraryEntry> = emptyList()) {

    val ids: List<String> get() = entries.map { it.id }

    val totalBytes: Long get() = entries.sumOf { it.byteCount }

    /**
     * Garde [id] en tête (un id déjà présent est remplacé, jamais doublé) puis évince les plus anciens tant que [budget]
     * est dépassé — jamais le plus récent, même seul au-dessus du budget. Rend l'index et les ids évincés, du plus ancien.
     */
    fun saving(id: String, byteCount: Long, budget: Long): Pair<StickerLibraryIndex, List<String>> {
        val kept = listOf(StickerLibraryEntry(id, byteCount)) + entries.filterNot { it.id == id }
        val evicted = mutableListOf<String>()
        var remaining = kept
        while (remaining.size > 1 && remaining.sumOf { it.byteCount } > budget) {
            evicted += remaining.last().id
            remaining = remaining.dropLast(1)
        }
        return StickerLibraryIndex(remaining) to evicted
    }

    fun removing(id: String): StickerLibraryIndex =
        if (entries.none { it.id == id }) this else StickerLibraryIndex(entries.filterNot { it.id == id })

    companion object {
        /** 64 Mo — le budget produit de « Mes stickers » (iOS `defaultBudgetBytes`). */
        const val DEFAULT_BUDGET_BYTES: Long = 64L * 1024 * 1024

        private val SAFE = Regex("[A-Za-z0-9_-]+")

        /** L'id devient un nom de fichier du dossier de la bibliothèque : ni séparateur, ni point (l'index est caché). */
        fun isFileSafe(id: String): Boolean = SAFE.matches(id)
    }
}
