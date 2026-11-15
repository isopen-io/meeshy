package me.meeshy.sdk.model.story

/**
 * Le contexte d'une réponse privée à une story ou à une humeur (iOS `ReplyContext.story` / `.status`) :
 * ce que le champ de la conversation montre au-dessus de lui, et l'identifiant que l'envoi grave en
 * `storyReplyToId`. [replyToId] est l'id de la story ou de l'humeur, jamais celui d'un message.
 */
sealed interface StoryReplyContext {
    val replyToId: String
    val authorId: String
    val authorName: String?
    val preview: String?

    data class Story(
        override val replyToId: String,
        override val authorId: String,
        override val authorName: String? = null,
        override val preview: String? = null,
        val thumbnailUrl: String? = null,
    ) : StoryReplyContext

    data class Status(
        override val replyToId: String,
        override val authorId: String,
        override val authorName: String? = null,
        override val preview: String? = null,
        val moodEmoji: String? = null,
    ) : StoryReplyContext
}

/**
 * Ce qu'un envoi transmet de la citation en attente (miroir d'`OutgoingReplyRoute` iOS) : rien tant
 * qu'elle n'est pas admissible dans la conversation courante — défense en profondeur derrière
 * l'application du contexte.
 */
data class OutgoingStoryReplyRoute(val storyReplyToId: String?) {
    val hasReply: Boolean get() = storyReplyToId != null

    companion object {
        fun of(
            pending: StoryReplyContext?,
            conversationIsDirect: Boolean,
            participantUserId: String?,
        ): OutgoingStoryReplyRoute {
            val admitted = pending != null && pending.replyToId.isNotEmpty() &&
                me.meeshy.sdk.model.StoryReplyAdmission.admits(pending, conversationIsDirect, participantUserId)
            return OutgoingStoryReplyRoute(if (admitted) pending?.replyToId else null)
        }
    }
}
