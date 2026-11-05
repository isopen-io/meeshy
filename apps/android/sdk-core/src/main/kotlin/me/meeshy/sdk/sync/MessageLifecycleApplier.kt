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
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.conversation.MessageDeltaApplier
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.OpenConversationLookup
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.AttachmentStatusUpdatedEvent
import me.meeshy.sdk.model.ConversationSocketEvent
import me.meeshy.sdk.model.MentionCreatedEvent
import me.meeshy.sdk.model.MentionLedger
import me.meeshy.sdk.model.MeeshyNotificationType
import me.meeshy.sdk.model.MessageCitedPostWithdrawnEvent
import me.meeshy.sdk.model.PendingMessagesDeliveredEvent
import me.meeshy.sdk.notification.NotificationIngestPipeline
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.ConversationSocketEventsManager
import me.meeshy.sdk.socket.MessageLifecycleSocketEvents
import me.meeshy.sdk.socket.RealtimeBinding
import timber.log.Timber

/**
 * Le cycle de vie d'un message écrit en Room conversation ouverte OU NON (miroir de `ConversationSocketHandler` +
 * `MessagePersistenceActor`, iOS) :
 *
 * - `message:cited-post-withdrawn` : chaque citation du post devient « Story indisponible » en une écriture ;
 * - `attachment-status:updated` : l'état d'écoute / visionnage / téléchargement de la pièce — jamais dans une conversation
 *   chiffrée de bout en bout (donnée serveur en clair) ;
 * - `message:pending-delivered` : la file hors ligne vient d'être rejouée, chaque fil touché est relu UNE fois (coalescé).
 *   Une conversation ouverte garde la main : son contrôleur relit déjà le sien.
 *
 * Les règles vivent dans `ConversationEventDeltas` / `AttachmentLiveDeltas` (`:core:model`) via [MessageDeltaApplier] : le
 * fil ouvert reçoit le même événement, l'appliquer deux fois n'écrit rien de plus.
 */
@Singleton
class MessageLifecycleApplier internal constructor(
    private val events: SharedFlow<ConversationSocketEvent>,
    private val deltas: suspend (ConversationSocketEvent, String?) -> Boolean,
    private val viewer: () -> String?,
    private val isSealed: (String) -> Boolean,
    private val isOpen: (String) -> Boolean,
    private val refresher: PendingDeliveredRefresher,
) : RealtimeCacheApplier {

    @Inject
    constructor(
        socket: ConversationSocketEventsManager,
        applier: MessageDeltaApplier,
        session: SessionRepository,
        regime: EndToEndRegimeLedger,
        openConversations: OpenConversationLookup,
        messages: MessageRepository,
        @IoDispatcher io: CoroutineDispatcher,
    ) : this(
        socket.events, applier::apply, { session.currentUserId }, regime::isSealed, openConversations::isOpen,
        PendingDeliveredRefresher(CoroutineScope(SupervisorJob() + io)) { messages.refresh(it) },
    )

    override fun subscribe(registrar: RelayRegistrar) {
        registrar.relay(events, OrderedEventLane.Family.MESSAGES) { event -> apply(event) }
    }

    private suspend fun apply(event: ConversationSocketEvent) {
        when (event) {
            is MessageCitedPostWithdrawnEvent -> deltas(event, viewer())
            is AttachmentStatusUpdatedEvent -> if (!isSealed(event.conversationId)) deltas(event, viewer())
            is PendingMessagesDeliveredEvent -> refresher.request(event.conversationIds.filterNot(isOpen))
            else -> Unit
        }
    }
}

/**
 * Relit chaque fil nommé UNE fois : les demandes qui arrivent pendant la fenêtre [windowMs] (plusieurs `pending-delivered`
 * d'affilée, plusieurs appareils) se fondent en un ensemble, puis chaque fil part en lecture, l'un après l'autre. Une lecture
 * en échec est isolée : le fil se relira à sa prochaine ouverture.
 */
