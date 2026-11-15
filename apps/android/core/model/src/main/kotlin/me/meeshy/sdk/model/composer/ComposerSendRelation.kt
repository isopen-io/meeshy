package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.QuotedAttachmentSend
import me.meeshy.sdk.model.send.MessageRelation
import me.meeshy.sdk.model.story.OutgoingStoryReplyRoute

/**
 * La relation typée qu'un envoi du composeur porte (iOS `ComposerSendRelation`) : une réponse à une story l'emporte, puis
 * une réponse à un message (qui peut citer une pièce précise), sinon aucune.
 */
public object ComposerSendRelation {
    public fun of(storyRoute: OutgoingStoryReplyRoute, replyToId: String?, citing: QuotedAttachmentSend? = null): MessageRelation {
        storyRoute.storyReplyToId?.takeIf { it.isNotEmpty() }?.let { return MessageRelation.StoryReply(it) }
        replyToId?.takeIf { it.isNotEmpty() }?.let { return MessageRelation.Reply(it, citing) }
        return MessageRelation.None
    }
}
