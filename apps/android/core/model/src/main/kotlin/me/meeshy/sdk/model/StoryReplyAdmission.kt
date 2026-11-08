package me.meeshy.sdk.model

import me.meeshy.sdk.model.story.StoryReplyContext

/**
 * Où une réponse à une story ou à une humeur a le droit de vivre (miroir de `StoryReplyAdmission`
 * iOS, #7883). Une telle réponse s'adresse à l'AUTEUR : elle n'est admissible que dans la
 * conversation DIRECTE dont le participant est cet auteur. Sans cette loi, la prochaine
 * conversation ouverte — un groupe, le DM d'un tiers — recevrait la citation.
 *
 * Fail-closed : un identifiant absent ou vide ne s'égale jamais.
 */
object StoryReplyAdmission {
    fun admits(storyAuthorId: String?, conversationIsDirect: Boolean, participantUserId: String?): Boolean {
        if (!conversationIsDirect) return false
        if (storyAuthorId.isNullOrEmpty() || participantUserId.isNullOrEmpty()) return false
        return storyAuthorId == participantUserId
    }

    /** [participantUserId] : l'autre membre du direct, tel que `ApiConversation.directInterlocutor` l'élit. */
    fun admits(context: StoryReplyContext, conversationIsDirect: Boolean, participantUserId: String?): Boolean =
        admits(context.authorId, conversationIsDirect, participantUserId)
}
