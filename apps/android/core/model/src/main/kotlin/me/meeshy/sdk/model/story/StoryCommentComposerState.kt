package me.meeshy.sdk.model.story

import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryComment
import me.meeshy.sdk.model.appearance.PaintRoleResolver

/**
 * Le commentaire auquel la barre unique répond (iOS `replyingToStoryComment`) : [rootId] est le parent RACINE du
 * fil — répondre à une réponse rattache au MÊME parent racine —, [authorColorHex] l'accent de son auteur.
 */
data class StoryCommentReplyTarget(
    val commentId: String,
    val rootId: String,
    val authorName: String,
    val authorColorHex: String,
    val snippet: String,
) {
    companion object {
        fun of(comment: StoryComment, authorColorHex: String): StoryCommentReplyTarget = StoryCommentReplyTarget(
            commentId = comment.id,
            rootId = comment.parentId?.takeIf { it.isNotBlank() } ?: comment.id,
            authorName = comment.authorName,
            authorColorHex = authorColorHex,
            snippet = comment.content,
        )
    }
}

/**
 * **L'UNIQUE barre de saisie du lecteur de story** (iOS `StoryComposerBarView`) : l'accent est celui du commentaire visé,
 * sinon celui de la story ; son second arrêt de dégradé en est la teinte tournée de +30° ; la bannière « Réponse à X »
 * se pose au-dessus du champ et s'annule d'un geste. Pur : l'écran n'en est que la projection.
 */
data class StoryCommentComposerState(
    val storyAccentHex: String,
    val reply: StoryCommentReplyTarget? = null,
    /** Les pièces du plateau (photo, vidéo, fichier, vocal) : le commentaire part avec leurs ids. */
    val attachments: StoryCommentAttachmentTray = StoryCommentAttachmentTray(),
    /** Le lieu joint au commentaire. */
    val place: SharedPlace? = null,
) {
    val accentHex: String get() = PaintRoleResolver.normalizedAccent(reply?.authorColorHex ?: storyAccentHex)

    val secondaryHex: String get() = PaintRoleResolver.hueShifted(accentHex, PaintRoleResolver.HUE_STEP_DEGREES)

    val showsReplyBanner: Boolean get() = reply != null

    fun replying(target: StoryCommentReplyTarget): StoryCommentComposerState = copy(reply = target)

    fun cancelReply(): StoryCommentComposerState = if (reply == null) this else copy(reply = null)

    /** Le parent racine du commentaire à envoyer ; `null` = commentaire de premier niveau. */
    val parentIdForSend: String? get() = reply?.rootId

    /** Un envoi consomme la cible de réponse : la barre revient au premier niveau. */
    fun sent(): StoryCommentComposerState = copy(reply = null, attachments = StoryCommentAttachmentTray(), place = null)

    /**
     * Le bouton d'envoi s'allume avec un texte, une pièce ou un lieu — mais jamais pendant qu'une pièce se téléverse
     * (le commentaire attend ses médias, il ne part pas sans eux).
     */
    fun canSend(text: String): Boolean =
        !attachments.isUploading && (text.isNotBlank() || attachments.hasMedia || place != null)

    /** Un brouillon rouvert, ou un commentaire refusé revenu : ses pièces et son lieu reprennent leur place. */
    fun restoring(draft: StoryCommentDraft): StoryCommentComposerState =
        copy(attachments = attachments.restoring(draft.pieces), place = draft.place ?: place)
}
