package me.meeshy.sdk.post

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.CommentQuotedMedia
import me.meeshy.sdk.session.PerAccountCache

/**
 * **CE QUE L'UTILISATEUR VIENT DE DÉSIGNER, en attendant qu'il l'écrive** (iOS `CommentQuotationStore`, #6578). Toucher
 * « Commenter ce média » dans la galerie n'écrit rien : ça DÉCLARE un sujet que le composeur du fil reprendra une fois la
 * galerie refermée — elles ne partagent aucun état d'écran, d'où ce magasin. Clé par post : la citation de l'un n'apparaît
 * jamais dans le composeur d'un autre. [designate] REMPLACE (le serveur ne grave qu'une ancre) ; [clear] part avec l'envoi
 * et au retrait ; la déconnexion vide tout ([PerAccountCache]).
 */
public class CommentQuotationStore : PerAccountCache {

    private val state = MutableStateFlow<Map<String, CommentQuotedMedia>>(emptyMap())

    /** La carte `postId → citation` ; une rangée ne se redessine que pour SON post. */
    public val quotations: StateFlow<Map<String, CommentQuotedMedia>> = state.asStateFlow()

    public fun quotation(postId: String): CommentQuotedMedia? = state.value[postId]

    public fun designate(citation: CommentQuotedMedia, postId: String) {
        state.update { it + (postId to citation) }
    }

    public fun clear(postId: String) {
        state.update { it - postId }
    }

    override suspend fun clear() {
        state.value = emptyMap()
    }
}
