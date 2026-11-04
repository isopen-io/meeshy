package me.meeshy.sdk.model.comment

/**
 * Le carnet des brouillons de commentaire, un par post (iOS `CommentDraftStore`) : le texte commencé puis abandonné en
 * quittant le post revient tel quel. Pur et immuable : l'ordre d'écriture est gardé (le plus récent en dernier) et, au-delà
 * de [MAX_DRAFTS], le plus ancien part le premier. Un texte vide efface le brouillon — il ne ressuscite jamais après l'envoi.
 */
public data class CommentDraftBook(
    private val order: List<String> = emptyList(),
    private val texts: Map<String, String> = emptyMap(),
) {
    public val size: Int get() = order.size

    public fun load(postId: String): String? = texts[postId]

    public fun postIds(): List<String> = order

    public fun saved(postId: String, text: String): CommentDraftBook {
        if (postId.isBlank()) return this
        if (text.isBlank()) return cleared(postId)
        val nextOrder = (order.filterNot { it == postId } + postId).takeLast(MAX_DRAFTS)
        return CommentDraftBook(nextOrder, (texts + (postId to text)).filterKeys { it in nextOrder })
    }

    public fun cleared(postId: String): CommentDraftBook =
        if (postId !in texts) this else CommentDraftBook(order - postId, texts - postId)

    public companion object {
        /** Les plus récents suffisent : un commentaire laissé en plan sur cinquante autres posts depuis ne se reprend plus. */
        public const val MAX_DRAFTS: Int = 50

        /** L'anti-rebond des écritures par frappe. */
        public const val DEBOUNCE_MS: Long = 400L

        public fun of(entries: List<Pair<String, String>>): CommentDraftBook =
            entries.fold(CommentDraftBook()) { book, (postId, text) -> book.saved(postId, text) }
    }

    /** Les brouillons, du plus ancien au plus récent, pour la persistance. */
    public fun entries(): List<Pair<String, String>> = order.mapNotNull { id -> texts[id]?.let { id to it } }
}
