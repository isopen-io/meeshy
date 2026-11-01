package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.DirectConversationResolution
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.BlockedListRepository
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.AttachmentMessageType
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.interlocutor
import me.meeshy.sdk.model.mayCurrentUserWrite
import me.meeshy.sdk.model.share.OutgoingShare
import me.meeshy.sdk.model.share.ShareAction
import me.meeshy.sdk.model.share.ShareFailure
import me.meeshy.sdk.model.share.ShareDelivery
import me.meeshy.sdk.model.share.ShareMedia
import me.meeshy.sdk.model.share.ShareOutgoingBuilder
import me.meeshy.sdk.model.share.ShareOutgoingResult
import me.meeshy.sdk.model.share.SharePlan
import me.meeshy.sdk.model.share.SharePlanner
import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.model.share.ShareRecipientListing
import me.meeshy.sdk.model.share.ShareSheetState
import me.meeshy.sdk.model.share.ShareSubject
import me.meeshy.sdk.model.share.TrackedShareCard
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.outbox.OutOfThreadAdmission
import me.meeshy.sdk.outbox.OutOfThreadSendGate
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.post.PostShareLinkService
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.session.asCoroutineContext
import me.meeshy.sdk.share.ShareRecipientDirectory

/** Tout ce que l'hôte d'application de la feuille unique sait (#13477) ; la vue lit [AppShareSheetViewModel.model]. */
internal data class AppShareState(
    val subject: ShareSubject? = null,
    val sheet: ShareSheetState = ShareSheetState(),
    val conversations: List<ShareRecipient> = emptyList(),
    val people: List<ShareRecipient> = emptyList(),
    val contentLines: List<String> = emptyList(),
    /** Ce que le partage entrant a laissé derrière lui (source refusée, trop lourd, illisible, au-delà du plafond), une ligne par sorte. */
    val notices: List<String> = emptyList(),
    val isLoading: Boolean = true,
    val isOffline: Boolean = false,
    /** La session se restaure encore (démarrage à froid d'un partage entrant) : un chargement, jamais « connectez-vous » à tort. */
    val isSessionLoading: Boolean = false,
    val isSignedOut: Boolean = false,
)

/**
 * Le moteur de **la feuille de partage unique** hors du fil (#13469, #13474, #13476, #13477) : une story,
 * un post, un réel, un profil, un lien, ou ce qu'une autre app remet — toutes les portes posent UN
 * [ShareSubject] ([bind]) et cette feuille fait le reste.
 *
 * - **Cache d'abord** : les conversations (flux cache puis réseau), les amis acceptés (Room) et la liste
 *   des bloqués (Room → [BlockCache], hydratée à l'ouverture) se peignent avant toute requête ; jamais de
 *   spinner sur un cache non vide.
 * - **Optimiste et durable** : chaque rangée passe à « envoi » au toucher d'Envoyer ; chaque copie est une
 *   bulle locale plus une entrée de file durable ([MessageRepository.sendOptimistic]) — hors ligne, elle
 *   part au retour du réseau, feuille fermée ou non. Un échec ne retourne que sa propre rangée.
 * - **Une personne sans conversation** : la directe est retrouvée ou créée à l'envoi
 *   ([ConversationRepository.directConversationWith]) ; hors ligne sans cache, la rangée dit qu'elle ne
 *   peut pas être jointe.
 * - **E2EE, échec fermé** : Android ne chiffre pas encore (#13015). Une conversation chiffrée n'est jamais
 *   proposée, et une directe qui naît (ou se trouve) chiffrée est refusée AVANT tout envoi : jamais de
 *   clair vers un fil chiffré. Le cache ne suffit pas (#13820) : le mode de chaque destination est RELU au serveur
 *   ([OutOfThreadSendGate]) avant qu'une bulle ou un fichier n'entre en file ; illisible maintenant (hors ligne), la copie
 *   entre en file « en attente » et la file relit le mode avant tout clair, pièce comprise.
 * - **« Envoyer » emporte le lien de l'utilisateur** (#14315, iOS `TrackedShareLink`) : pour un post, un réel ou une
 *   story publique, le lien suivi est frappé (ou retrouvé) DÈS l'ouverture, en parallèle des destinataires, et la
 *   carte le porte à sa place ; hors ligne ou en échec, l'adresse directe reste.
 */
