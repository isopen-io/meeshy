package me.meeshy.sdk.sync

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.chat.LocallyHiddenMessagesStore
import me.meeshy.sdk.chat.StarredMessagesStore
import me.meeshy.sdk.conversation.MessageDeltaApplier
import me.meeshy.sdk.conversation.OpenConversationLookup
import me.meeshy.sdk.model.AttachmentReactionUpdateEvent
import me.meeshy.sdk.model.ConversationSocketEvent
import me.meeshy.sdk.model.MessageHiddenForMeEvent
import me.meeshy.sdk.model.MessageRestoredForMeEvent
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.ConversationSocketEventsManager
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.collectArrived
import timber.log.Timber

/**
 * Les réactions de pièces jointes et les marques PERSONNELLES (masqué pour moi, restauré, favori) atteignent le cache
 * et les magasins locaux même conversation FERMÉE (miroir d'iOS `applyHiddenForMe` / `applyRestoredForMe`).
 *
 * - `attachment:reaction-added|removed` : le résumé servi remplace le local ; si l'auteur est ce lecteur (`User.id`), « ma
 *   réaction » suit. Une conversation ouverte garde la main (son contrôleur applique le même delta) ; le delta est
 *   idempotent, un rejeu n'écrit rien.
 * - `message:hidden-for-me` : la ligne est purgée (pas de pierre tombale), l'étoile éventuelle est retirée, l'id rejoint
 *   le magasin des masqués pour qu'une relecture ne le ressuscite pas.
 * - `message:restored-for-me` : l'id quitte le magasin des masqués ; la ligne, purgée, se relit à la prochaine ouverture.
 */
class ReactionMarksApplier(
    private val deltas: MessageDeltaApplier,
    private val hidden: LocallyHiddenMessagesStore,
    private val starred: StarredMessagesStore,
    private val openConversations: OpenConversationLookup,
    private val viewerId: () -> String?,
) {
    suspend fun apply(event: ConversationSocketEvent) {
        when (event) {
            is AttachmentReactionUpdateEvent -> if (!openConversations.isOpen(event.conversationId)) deltas.apply(event, viewerId())
            is MessageHiddenForMeEvent -> {
                val ids = event.messages.map { it.messageId }
                ids.forEach { starred.unstar(it); hidden.hide(it) }
                deltas.apply(event, viewerId())
            }
            is MessageRestoredForMeEvent -> event.messages.forEach { hidden.unhide(it.messageId) }
            else -> Unit
        }
    }
}

/** Branche [ReactionMarksApplier] sur le flux de la famille « fil » ; chaque trame est isolée (try/catch). */
@Singleton
class ReactionMarksBinding @Inject constructor(
    private val events: ConversationSocketEventsManager,
    deltas: MessageDeltaApplier,
    hidden: LocallyHiddenMessagesStore,
    starred: StarredMessagesStore,
    openConversations: OpenConversationLookup,
    session: SessionRepository,
    @IoDispatcher io: CoroutineDispatcher,
) : RealtimeBinding {
    private val applier = ReactionMarksApplier(deltas, hidden, starred, openConversations) { session.currentUser.value?.id }
    private val scope = CoroutineScope(SupervisorJob() + io)
    private var job: Job? = null

    override fun attach() {
        job?.cancel()
        job = scope.launch {
            events.events.collectArrived { event ->
                try {
                    applier.apply(event)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    Timber.w(failure, "Marques personnelles : écriture en échec")
                }
            }
        }
    }

    override fun detach() {
        job?.cancel()
        job = null
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface ReactionMarksModule {
    @Binds
    @IntoSet
    fun bindRealtime(binding: ReactionMarksBinding): RealtimeBinding
}
