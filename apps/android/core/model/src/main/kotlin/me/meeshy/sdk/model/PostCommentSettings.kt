package me.meeshy.sdk.model

/**
 * Les commentaires de ce contenu sont-ils FERMÉS (#16541) ? Ceux du post lui-même, ou ceux du post qu'il republie : une
 * republication hérite de la fermeture de sa source. La SEULE lecture de la fermeture — le composeur, le bandeau et le
 * fil la lisent ici, jamais sur l'un des deux drapeaux.
 */
val ApiPost.commentsClosed: Boolean
    get() = commentsDisabled || repostOf?.commentsDisabled == true

/**
 * **Fermer ou rouvrir les commentaires d'une publication** (#16541) — miroir de la route
 * `PATCH /posts/:postId/comment-settings`. La passerelle tranche le droit (l'auteur, ou la modération de la plateforme
 * qui dépasse l'auteur) ; ce prédicat décide seulement si l'entrée du menu s'offre.
 */
object PostCommentSettings {

    /** Le code d'un commentaire refusé parce que la publication a fermé ses commentaires. */
    const val COMMENTS_DISABLED: String = "COMMENTS_DISABLED"

    /** L'auteur, ou un MODERATOR / ADMIN / BIGBOSS de la plateforme (même loi que [ContentRemovalPolicy]). */
    fun mayToggle(authoredByViewer: Boolean, platformRole: String?): Boolean =
        authoredByViewer || ContentRemovalPolicy.isPlatformModerator(platformRole)

    /** Un envoi refusé pour cette raison : le fil se ferme sur place, sans attendre la diffusion du post. */
    fun refusesComments(code: String?): Boolean = code == COMMENTS_DISABLED

    /**
     * Le retour arrière d'un geste refusé : on ne revient à [before] que si le contenu porte ENCORE la valeur que le geste
     * a posée ([applied]). Une diffusion arrivée pendant le vol a dit plus vrai que le souvenir du geste : elle reste.
     */
    fun rolledBack(current: Boolean, applied: Boolean, before: Boolean): Boolean =
        if (current == applied) before else current
}
