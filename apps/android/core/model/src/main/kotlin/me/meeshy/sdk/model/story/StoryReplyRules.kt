package me.meeshy.sdk.model.story

/**
 * Les règles de « Répondre » dans le lecteur de stories (iOS `StoryActionRailPlan.showsReply` et la
 * citation de `ReplyContext.story`, #13501) : la réponse est privée, elle part dans la conversation directe
 * avec l'auteur, en citation de sa story.
 */
object StoryReplyRules {

    /** Longueur de l'aperçu cité, celle d'iOS (`content.prefix(80)`). */
    const val PREVIEW_MAX = 80

    /** On ne répond ni à sa propre story, ni à une story ou un auteur inconnus. */
    fun canReply(isOwnStory: Boolean, storyId: String?, authorId: String?): Boolean =
        !isOwnStory && !storyId.isNullOrBlank() && !authorId.isNullOrBlank()

    fun railOffersReply(isOwnStory: Boolean, canReply: Boolean): Boolean = !isOwnStory && canReply

    /** Les mots de la story montrés dans la citation ; `null` quand elle n'en a pas (la citation montre alors sa vignette). */
    fun quotePreview(content: String?): String? =
        content?.trim()?.take(PREVIEW_MAX)?.trim()?.takeIf { it.isNotEmpty() }

    fun canSend(canReply: Boolean, isSending: Boolean, text: String): Boolean =
        canReply && !isSending && text.isNotBlank()
}
