package me.meeshy.app.navigation

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.game.engagement.EngagementReveal
import me.meeshy.sdk.model.navigation.DeferredNavigation
import me.meeshy.sdk.model.navigation.ReplyContextRequest
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import javax.inject.Inject
import javax.inject.Singleton

/**
 * **Ce qu'un écran demande à l'écran suivant** (iOS `Router.pending*`) : un singleton qui tient l'état différé de
 * `:core:model` ([DeferredNavigation]) et le rend aux hôtes, UNE fois. Chaque `consume…` est atomique : deux hôtes qui
 * ramassent en même temps ne servent jamais deux fois la même demande.
 */
@Singleton
class NavigationRequests @Inject constructor() {
    private val _state = MutableStateFlow(DeferredNavigation())

    /** Lu par un hôte déjà visible qui doit réagir à une pose (la version du contexte de réponse change). */
    val state: StateFlow<DeferredNavigation> = _state.asStateFlow()

    fun requestSearch() = _state.update { it.requestSearch() }

    fun requestFeedComposer() = _state.update { it.requestFeedComposer() }

    fun requestReply(context: ReplyContextRequest) = _state.update { it.requestReply(context) }

    fun requestMessage(messageId: String, conversationId: String?) =
        _state.update { it.requestMessage(messageId, conversationId) }

    fun forceReadingMode(mode: ConversationReadingMode) = _state.update { it.copy(forcedReadingMode = mode) }

    fun requestEngagementReveal(reveal: EngagementReveal) = _state.update { it.copy(engagementReveal = reveal) }

    /** L'ouverture de [conversationId] vise-t-elle un message ? Un saut atterrit sur le fil, jamais sur le résumé. */
    fun landsOnMessage(conversationId: String): Boolean = _state.value.landsOnMessage(conversationId)

    fun consumeSearch(): Boolean = take { it.consumeSearch() }

    fun consumeFeedComposer(): Boolean = take { it.consumeFeedComposer() }

    fun consumeEngagementReveal(): EngagementReveal? = take { it.consumeEngagementReveal() }

    fun consumeForcedReadingMode(): ConversationReadingMode? = take { it.consumeForcedReadingMode() }

    fun consumeReply(conversationId: String): ReplyContextRequest? = take { it.consumeReply(conversationId) }

    fun consumeMessageJump(conversationId: String): String? = take { it.consumeMessageJump(conversationId) }

    /** Rend ce que [consume] ramasse et applique l'état suivant, en une seule transition atomique. */
    private fun <T> take(consume: (DeferredNavigation) -> Pair<T, DeferredNavigation>): T {
        while (true) {
            val before = _state.value
            val (taken, after) = consume(before)
            if (_state.compareAndSet(before, after)) return taken
        }
    }
}
