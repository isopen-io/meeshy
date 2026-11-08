package me.meeshy.sdk.model.imagine

import java.text.Normalizer

/** Un template de la galerie, décrit par ses rangs dans chaque dimension (palette, typographie, liaison). */
data class ImagineTemplateRef(val palette: Int, val typeface: Int, val link: Int)

/** Un template cherchable : sa référence, ses mots d'interface (déjà localisés) et son ton (sombre/clair). */
data class ImagineTemplateEntry(val ref: ImagineTemplateRef, val words: List<String>, val tone: String? = null)

/**
 * **Chercher parmi les templates** — miroir de `MessageCardSearch` (iOS) et du web. On y cherche avec les MOTS que
 * l'utilisateur voit (palette, typographie, liaison, ton), sans casse ni accents ; chaque mot tapé doit COMMENCER un mot
 * d'un template. L'ordre de la galerie : les plus utilisés d'abord, puis un brassage où deux voisines ne partagent ni
 * palette, ni typographie, ni liaison.
 */
object ImagineGallerySearch {
    private val DIACRITICS = Regex("\\p{M}+")
    private val SEPARATORS = Regex("[^\\p{L}\\p{N}]+")

    fun fold(text: String): String = DIACRITICS.replace(Normalizer.normalize(text, Normalizer.Form.NFD), "").lowercase()

    fun tokens(text: String): List<String> = fold(text).split(SEPARATORS).filter { it.isNotEmpty() }

    /** Le brassage BIJECTIF de la galerie : identique à iOS et au web. */
    fun galleryOrder(palettes: Int, typefaces: Int, links: Int): List<ImagineTemplateRef> {
        if (palettes <= 0 || typefaces <= 0 || links <= 0) return emptyList()
        return (0 until palettes * typefaces * links).map { k ->
            val a = k % palettes
            val b = (k / palettes) % typefaces
            val c = (k / (palettes * typefaces)) % links
            ImagineTemplateRef(a, (a + b) % typefaces, (a + b + c) % links)
        }
    }

    /** Les templates qui répondent à [query], les plus utilisés en tête ; une requête vide les rend tous. */
    fun search(
        query: String,
        entries: List<ImagineTemplateEntry>,
        usage: Map<ImagineTemplateRef, Int> = emptyMap(),
        tone: String? = null,
    ): List<ImagineTemplateRef> {
        val terms = tokens(query)
        val matches = entries.filter { entry ->
            if (tone != null && entry.tone != tone) return@filter false
            if (terms.isEmpty()) return@filter true
            val candidates = entry.words.flatMap(::tokens)
            terms.all { term -> candidates.any { it.startsWith(term) } }
        }.map { it.ref }
        val used = matches.withIndex()
            .filter { (usage[it.value] ?: 0) > 0 }
            .sortedWith(compareByDescending<IndexedValue<ImagineTemplateRef>> { usage[it.value] ?: 0 }.thenBy { it.index })
            .map { it.value }
        return used + matches.filter { (usage[it] ?: 0) == 0 }
    }
}

/**
 * **La clé de peinture** : tout ce qui change l'image rendue, et rien d'autre. Une peinture n'est « prête » que si sa clé
 * est celle de l'état courant ; une peinture rendue pour une autre clé est jetée, jamais montrée.
 */
data class ImaginePaintKey(
    val format: String,
    val featuredMedia: String?,
    val language: String?,
    val mediaVersion: Int,
    val clip: ImagineClip?,
    val composition: String = "",
) {
    val value: String
        get() = listOf(format, featuredMedia.orEmpty(), language.orEmpty(), mediaVersion.toString(), clip?.let { "${it.startSeconds}+${it.durationSeconds}" }.orEmpty(), composition)
            .joinToString("|")

    /** La peinture [rendered] est-elle celle de cet état ? */
    fun isReady(rendered: ImaginePaintKey?): Boolean = rendered == this

    companion object {
        fun of(
            format: String,
            featuredMedia: String?,
            language: String?,
            mediaVersion: Int,
            plan: ImagineMotionPlan?,
            composition: String = "",
        ): ImaginePaintKey = ImaginePaintKey(format, featuredMedia, language, mediaVersion, plan?.clip, composition)
    }
}
