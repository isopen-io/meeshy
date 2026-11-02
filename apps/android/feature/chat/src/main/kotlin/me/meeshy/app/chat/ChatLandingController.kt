package me.meeshy.app.chat

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.conversation.MessageLanding
import me.meeshy.sdk.conversation.MessageRepository

/**
 * #14670 — what the landing adds to the screen, held by [ChatLandingController] and never by [ChatUiState]:
 * [hasMoreNewer] says the window is anchored on an old message with the present further down,
 * [highlightedMessageId] is the message lit for an instant once the list reaches it.
 */
internal data class ChatLandingState(
    val hasMoreNewer: Boolean = false,
    val isLoadingNewer: Boolean = false,
    val highlightedMessageId: String? = null,
) {
    /** The list is at the present only at the bottom of a window that reaches it: until then, ↓ stays. */
    fun isAtPresent(isNearBottom: Boolean): Boolean = isNearBottom && !hasMoreNewer
}

/**
 * #14670 — opening a conversation ON a message (a search hit, a link, a notification), like iOS
 * `loadMessagesAround` and the web `?message=`: the window centred on it is loaded when it is out of
 * reach, the list scrolls to it once it is drawn, and it is lit for an instant. An anchored window pages
 * newer ([loadNewer]) until the present, or returns to it at once ([returnToPresent]).
 */
internal class ChatLandingController(
    private val conversationId: String,
    private val screen: ChatStateAccess,
    private val messages: MessageRepository,
    private val scope: CoroutineScope,
) {
    private val landing = MutableStateFlow(ChatLandingState())
    val state: StateFlow<ChatLandingState> = landing.asStateFlow()

    fun land(messageId: String) {
        scope.launch {
            val found = loadAround(messageId)
            if (found == MessageLanding.NotFound) return@launch
            if (found is MessageLanding.Anchored) {
                landing.update { it.copy(hasMoreNewer = found.hasNewer) }
                screen.update { it.copy(hasMoreOlder = found.hasOlder) }
            }
            withTimeoutOrNull(LANDING_WAIT_MS) {
                screen.flow.first { current -> current.messages.any { it.messageId == messageId } }
            } ?: return@launch
            screen.update { it.copy(scrollToMessageId = messageId) }
            landing.update { it.copy(highlightedMessageId = messageId) }
            delay(HIGHLIGHT_MS)
            landing.update { if (it.highlightedMessageId == messageId) it.copy(highlightedMessageId = null) else it }
        }
    }

    fun loadNewer() {
        val current = landing.value
        if (!current.hasMoreNewer || current.isLoadingNewer) return
        landing.update { it.copy(isLoadingNewer = true) }
        scope.launch {
            val more = try {
                messages.loadNewer(conversationId)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                landing.update { it.copy(isLoadingNewer = false) }
                screen.update { it.copy(errorMessage = e.message) }
                return@launch
            }
            landing.update { it.copy(isLoadingNewer = false, hasMoreNewer = more) }
        }
    }

    /**
     * « Back to the present » quits the anchored window for the recent page, read from the server: the
     * cache may stop where the anchored walk did, long before today.
     */
    fun returnToPresent() {
        landing.update { it.copy(hasMoreNewer = false, isLoadingNewer = false) }
        screen.update { it.copy(hasMoreOlder = true) }
        scope.launch {
            try {
                messages.jumpToPresent(conversationId)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                screen.update { it.copy(errorMessage = e.message) }
            }
        }
    }

    private suspend fun loadAround(messageId: String): MessageLanding? = try {
        messages.loadAround(conversationId, messageId)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }

    private companion object {
        const val LANDING_WAIT_MS = 5_000L
        const val HIGHLIGHT_MS = 2_000L
    }
}
