package me.meeshy.sdk.model

/** Une entrée du menu « … » d'un commentaire de post, dans l'ordre où le menu la montre (iOS `CommentMenuAction`). */
enum class CommentMenuAction { COPY, IMAGINE, EDIT, REPORT, DELETE, REMOVE }

/**
 * **Quelles actions pour ce commentaire et ce lecteur** — miroir de `CommentMenuPolicy.actions` (iOS, #8709, #11151) :
 * l'auteur modifie et supprime, les autres signalent, la modération de la plateforme retire avec un motif.
 * Un commentaire protégé (flou, vue unique, éphémère) ne se copie jamais ; « Imager » suit la loi de la carte, dont
 * l'hôte passe le verdict par `canImagine`. La feuille et le détail lisent la MÊME loi.
 *
 * Sur un fil FERMÉ (`commentsClosed`, règle porteur du 2026-11-08, #16930) l'auteur ne modifie plus : la passerelle
 * refuse la modification (`403 COMMENTS_DISABLED`). Aimer, supprimer, signaler et retirer restent.
 */
object CommentMenuPolicy {

    fun isAuthor(authorId: String?, viewerId: String?): Boolean =
        !viewerId.isNullOrEmpty() && authorId == viewerId

    fun isProtected(effectFlags: Int?): Boolean =
        MessageEffectFlags.hasLifecycle((effectFlags ?: 0).toLong())

    fun actions(
        authorId: String?,
        viewerId: String?,
        platformRole: String?,
        servedText: String,
        effectFlags: Int?,
        canImagine: Boolean,
        editable: Boolean,
        deletable: Boolean,
        removable: Boolean = false,
        commentsClosed: Boolean = false,
    ): List<CommentMenuAction> {
        val mine = isAuthor(authorId, viewerId)
        val known = !viewerId.isNullOrEmpty()
        val copyable = !isProtected(effectFlags) && servedText.isNotBlank()
        val moderates = ContentRemovalPolicy.mayRemovePublication(authoredByViewer = mine, platformRole = platformRole)
        return listOf(
            CommentMenuAction.COPY to copyable,
            CommentMenuAction.IMAGINE to canImagine,
            CommentMenuAction.EDIT to (mine && editable && !commentsClosed),
            CommentMenuAction.REPORT to (known && !mine),
            CommentMenuAction.DELETE to (mine && deletable),
            CommentMenuAction.REMOVE to (known && !mine && removable && moderates),
        ).filter { it.second }.map { it.first }
    }

    /**
     * Ce que le « … » DESSINE (#16541) : « Imager » a sa baguette dans le rail d'actions du commentaire, il ne se répète
     * pas dans le menu. TalkBack garde la liste entière de [actions] en actions personnalisées.
     */
    fun overflow(actions: List<CommentMenuAction>): List<CommentMenuAction> =
        actions.filterNot { it == CommentMenuAction.IMAGINE }
}
