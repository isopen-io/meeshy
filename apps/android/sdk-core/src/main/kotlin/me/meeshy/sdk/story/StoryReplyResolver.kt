package me.meeshy.sdk.story

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.getAndUpdate
import me.meeshy.sdk.conversation.DirectConversationOpener
import me.meeshy.sdk.conversation.DirectOpenResult
import me.meeshy.sdk.model.story.StoryReplyContext

/**
 * Le contexte de réponse EN ATTENTE, global et consommé UNE fois (miroir de `Router.pendingReplyContext`
 * iOS). Il survit à une navigation ratée ; c'est l'admission ([me.meeshy.sdk.model.StoryReplyAdmission])
 * qui décide, côté conversation, s'il a le droit de s'y poser.
 */
@Singleton
class PendingStoryReplyContext @Inject constructor() {
    private val pending = MutableStateFlow<StoryReplyContext?>(null)
    val current: StateFlow<StoryReplyContext?> = pending.asStateFlow()

    fun post(context: StoryReplyContext) {
        pending.value = context
    }

    /** Rend le contexte et le retire : un deuxième appel rend `null`. */
    fun consume(): StoryReplyContext? = pending.getAndUpdate { null }

    fun clear() {
        pending.value = null
    }
}

/** Où « Répondre » mène : la conversation à ouvrir, ou l'échec à dire par un toast. */
sealed interface StoryReplyTarget {
    data class Open(val conversationId: String) : StoryReplyTarget
    data object Failed : StoryReplyTarget
}

/**
 * « Répondre » depuis tout site du lecteur (miroir de `Router.navigateToStoryReply`) : trouve la directe
 * avec l'auteur (cache d'abord), la crée si elle manque, et pose le contexte pour que la conversation
 * montre la story citée au-dessus du champ. Un échec ne pose RIEN et se dit : jamais de silence.
 */
class StoryReplyResolver @Inject constructor(
    private val directs: DirectConversationOpener,
    private val pending: PendingStoryReplyContext,
) {
    suspend fun resolve(context: StoryReplyContext): StoryReplyTarget {
        if (context.authorId.isBlank() || context.replyToId.isBlank()) return StoryReplyTarget.Failed
        return when (val opened = directs.openOrCreate(context.authorId)) {
            is DirectOpenResult.Opened -> {
                pending.post(context)
                StoryReplyTarget.Open(opened.conversationId)
            }
            DirectOpenResult.Queued, DirectOpenResult.Failed -> StoryReplyTarget.Failed
        }
    }
}
