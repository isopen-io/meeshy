package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.socket.MessageSocketManager

/**
 * Le fil ouvert se ferme quand sa conversation n'existe plus pour personne (#14645) : `conversation:closed`
 * (suppression pour tous, et toute obsolescence, qui le précède) ou `conversation:obsoleted`. L'écran lit
 * [ended] et revient à la liste, une seule fois, que la fin vienne d'ici ou d'un autre membre.
 */
class ConversationEndController @Inject constructor(
    private val messageSocketManager: MessageSocketManager,
) : ChatController {

    private val _ended = MutableStateFlow(false)
    val ended: StateFlow<Boolean> = _ended.asStateFlow()

    override fun attach(host: ChatControllerHost) {
        val id = host.conversationId
        host.scope.launch {
            messageSocketManager.conversationClosed.collect { if (it.conversationId == id) _ended.value = true }
        }
        host.scope.launch {
            messageSocketManager.conversationObsoleted.collect { if (it.conversationId == id) _ended.value = true }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ConversationEndControllerModule {

    @Binds
    @IntoSet
    abstract fun controller(impl: ConversationEndController): ChatController
}