@HiltViewModel
internal class AppShareSheetViewModel @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val messageRepository: MessageRepository,
    private val sessionRepository: SessionRepository,
    private val workManager: WorkManager,
    private val mediaUploadQueue: MediaUploadQueue,
    private val friendListRepository: FriendListRepository,
    private val blockedListRepository: BlockedListRepository,
    private val blockCache: BlockCache,
    private val networkMonitor: NetworkMonitor,
    private val outOfThread: OutOfThreadSendGate,
    private val trackedLinks: PostShareLinkService,
) : ViewModel() {

    private val _state = MutableStateFlow(AppShareState())
    val state: StateFlow<AppShareState> = _state.asStateFlow()

    private var conversations: List<ApiConversation> = emptyList()
    private var friends: List<me.meeshy.sdk.model.FriendRequestUser> = emptyList()
    private var incomingItems: List<MediaUploadItem> = emptyList()
    private var loadJob: Job? = null
    private var linkJob: Job? = null
    private var bound: ShareSubject? = null
    private val inFlight = mutableSetOf<String>()
    private var activeSends = 0
    private var cleared = false
    private val releaseWhenIdle = mutableListOf<MediaUploadItem>()

    init {
        viewModelScope.launch {
            combine(sessionRepository.currentUser, sessionRepository.hasResolvedStoredSession) { user, resolved -> user to resolved }
                .collect { (user, resolved) ->
                    _state.update { it.copy(isSessionLoading = user == null && !resolved, isSignedOut = user == null && resolved) }
                    recompute()
                }
        }
        viewModelScope.launch {
            networkMonitor.isOnline.collect { online -> _state.update { it.copy(isOffline = !online) } }
        }
        viewModelScope.launch {
            blockCache.version.collect { recompute() }
        }
        if (sessionRepository.currentUser.value == null) viewModelScope.launch { sessionRepository.refresh() }
    }

    /** Pose le sujet (la porte) et charge les destinataires. Rappeler avec le même sujet ne change rien. */
    fun bind(subject: ShareSubject) {
        if (bound == subject && _state.value.subject != null) return
        incomingItems = emptyList()
        open(subject, lines = linesOf(subject))
        bound = subject
        mintTrackedLink(subject)
    }

    /** Le lien suivi remplace l'adresse directe de la carte dès qu'il est frappé, tant que la feuille montre ce sujet. */
    private fun mintTrackedLink(subject: ShareSubject) {
        val card = (subject as? ShareSubject.Card)?.card?.takeIf(TrackedShareCard::mints) ?: return
        linkJob = viewModelScope.launch {
            val target = trackedLinks.resolve(card.contentId, TrackedShareCard.Gesture.SEND.platform)
            if (!target.tracked || _state.value.subject != subject) return@launch
            val upgraded = ShareSubject.Card(TrackedShareCard.withLink(card, target.url))
            _state.update { it.copy(subject = upgraded, contentLines = linesOf(upgraded)) }
        }
    }

    /**
     * La porte « autre app » : [items] sont les fichiers déjà copiés dans le cache privé (jugés par
     * [me.meeshy.app.composer.inbound.InboundShareIntake] côté activité). Un partage sans texte ni fichier ne
     * s'ouvre pas : la feuille n'a rien à envoyer.
     */
    fun bindIncoming(text: String?, items: List<MediaUploadItem>, notices: List<String> = emptyList()) {
        release(incomingItems.filterNot { it in items })
        incomingItems = items
        val media = items.mapIndexed { index, item ->
            ShareMedia(id = "incoming:$index", mimeType = item.mimeType, bytes = item.sizeBytes)
        }
        val subject = ShareSubject.Incoming(text?.trim()?.takeIf { it.isNotEmpty() }, media)
        open(subject, lines = listOfNotNull(subject.text) + items.map { it.fileName }, notices = notices)
    }

    /** La feuille est fermée : rien n'est gardé, la prochaine porte repart d'un état neuf. */
    fun reset() {
        loadJob?.cancel()
        linkJob?.cancel()
        bound = null
        inFlight.clear()
        _state.update { it.copy(subject = null, sheet = ShareSheetState(), contentLines = emptyList(), notices = emptyList()) }
    }

    private fun open(subject: ShareSubject, lines: List<String>, notices: List<String> = emptyList()) {
        inFlight.clear()
        linkJob?.cancel()
        bound = null
        _state.update { it.copy(subject = subject, sheet = ShareSheetState(), contentLines = lines, notices = notices) }
        recompute()
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            launch { loadPeople() }
            conversationRepository.conversationsStream().collect { result ->
                val loaded = result.valueOrNull
                conversations = loaded ?: conversations
                _state.update { it.copy(isLoading = loaded == null && conversations.isEmpty()) }
                recompute()
            }
        }
    }

    private suspend fun loadPeople() {
        blockedListRepository.cachedSnapshot()?.let(blockCache::hydrate)
        friends = friendListRepository.cachedSnapshot().orEmpty()
        recompute()
    }

    fun onQueryChange(query: String) = update { it.copy(sheet = it.sheet.withQuery(query)) }

    fun onCaptionChange(text: String) = update { it.copy(sheet = it.sheet.withCaption(text)) }

    fun onDurationChange(seconds: Int) = update { state ->
        val plan = planOf(state) ?: return@update state
        state.copy(sheet = state.sheet.withDuration(seconds, plan))
    }

    /** Toucher une rangée la coche ; la retoucher la décoche ; une rangée déjà servie est inerte. */
    fun toggle(recipient: ShareRecipient) = update { it.copy(sheet = it.sheet.toggled(recipient)) }

    /**
     * Envoie vers chaque destinataire coché pas encore servi. La rangée passe à « envoi » tout de suite ;
     * la copie est une bulle locale et une entrée durable. Le plan est relu au toucher : rien ne part s'il
     * ne le permet pas.
     */
    fun send() {
        val state = _state.value
        val subject = state.subject ?: return
        val user = sessionRepository.currentUser.value ?: return
        if (planOf(state)?.canSend != true) return
        val pending = state.sheet.pending.filter { it.id !in inFlight }
        if (pending.isEmpty()) return
        val built = ShareOutgoingBuilder.build(subject, emptySet(), state.sheet.caption, state.sheet.chosenDurationSeconds)
        if (built is ShareOutgoingResult.Refused) {
            pending.forEach { mark(it, ShareDelivery.Failed(built.failure)) }
            return
        }
        val posts = (built as ShareOutgoingResult.Ready).messages
        pending.forEach { inFlight += it.id; mark(it, ShareDelivery.Sending) }
        // #13558 : le partage appartient au compte qui a touché « Envoyer ».
        val gesture = mediaUploadQueue.ticket()
        activeSends += 1
        // Fermer la feuille juste après « Envoyer » n'interrompt pas l'envoi : chaque destinataire coché part,
        // et la copie reçue n'est libérée qu'une fois le dernier mis en file.
        viewModelScope.launch(gesture.asCoroutineContext() + NonCancellable) {
            try {
                deliverAll(pending, subject, posts, state.sheet.caption, user)
            } finally {
                activeSends -= 1
                if (activeSends == 0) {
                    release(releaseWhenIdle.toList())
                    releaseWhenIdle.clear()
                    if (cleared) release(incomingItems)
                }
            }
        }
    }

    private suspend fun deliverAll(pending: List<ShareRecipient>, subject: ShareSubject, posts: List<OutgoingShare>, caption: String, user: MeeshyUser) {
        val destinations = pending.associateWith { destinationOf(it, user) }
        val admissions = admissionsOf(destinations.values.filterIsInstance<Destination.Ready>().map { it.conversationId })
        pending.forEach { recipient ->
            val outcome = deliver(destinations.getValue(recipient), admissions, subject, posts, caption, user)
            inFlight -= recipient.id
            when (outcome) {
                is Outcome.Served -> _state.update { it.copy(sheet = it.sheet.served(recipient, outcome.conversationId, outcome.queued)) }
                is Outcome.Refused -> mark(recipient, ShareDelivery.Failed(outcome.failure))
            }
        }
        workManager.enqueue(OutboxFlushWorker.buildRequest())
    }

    private sealed interface Outcome {
        data class Served(val conversationId: String, val queued: Boolean) : Outcome
        data class Refused(val failure: ShareFailure) : Outcome
    }

    private suspend fun destinationOf(recipient: ShareRecipient, user: MeeshyUser): Destination = try {
        destination(recipient, user)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (e: Exception) {
        Destination.Refused(ShareFailure.GENERIC)
    }

    /** #13820 — the modes of every ready destination are read together, within the bound of a single gesture. */
    private suspend fun admissionsOf(conversationIds: List<String>): Map<String, OutOfThreadAdmission> = try {
        outOfThread.admitAll(conversationIds)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (e: Exception) {
        emptyMap()
    }

    private suspend fun deliver(
        target: Destination,
        admissions: Map<String, OutOfThreadAdmission>,
        subject: ShareSubject,
        posts: List<OutgoingShare>,
        caption: String,
        user: MeeshyUser,
    ): Outcome = try {
        when (target) {
            is Destination.Refused -> Outcome.Refused(target.failure)
            is Destination.Ready -> when (val admission = admissions[target.conversationId]) {
                null -> Outcome.Refused(ShareFailure.GENERIC)
                OutOfThreadAdmission.END_TO_END -> Outcome.Refused(ShareFailure.SEALED_DESTINATION)
                OutOfThreadAdmission.UNREACHABLE -> Outcome.Refused(ShareFailure.UNREACHABLE)
                OutOfThreadAdmission.SEND, OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN -> {
                    post(target.conversationId, subject, posts, caption, user)
                    val waits = admission == OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN
                    Outcome.Served(target.conversationId, queued = _state.value.isOffline || waits)
                }
            }
        }
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (e: Exception) {
        Outcome.Refused(ShareFailure.GENERIC)
    }

    private sealed interface Destination {
        data class Ready(val conversationId: String) : Destination
        data class Refused(val failure: ShareFailure) : Destination
    }

    /** La conversation où le message part — la directe d'une personne est retrouvée ou créée, et relue avant tout envoi. */
    private suspend fun destination(recipient: ShareRecipient, user: MeeshyUser): Destination {
        if (isBlocked(recipient.userId)) return Destination.Refused(ShareFailure.GENERIC)
        recipient.conversationId?.let { id ->
            val known = conversations.firstOrNull { it.id == id }
            return when {
                known == null -> Destination.Refused(ShareFailure.GENERIC)
                else -> gate(known, user)
            }
        }
        val userId = recipient.userId ?: return Destination.Refused(ShareFailure.GENERIC)
        return when (val resolution = conversationRepository.directConversationWith(userId)) {
            is DirectConversationResolution.Found -> gate(resolution.conversation, user)
            is DirectConversationResolution.Created -> gate(resolution.conversation, user)
            is DirectConversationResolution.Queued -> Destination.Refused(ShareFailure.UNREACHABLE)
            is DirectConversationResolution.Failed ->
                Destination.Refused(if (resolution.offline) ShareFailure.UNREACHABLE else ShareFailure.GENERIC)
        }
    }

    /** La conversation RENDUE est relue avant tout envoi : chiffrée ou fermée ⇒ refus, interlocuteur bloqué ⇒ refus. */
    private fun gate(conversation: ApiConversation, user: MeeshyUser): Destination = when {
        !conversation.mayCurrentUserWrite(user.id) -> Destination.Refused(ShareFailure.SEALED_DESTINATION)
        isBlocked(conversation.interlocutor(user.id)?.userId) -> Destination.Refused(ShareFailure.GENERIC)
        else -> Destination.Ready(conversation.id)
    }

    private fun isBlocked(userId: String?): Boolean = userId != null && blockCache.isBlocked(userId)

    private suspend fun post(conversationId: String, subject: ShareSubject, posts: List<OutgoingShare>, caption: String, user: MeeshyUser) {
        val language = user.systemLanguage?.takeIf { it.isNotBlank() } ?: LanguageResolver.FALLBACK_LANGUAGE
        val incoming = subject as? ShareSubject.Incoming
        if (incoming != null && incomingItems.isNotEmpty()) {
            postFiles(conversationId, incoming.composedText(caption).orEmpty(), language, user)
            return
        }
        posts.forEach { post ->
            messageRepository.sendOptimistic(
                conversationId = conversationId,
                content = post.content,
                originalLanguage = post.originalLanguage ?: language,
                sender = user,
                forwardedFromId = post.forwardedFromId,
                forwardedFromConversationId = post.forwardedFromConversationId,
                forwardedAttachmentIds = post.forwardedAttachmentIds,
                effects = MessageEffects(flags = post.effectFlags, ephemeralDuration = post.ephemeralDuration),
            )
        }
    }

    /** Un message par fichier reçu, dans l'ordre ; le texte joint part avec le premier. */
    private suspend fun postFiles(conversationId: String, text: String, language: String, user: MeeshyUser) {
        incomingItems.forEachIndexed { index, item ->
            val uploadCmid = mediaUploadQueue.enqueue(item, conversationId = conversationId)
            messageRepository.sendOptimistic(
                conversationId = conversationId,
                content = if (index == 0) text else "",
                originalLanguage = language,
                sender = user,
                messageType = AttachmentMessageType.forMime(item.mimeType),
                attachmentUploadCmids = listOf(uploadCmid),
                attachments = listOf(
                    ApiMessageAttachment(
                        id = uploadCmid,
                        fileName = item.fileName,
                        originalName = item.fileName,
                        mimeType = item.mimeType,
                        fileSize = item.sizeBytes.toInt(),
                    ),
                ),
            )
        }
    }

    /** La copie en clair du média reçu ne survit pas à la feuille. */
    override fun onCleared() {
        cleared = true
        if (activeSends == 0) release(incomingItems)
    }

    /** Une copie qu'un envoi en cours lit encore attend la fin de cet envoi. */
    private fun release(items: List<MediaUploadItem>) {
        if (activeSends > 0) releaseWhenIdle += items else items.forEach(MediaIntake::release)
    }

    // --- Dérivation -------------------------------------------------------------------------------------

    private fun update(transform: (AppShareState) -> AppShareState) {
        _state.update(transform)
        recompute()
    }

    private fun mark(recipient: ShareRecipient, delivery: ShareDelivery) {
        _state.update { it.copy(sheet = it.sheet.withDelivery(recipient.id, delivery)) }
    }

    private fun planOf(state: AppShareState): SharePlan? =
        state.subject?.let { SharePlanner.plan(it.entry(state.sheet.removedMessageIds), state.sheet.selection.map { r -> r.destination }) }

    private fun recompute() {
        val user = sessionRepository.currentUser.value
        val blocked = blockCache.currentBlockedIds
        _state.update { state ->
            val selection = state.sheet.selection.filterNot { it.userId in blocked && it.id !in inFlight }
            state.copy(
                sheet = if (selection.size == state.sheet.selection.size) state.sheet else state.sheet.copy(selection = selection),
                conversations = ShareRecipientDirectory.fromConversations(
                    conversations, state.subject?.sourceConversationId, user?.id, blocked,
                ),
                people = ShareRecipientDirectory.fromFriends(friends, user?.id, blocked),
            )
        }
    }

    private fun linesOf(subject: ShareSubject): List<String> = when (subject) {
        is ShareSubject.Text -> listOf(subject.text)
        is ShareSubject.Link -> listOf(subject.url)
        is ShareSubject.Card -> listOfNotNull((subject.card.messageText ?: subject.card.title).takeIf { it.isNotBlank() })
        is ShareSubject.Incoming -> listOfNotNull(subject.text)
        is ShareSubject.Messages, is ShareSubject.Piece -> emptyList()
    }

    private fun linkOf(subject: ShareSubject?): String? = when (subject) {
        is ShareSubject.Card -> subject.card.url
        is ShareSubject.Link -> subject.url
        is ShareSubject.Incoming -> subject.text?.trim()?.takeIf { subject.isLink }
        else -> null
    }

    /** Ce que la feuille dessine. */
    fun model(state: AppShareState): ShareSheetModel {
        val plan = planOf(state)
        return ShareSheetModel(
            plan = plan,
            contentLines = state.contentLines,
            notices = state.notices,
            caption = state.sheet.caption,
            chosenDurationSeconds = state.sheet.chosenDurationSeconds ?: plan?.flameMaxDurationSeconds,
            query = state.sheet.query,
            sections = ShareRecipientListing.of(state.conversations, state.people, state.sheet.query),
            selectedIds = state.sheet.selection.map { it.id }.toSet(),
            deliveries = state.sheet.deliveries,
            firstServed = state.sheet.firstServed,
            isOffline = state.isOffline,
            isLoading = state.isLoading,
            isSessionLoading = state.isSessionLoading,
            isSignedOut = state.isSignedOut,
            copyableLink = plan?.takeIf { it.offers(ShareAction.COPY_LINK) }?.let { linkOf(state.subject) },
            shareOutText = plan?.takeIf { it.offers(ShareAction.SHARE_OUT) }?.let { state.subject?.composedText("") },
            recipientLimitExceeded = (plan?.limits?.overRecipients ?: 0) > 0,
        )
    }
}
