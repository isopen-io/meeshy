package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.conversation.MessageConsumption
import me.meeshy.sdk.model.AfterReadVisit

/**
 * La flamme-œil côté lecteur (#13995) — miroir de iOS `ConversationViewModel+AfterRead` :
 * le fil remonte ce qu'il AFFICHE ([noteDisplayed]), la visite retient les flammes-œil reçues,
 * et la SORTIE ([consumeOnExit] — retour, arrière-plan, écran quitté) les consomme : elles quittent
 * le cache tout de suite, puis le serveur par l'outbox.
 */
class AfterReadController @Inject constructor(
    private val consumption: MessageConsumption,
    private val sessionRepository: SessionRepository,
) : ChatController {

    private var host: ChatControllerHost? = null
    private val visit = AtomicReference(AfterReadVisit())

    override fun attach(host: ChatControllerHost) {
        this.host = host
    }

    /** Les messages que le fil montre en ce moment (ids serveur). */
    fun noteDisplayed(messageIds: Collection<String>) {
        val host = host ?: return
        if (messageIds.isEmpty()) return
        val viewer = sessionRepository.currentUser.value?.id
        val among = host.messages.value.map { it.message }
        visit.updateAndGet { it.noting(messageIds, among) { message -> viewer != null && message.senderId == viewer } }
    }

    /** La sortie : ce qui a été vu part ; une seconde sortie ne trouve plus rien. */
    fun consumeOnExit() {
        val host = host ?: return
        val (ids, _) = visit.getAndSet(AfterReadVisit()).takeAll()
        consumption.consumeAfterRead(host.conversationId, ids)
    }

    /** La vue unique lue puis refermée consomme son compteur serveur (iOS `consumeViewOnce`). */
    fun consumeViewOnce(messageId: String) {
        val host = host ?: return
        consumption.consumeViewOnce(host.conversationId, messageId)
    }

    override fun detach() {
        consumeOnExit()
        host = null
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class AfterReadControllerModule {

    @Binds
    @IntoSet
    abstract fun controller(impl: AfterReadController): ChatController
}
