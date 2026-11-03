package me.meeshy.sdk.model

/** Une entrée du menu « … » d'une ligne de commentaire de story, dans l'ordre où le menu la montre (iOS `CommentMenuAction`). */
enum class StoryCommentMenuAction { COPY, EDIT, REPORT, DELETE, REMOVE }

/**
 * **Quelles actions pour ce commentaire de story et ce lecteur** — miroir de `CommentMenuPolicy.actions` (iOS, #8709).
 * L'auteur modifie et supprime, les autres signalent, la modération de la plateforme retire avec un motif (#11151) ;
 * un commentaire protégé (flou, éphémère, vue unique) ne se copie jamais.
 */
object StoryCommentMenuPolicy {

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
        editable: Boolean = true,
        deletable: Boolean = true,
        removable: Boolean = true,
    ): List<StoryCommentMenuAction> {
        val mine = isAuthor(authorId, viewerId)
        val known = !viewerId.isNullOrEmpty()
        val copyable = !isProtected(effectFlags) && servedText.isNotBlank()
        val moderates = ContentRemovalPolicy.mayRemovePublication(authoredByViewer = mine, platformRole = platformRole)
        return listOf(
            StoryCommentMenuAction.COPY to copyable,
            StoryCommentMenuAction.EDIT to (mine && editable),
            StoryCommentMenuAction.REPORT to (known && !mine),
            StoryCommentMenuAction.DELETE to (mine && deletable),
            StoryCommentMenuAction.REMOVE to (known && !mine && removable && moderates),
        ).filter { it.second }.map { it.first }
    }
}

/** Le brouillon d'édition en place d'un commentaire de story (iOS `StoryCommentEditing`). */
object StoryCommentEditing {
    /** Le texte qui part au serveur ; `null` quand il est vide ou inchangé : « Enregistrer » ne coûte alors aucune requête. */
    fun draftToSend(draft: String, original: String): String? {
        val text = draft.trim()
        return text.takeIf { it.isNotEmpty() && it != original.trim() }
    }
}
