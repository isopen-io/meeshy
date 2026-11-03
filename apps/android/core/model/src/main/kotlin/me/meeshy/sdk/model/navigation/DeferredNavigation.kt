package me.meeshy.sdk.model.navigation

import me.meeshy.sdk.model.game.engagement.EngagementReveal
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode

/** Le contexte de réponse (réponse à une story, à une humeur) qu'attend la prochaine conversation ouverte. */
public data class ReplyContextRequest(
    val conversationId: String,
    val targetId: String,
    val kind: String,
    val authorName: String? = null,
    val preview: String? = null,
)

/**
 * Le message à atteindre dans UNE conversation. Sans [conversationId] un saut posé pour A serait ramassé par la
 * conversation B ouverte ensuite ; `null` = non scopé (entrée ancienne).
 */
public data class MessageJumpTarget(val messageId: String, val conversationId: String?) {
    public fun appliesTo(conversation: String): Boolean = conversationId == null || conversationId == conversation
}

/**
 * **Les états différés de la navigation, consommables UNE fois** (iOS `Router.pending*`) : ce qu'un écran demande à
 * l'écran suivant. Chaque `consume…` rend la valeur ET l'état sans elle — la remise à plat vit ici, à son site unique,
 * jamais chez chaque hôte (un hôte qui oublie, et le bouton cesse d'agir sans que rien ne rougisse).
 */
public data class DeferredNavigation(
    val openSearch: Boolean = false,
    val openFeedComposer: Boolean = false,
    val replyContext: ReplyContextRequest? = null,
    /** Incrémentée à chaque pose : une conversation DÉJÀ visible applique le contexte sans attendre un `onAppear`. */
    val replyContextVersion: Int = 0,
    val forcedReadingMode: ConversationReadingMode? = null,
    val engagementReveal: EngagementReveal? = null,
    val messageJump: MessageJumpTarget? = null,
) {
    public fun requestSearch(): DeferredNavigation = copy(openSearch = true)

    public fun requestFeedComposer(): DeferredNavigation = copy(openFeedComposer = true)

    public fun requestReply(context: ReplyContextRequest): DeferredNavigation =
        copy(replyContext = context, replyContextVersion = replyContextVersion + 1)

    public fun requestMessage(messageId: String, conversationId: String?): DeferredNavigation =
        copy(messageJump = messageId.takeIf { it.isNotBlank() }?.let { MessageJumpTarget(it, conversationId) })

    /** L'ouverture de [conversationId] vise-t-elle un message ? Un saut atterrit sur le FIL, jamais sur le résumé. */
    public fun landsOnMessage(conversationId: String): Boolean = messageJump?.appliesTo(conversationId) == true

    public fun consumeSearch(): Pair<Boolean, DeferredNavigation> = openSearch to copy(openSearch = false)

    public fun consumeFeedComposer(): Pair<Boolean, DeferredNavigation> = openFeedComposer to copy(openFeedComposer = false)

    public fun consumeEngagementReveal(): Pair<EngagementReveal?, DeferredNavigation> =
        engagementReveal to copy(engagementReveal = null)

    public fun consumeForcedReadingMode(): Pair<ConversationReadingMode?, DeferredNavigation> =
        forcedReadingMode to copy(forcedReadingMode = null)

    /** Le contexte de réponse ne se ramasse que dans sa conversation : une autre ne le vole pas. */
    public fun consumeReply(conversationId: String): Pair<ReplyContextRequest?, DeferredNavigation> {
        val context = replyContext?.takeIf { it.conversationId == conversationId } ?: return null to this
        return context to copy(replyContext = null)
    }

    /** Le saut ne se ramasse que dans la conversation visée ; une autre le laisse intact. */
    public fun consumeMessageJump(conversationId: String): Pair<String?, DeferredNavigation> {
        val jump = messageJump?.takeIf { it.appliesTo(conversationId) } ?: return null to this
        return jump.messageId to copy(messageJump = null)
    }
}