class PendingDeliveredRefresher(
    private val scope: CoroutineScope,
    private val windowMs: Long = WINDOW_MS,
    private val refresh: suspend (String) -> Unit,
) {
    private val lock = Any()
    private val pending = LinkedHashSet<String>()
    private var worker: Job? = null

    fun request(conversationIds: Collection<String>) {
        val ids = conversationIds.filter { it.isNotBlank() }
        if (ids.isEmpty()) return
        synchronized(lock) {
            pending += ids
            if (worker?.isActive == true) return
            worker = scope.launch { drain() }
        }
    }

    private suspend fun drain() {
        delay(windowMs)
        while (true) {
            val id = synchronized(lock) { pending.firstOrNull()?.also { pending -= it } } ?: break
            try {
                refresh(id)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                Timber.w(failure, "message:pending-delivered : relecture du fil en échec")
            }
        }
        synchronized(lock) { if (pending.isEmpty()) worker = null else worker = scope.launch { drain() } }
    }

    companion object {
        const val WINDOW_MS = 300L
    }
}

/**
 * Le badge des mentions non lues, nourri par `mention:created` (conversation ouverte ou non). Une mention rejouée ne compte
 * pas deux fois (registre par identifiant de message), et celle que `notification:new` a déjà annoncée ne déclenche pas de
 * seconde alerte : [alerts] n'émet que pour une mention que personne n'a encore dite.
 */
@Singleton
class MentionBadgeStore @Inject constructor() {
    private val _ledger = MutableStateFlow(MentionLedger())
    private val _alerts = MutableSharedFlow<MentionCreatedEvent>(extraBufferCapacity = 8)

    val ledger: StateFlow<MentionLedger> = _ledger.asStateFlow()

    /** Les mentions qui méritent une alerte in-app. */
    val alerts: SharedFlow<MentionCreatedEvent> = _alerts.asSharedFlow()

    fun onMentionCreated(event: MentionCreatedEvent, viewerId: String?, conversationIsOpen: Boolean) {
        var due = false
        _ledger.update { current ->
            val outcome = current.onMentionCreated(event, viewerId, conversationIsOpen)
            due = outcome.alertDue
            outcome.ledger
        }
        if (due) _alerts.tryEmit(event)
    }

    fun onNotificationAnnounced(messageId: String) = _ledger.update { it.onNotification(messageId) }

    fun onConversationRead(conversationId: String) = _ledger.update { it.onRead(conversationId) }

    fun reset() {
        _ledger.value = MentionLedger()
    }
}

/** Branche le badge sur `mention:created` et sur les `notification:new` de mention (pour ne pas annoncer deux fois). */
@Singleton
class MentionBadgeBinding @Inject constructor(
    private val socket: MessageLifecycleSocketEvents,
    private val notifications: NotificationIngestPipeline,
    private val store: MentionBadgeStore,
    private val session: SessionRepository,
    private val openConversations: OpenConversationLookup,
    @IoDispatcher io: CoroutineDispatcher,
) : RealtimeBinding {
    private val scope = CoroutineScope(SupervisorJob() + io)
    private var jobs: List<Job> = emptyList()

    override fun attach() {
        detach()
        jobs = listOf(
            scope.launch {
                socket.mentionCreated.collect { event ->
                    guarded { store.onMentionCreated(event, session.currentUserId, openConversations.isOpen(event.conversationId)) }
                }
            },
            scope.launch {
                notifications.arrived.collect { notification ->
                    guarded {
                        val type = notification.notificationType
                        val isMention = type == MeeshyNotificationType.MENTION || type == MeeshyNotificationType.USER_MENTIONED
                        notification.context?.messageId?.takeIf { isMention }?.let(store::onNotificationAnnounced)
                    }
                }
            },
        )
    }

    override fun detach() {
        jobs.forEach { it.cancel() }
        jobs = emptyList()
        store.reset()
    }

    private inline fun guarded(block: () -> Unit) {
        try {
            block()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
            Timber.w(failure, "mention:created : écriture en échec")
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface MessageLifecycleApplierModule {
    @Binds
    @IntoSet
    fun bindApplier(applier: MessageLifecycleApplier): RealtimeCacheApplier

    @Binds
    @IntoSet
    fun bindMentionBadge(binding: MentionBadgeBinding): RealtimeBinding
}
