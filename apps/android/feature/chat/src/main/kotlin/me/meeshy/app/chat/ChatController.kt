package me.meeshy.app.chat

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.conversation.LocalMessage

/**
 * One self-contained slice of the conversation screen's logic, contributed by a lot
 * through the `@IntoSet` multibinding of [ChatControllerModule].
 *
 * A contributed controller keeps ITS OWN state in ITS OWN `StateFlow` (the screen collects
 * it next to [ChatViewModel.state], found through [ChatViewModel.controllers]) and reads
 * the screen through the narrow [ChatControllerHost] it is attached to. It never adds a
 * field to [ChatUiState]: that state is frozen.
 *
 * The four slices that were carved out of [ChatViewModel] (composer, reactions,
 * translation, reply-jump) are built by the ViewModel from its own constructor
 * dependencies; every slice that comes after them is a [ChatController].
 *
 * Implementations are unscoped Hilt bindings, so each [ChatViewModel] (one per open
 * conversation) receives fresh instances and their per-conversation state dies with it.
 */
interface ChatController {

    /**
     * Binds the controller to the open conversation, once, from the ViewModel's init.
     * Start collectors on [ChatControllerHost.scope] — they are cancelled with the screen.
     */
    fun attach(host: ChatControllerHost)

    /** Releases what lives outside [ChatControllerHost.scope] (emitters, listeners). */
    fun detach() {}
}

/** What a [ChatController] may see of the screen it is attached to. */
interface ChatControllerHost {

    /** The open conversation's id. */
    val conversationId: String

    /** The screen's scope: cancelled when the conversation is left. */
    val scope: CoroutineScope

    /** Read-only view of the screen state — observe or snapshot, never write. */
    val uiState: StateFlow<ChatUiState>

    /** The cached message window (the raw [LocalMessage]s behind the bubbles). */
    val messages: StateFlow<List<LocalMessage>>

    /** Surfaces a failure through the screen's single error channel. */
    fun reportError(message: String?)
}

/**
 * The controllers contributed to one [ChatViewModel], looked up by type — how a screen
 * host reaches the `StateFlow` of the controller its lot added.
 */
class ChatControllers(controllers: Set<ChatController>) {

    private val all: List<ChatController> = controllers.toList()

    /** The contributed controller of [type], or `null` when no lot contributed one. */
    fun <T : ChatController> find(type: Class<T>): T? = all.filterIsInstance(type).firstOrNull()

    /** [find] by reified type: `viewModel.controllers.find<GalleryController>()`. */
    inline fun <reified T : ChatController> find(): T? = find(T::class.java)

    /**
     * Attaches every controller. A controller that throws while attaching is skipped — a
     * lot's failure never takes the conversation screen down with it.
     */
    internal fun attachAll(host: ChatControllerHost) {
        all.forEach { controller ->
            try {
                controller.attach(host)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
            }
        }
    }

    internal fun detachAll() {
        all.forEach { controller ->
            try {
                controller.detach()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
            }
        }
    }
}

/** The [ChatControllerHost] a [ChatViewModel] hands to the controllers it carries. */
internal class ChatScreenHost(
    override val conversationId: String,
    override val scope: CoroutineScope,
    private val state: ChatStateAccess,
    override val messages: StateFlow<List<LocalMessage>>,
) : ChatControllerHost {

    override val uiState: StateFlow<ChatUiState> get() = state.flow

    override fun reportError(message: String?) {
        state.update { it.copy(errorMessage = message) }
    }
}
