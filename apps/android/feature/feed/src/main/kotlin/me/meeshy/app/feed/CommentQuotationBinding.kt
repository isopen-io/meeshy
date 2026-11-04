package me.meeshy.app.feed

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import me.meeshy.sdk.model.CommentQuotedMedia
import me.meeshy.sdk.post.CommentQuotationStore

/**
 * La citation de média d'UN post, vue par son fil de commentaires (iOS `CommentQuotationChip` lisant le magasin par
 * `postId`) : [quotation] n'émet que pour SON post, [consume] la rend à l'envoi et l'efface (sinon le commentaire suivant
 * citerait le média du précédent), [clear] la retire (croix de la puce, changement de post). Sans magasin : inerte.
 */
internal class CommentQuotationBinding(
    private val store: CommentQuotationStore?,
    private val postId: String,
    scope: CoroutineScope,
) {
    val quotation: StateFlow<CommentQuotedMedia?> = (store?.quotations ?: MutableStateFlow<Map<String, CommentQuotedMedia>>(emptyMap()))
        .map { it[postId] }
        .distinctUntilChanged()
        .stateIn(scope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), store?.quotation(postId))

    /** L'ancre à envoyer avec le commentaire, ou `null` ; la citation est effacée dans le même geste. */
    fun consume(): String? {
        val anchor = store?.quotation(postId)?.postMediaId
        clear()
        return anchor
    }

    fun clear() {
        store?.clear(postId)
    }

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }
}
