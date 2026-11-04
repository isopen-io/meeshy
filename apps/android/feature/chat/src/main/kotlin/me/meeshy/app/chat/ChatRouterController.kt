package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.chat.ChatRouterBus
import me.meeshy.sdk.model.navigation.ChatRouterDelivery
import me.meeshy.sdk.model.navigation.ReplyContextRequest

/** Ce que le routeur demande au fil ouvert, appliqué par l'écran. */
sealed interface ChatRouterEvent {
    data class Highlight(val messageId: String) : ChatRouterEvent
    data object OpenSearch : ChatRouterEvent
}

/**
 * Les demandes du routeur au fil ouvert (iOS `ConversationRouterWatch`) : atterrir sur un message, ouvrir la recherche,
 * contexte de réponse. Ramassées à l'ouverture ET à chaud (le fil est déjà visible quand la demande arrive), UNE fois
 * et seulement pour CETTE conversation : la demande d'une autre n'est ni consommée ni brûlée.
 */
class ChatRouterController @Inject constructor(
    private val bus: ChatRouterBus,
) : ChatController {

    private val channel = Channel<ChatRouterEvent>(Channel.BUFFERED)

    /** Les événements à appliquer, dans l'ordre : atterrissage puis recherche. */
    val events: Flow<ChatRouterEvent> = channel.receiveAsFlow()

    private val _replyContext = MutableStateFlow<ReplyContextRequest?>(null)

    /** Le contexte de réponse reçu (story, humeur), tenu jusqu'à ce que le composeur le prenne. */
    val replyContext: StateFlow<ReplyContextRequest?> = _replyContext.asStateFlow()

    fun replyContextTaken() {
        _replyContext.value = null
    }

    override fun attach(host: ChatControllerHost) {
        host.scope.launch {
            bus.state.collect {
                try {
                    deliver(bus.consume(host.conversationId))
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                }
            }
        }
    }

    private fun deliver(delivery: ChatRouterDelivery) {
        delivery.highlightMessageId?.let { channel.trySend(ChatRouterEvent.Highlight(it)) }
        if (delivery.openSearch) channel.trySend(ChatRouterEvent.OpenSearch)
        delivery.replyContext?.let { _replyContext.value = it }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ChatRouterControllerModule {

    @Binds
    @IntoSet
    abstract fun controller(impl: ChatRouterController): ChatController
}
