package me.meeshy.sdk.model.comment

import me.meeshy.sdk.lang.LanguageCodeNormalizer
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.CommentEffects
import me.meeshy.sdk.model.MessageEffects

/** Ce que l'édition d'un commentaire envoie : le texte, les effets (0 = aucun) et la langue DÉCLARÉE par la pastille. */
data class CommentEditRequest(
    val commentId: String,
    val content: String,
    val effectFlags: Int,
    val originalLanguage: String?,
)

/** Ce que l'édition charge dans le composer : le texte, le flou et les effets, et la langue du commentaire. */
data class CommentEditSeed(
    val text: String,
    val effects: MessageEffects,
    val languageCode: String?,
)

/**
 * **L'édition d'un commentaire par son auteur** (iOS `beginEditComment` / `withEditedContent`, #6600) : le composer
 * s'ouvre sur TOUT ce que l'édition permet — texte, effets, flou, langue —, le média existant est conservé tel quel.
 */
object CommentEditing {

    fun seed(comment: ApiPostComment): CommentEditSeed = CommentEditSeed(
        text = comment.content,
        effects = CommentEffects.served(comment.effectFlags),
        languageCode = LanguageCodeNormalizer.normalize(comment.originalLanguage),
    )

    /** Le `effectFlags` envoyé : explicite, 0 efface les effets (un champ omis les laisserait). */
    fun wireFlags(effects: MessageEffects): Int = CommentEffects.wire(effects) ?: 0

    /** Du texte, ou un média déjà joint : un commentaire d'image seule s'édite sans texte. */
    fun canSend(text: String, hasMedia: Boolean): Boolean = text.isNotBlank() || hasMedia

    /**
     * La copie éditée, EN PLACE (même id). Un texte MODIFIÉ vide les traductions — elles décrivaient l'ancien — ;
     * le pipeline serveur les régénère et `comment:translation-updated` les ramène.
     */
    fun edited(original: ApiPostComment, request: CommentEditRequest): ApiPostComment = original.copy(
        content = request.content,
        effectFlags = request.effectFlags,
        translations = if (request.content == original.content) original.translations else null,
    )
}
