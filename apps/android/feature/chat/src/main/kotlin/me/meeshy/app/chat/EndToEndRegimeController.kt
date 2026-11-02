package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.EndToEndRegimeKeeper
import me.meeshy.sdk.model.EndToEndRegimeMemory
import me.meeshy.sdk.model.isDirect
import javax.inject.Inject

/**
 * **CE QUE LE FIL MONTRE DU BOUT EN BOUT, LE COMPTE L'APPREND** (#12956) — l'avis d'activation,
 * partout ; un message e2ee, dans un tête-à-tête. Inscrit au registre du compte, la conversation
 * ne repasse jamais au clair, même servie sans mode par une passerelle compromise. Un chiffré sans
 * mode, ou un e2ee de groupe, ne s'apprend pas : il retient l'envoi tant qu'il est montré
 * (`ChatUiState.isEndToEnd`, #13099).
 */
class EndToEndRegimeController @Inject constructor(
    private val keeper: EndToEndRegimeKeeper,
    private val conversationRepository: ConversationRepository,
) : ChatController {

    override fun attach(host: ChatControllerHost) {
        // La forme de la conversation n'est lue qu'une fois la ligne connue : avant, un message
        // e2ee d'un groupe se prendrait pour celui d'un tête-à-tête.
        val isDirect = conversationRepository.conversationStream(host.conversationId)
            .filterNotNull()
            .map { it.isDirect }
            .distinctUntilChanged()
        host.scope.launch {
            combine(host.messages, isDirect) { messages, direct ->
                EndToEndRegimeMemory.threadShowsEndToEnd(messages.map { it.message }, isDirect = direct)
            }
                .distinctUntilChanged()
                .filter { it }
                .collect { keeper.learn(host.conversationId) }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class EndToEndRegimeControllerModule {

    @Binds
    @IntoSet
    abstract fun controller(impl: EndToEndRegimeController): ChatController
}
