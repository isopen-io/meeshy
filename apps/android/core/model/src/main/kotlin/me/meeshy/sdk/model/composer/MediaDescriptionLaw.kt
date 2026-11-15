package me.meeshy.sdk.model.composer

/**
 * Texte alternatif / légende par média. TROIS contenus distincts : `Post.content`,
 * `PostMedia.caption` et `alt` ne se confondent jamais ; cette loi ne gouverne que les deux
 * derniers (clé = id d'un média du post, valeur ≤ 1000 caractères côté passerelle).
 */
object MediaDescriptionLaw {
    const val MAX_LENGTH: Int = 1000

    /** La carte du fil : clés d'un média présent, valeurs rognées et bornées ; `null` si rien à dire. */
    fun wire(raw: Map<String, String>, mediaIds: List<String>): Map<String, String>? =
        mediaIds.asSequence()
            .mapNotNull { id -> raw[id]?.trim()?.takeIf { it.isNotEmpty() }?.take(MAX_LENGTH)?.let { id to it } }
            .toMap()
            .takeIf { it.isNotEmpty() }

    /** Les médias sans description, dans l'ordre : la liste que la feuille rappelle à l'auteur. */
    fun undescribed(mediaIds: List<String>, raw: Map<String, String>): List<String> =
        mediaIds.filter { raw[it].isNullOrBlank() }

    /** [raw] avec [text] pour [mediaId] ; un texte vide RETIRE la clé. */
    fun with(raw: Map<String, String>, mediaId: String, text: String): Map<String, String> =
        if (text.isBlank()) raw - mediaId else raw + (mediaId to text.take(MAX_LENGTH))

    /** [raw] restreint aux médias encore présents. */
    fun pruned(raw: Map<String, String>, mediaIds: List<String>): Map<String, String> =
        raw.filterKeys { it in mediaIds }
}
