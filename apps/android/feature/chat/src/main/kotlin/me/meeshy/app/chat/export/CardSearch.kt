package me.meeshy.app.chat.export

import java.text.Normalizer

/** Les mots de l'interface qui nomment chaque dimension, dans la langue de l'utilisateur. */
data class CardVocabulary(
    val typeface: Map<CardTypefaceId, String>,
    val link: Map<CardLinkId, String>,
    val tone: Map<CardTone, String>,
)

/**
 * CHERCHER PARMI LES TEMPLATES — miroir de `MessageCardSearch.swift`. On y cherche avec les MOTS
 * que l'utilisateur voit (palette, typographie, liaison, ton), sans casse ni accents ; chaque mot
 * tapé doit commencer un mot d'un template. L'ordre de la galerie est celui d'iOS et du web : les
 * plus utilisés d'abord, puis un brassage où deux voisines ne partagent ni palette, ni typographie,
 * ni liaison.
 */
object CardSearch {

    private val diacritics = Regex("\\p{M}+")

    fun fold(text: String): String =
        diacritics.replace(Normalizer.normalize(text, Normalizer.Form.NFD), "").lowercase()

    private fun tokens(text: String): List<String> =
        fold(text).split(Regex("[^\\p{L}\\p{N}]+")).filter { it.isNotEmpty() }

    /** Les mots d'un template, dans la langue de l'interface — et ses identifiants, stables d'une langue à l'autre. */
    fun words(id: CardTemplateId, vocabulary: CardVocabulary): List<String> {
        val palette = id.palette.palette
        return listOf(
            palette.name,
            vocabulary.typeface[id.typeface].orEmpty(),
            vocabulary.link[id.link].orEmpty(),
            vocabulary.tone[palette.tone].orEmpty(),
            id.palette.key,
            id.typeface.key,
            id.link.key,
        ).flatMap(::tokens)
    }

    /** Les 784 templates dans l'ordre de la galerie : un brassage BIJECTIF, identique à iOS et au web. */
    val galleryOrder: List<CardTemplateId> by lazy {
        val palettes = CardPaletteId.entries
        val typefaces = CardTypefaceId.entries
        val links = CardLinkId.entries
        CardTemplates.all.indices.map { k ->
            val a = k % palettes.size
            val b = (k / palettes.size) % typefaces.size
            val c = (k / (palettes.size * typefaces.size)) % links.size
            CardTemplateId(palettes[a], typefaces[(a + b) % typefaces.size], links[(a + b + c) % links.size])
        }
    }

    /** Les templates qui répondent à [query], les plus utilisés en tête ; une requête vide les rend tous. */
    fun search(
        query: String,
        vocabulary: CardVocabulary,
        usage: Map<CardTemplateId, Int> = emptyMap(),
        tone: CardTone? = null,
    ): List<CardTemplateId> {
        val terms = tokens(query)
        val matches = galleryOrder.filter { id ->
            if (tone != null && id.palette.palette.tone != tone) return@filter false
            if (terms.isEmpty()) return@filter true
            val candidates = words(id, vocabulary)
            terms.all { term -> candidates.any { it.startsWith(term) } }
        }
        val used = matches.withIndex()
            .filter { (usage[it.value] ?: 0) > 0 }
            .sortedWith(compareByDescending<IndexedValue<CardTemplateId>> { usage[it.value] ?: 0 }.thenBy { it.index })
            .map { it.value }
        return used + matches.filter { (usage[it] ?: 0) == 0 }
    }
}
