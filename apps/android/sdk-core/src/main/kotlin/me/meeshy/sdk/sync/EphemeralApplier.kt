package me.meeshy.sdk.sync

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.SharedFlow
import me.meeshy.sdk.conversation.MessageDeltaApplier
import me.meeshy.sdk.model.ConversationSocketEvent
import me.meeshy.sdk.model.MessageConsumedEvent
import me.meeshy.sdk.model.MessageCountdownStartedEvent
import me.meeshy.sdk.model.MessageViewOncePurgedEvent
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.ConversationSocketEventsManager

/**
 * Les trois événements ÉPHÉMÈRES du relais permanent, écrits en Room conversation ouverte OU NON (miroir des
 * `viewOnceRoutes` et de `message:countdown-started` branchés sur `MessagePersistenceActor`, iOS) :
 *
 * - `message:countdown-started` : l'échéance SERVIE (temps serveur) devient celle de la bulle ;
 * - `message:consumed` : seul le lecteur concerné voit SA bulle passer à « déjà ouverte » ; les autres ne tiennent que le
 *   compteur `viewOnceCount` ;
 * - `message:view-once-purged` : le contenu est vidé, la bulle reste (« Vu et supprimé »).
 *
 * Les règles vivent dans `ConversationEventDeltas` (`:core:model`) via [MessageDeltaApplier] : appliquer deux fois (le
 * fil ouvert reçoit le même événement) n'écrit rien de plus. `message:expired` reste servi par `MessageRealtimeApplier`.
 */
@Singleton
class EphemeralApplier internal constructor(
    private val events: SharedFlow<ConversationSocketEvent>,
    private val deltas: suspend (ConversationSocketEvent, String?) -> Boolean,
    private val viewer: () -> String?,
) : RealtimeCacheApplier {

    @Inject
    constructor(
        socket: ConversationSocketEventsManager,
        applier: MessageDeltaApplier,
        session: SessionRepository,
    ) : this(socket.events, applier::apply, { session.currentUserId })

    override fun subscribe(registrar: RelayRegistrar) {
        registrar.relay(events, OrderedEventLane.Family.MESSAGES) { event ->
            if (event.isEphemeral()) deltas(event, viewer())
        }
    }

    private fun ConversationSocketEvent.isEphemeral(): Boolean =
        this is MessageCountdownStartedEvent || this is MessageConsumedEvent || this is MessageViewOncePurgedEvent
}

@Module
@InstallIn(SingletonComponent::class)
internal interface EphemeralApplierModule {
    @Binds
    @IntoSet
    fun bindApplier(applier: EphemeralApplier): RealtimeCacheApplier
}
