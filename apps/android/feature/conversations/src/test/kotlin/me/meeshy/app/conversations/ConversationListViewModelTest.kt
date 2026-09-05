package me.meeshy.app.conversations

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import kotlinx.coroutines.CompletableDeferred
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.chat.ConversationDraftStore
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.chat.InMemoryStarredMessagesStore
import me.meeshy.sdk.chat.StarredMessagesStore
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lock.ConversationLockStore
import me.meeshy.sdk.lock.InMemoryConversationLockStore
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ConversationClosedSocketEvent
import me.meeshy.sdk.model.ConversationDeletedSocketEvent
import me.meeshy.sdk.model.ConversationRestoredSocketEvent
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.ConversationFilter
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import me.meeshy.sdk.model.UnreadUpdateEvent
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ParticipantLeftEvent
import me.meeshy.sdk.model.PresenceSnapshotEvent
import me.meeshy.sdk.model.StarredMessage
import me.meeshy.sdk.model.StarredMessages
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.model.TypingEvent
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.socket.TypingPresenceRelay
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.status.StatusFeedMode
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationListViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun repositoryReturning(
        stream: Flow<CacheResult<List<ApiConversation>>>,
    ): ConversationRepository = mockk<ConversationRepository>(relaxed = true).also {
        every { it.conversationsStream(any(), any()) } returns stream
    }

    private fun socketManager(
        conversationDeleted: MutableSharedFlow<ConversationDeletedSocketEvent> = MutableSharedFlow(),
        conversationRestored: MutableSharedFlow<ConversationRestoredSocketEvent> = MutableSharedFlow(),
        conversationClosed: MutableSharedFlow<ConversationClosedSocketEvent> = MutableSharedFlow(),
        participantLeft: MutableSharedFlow<ParticipantLeftEvent> = MutableSharedFlow(),
        userStatus: MutableSharedFlow<UserStatusEvent> = MutableSharedFlow(),
        presenceSnapshot: MutableSharedFlow<PresenceSnapshotEvent> = MutableSharedFlow(),
        unreadUpdated: MutableSharedFlow<UnreadUpdateEvent> = MutableSharedFlow(),
        messageReceived: MutableSharedFlow<ApiMessage> = MutableSharedFlow(),
        conversationUpdated: MutableSharedFlow<ConversationUpdatedSocketEvent> = MutableSharedFlow(),
        typingStarted: MutableSharedFlow<TypingEvent> = MutableSharedFlow(),
        typingStopped: MutableSharedFlow<TypingEvent> = MutableSharedFlow(),
    ): MessageSocketManager =
        mockk<MessageSocketManager> {
            every { this@mockk.unreadUpdated } returns unreadUpdated
            every { this@mockk.messageReceived } returns messageReceived
            every { this@mockk.conversationUpdated } returns conversationUpdated
            every { this@mockk.conversationDeleted } returns conversationDeleted
            every { this@mockk.conversationRestored } returns conversationRestored
            every { this@mockk.conversationClosed } returns conversationClosed
            every { this@mockk.participantLeft } returns participantLeft
            every { this@mockk.userStatus } returns userStatus
            every { this@mockk.presenceSnapshot } returns presenceSnapshot
            every { this@mockk.typingStarted } returns typingStarted
            every { this@mockk.typingStopped } returns typingStopped
        }

    private fun typingPresenceRelay(
        forcedOnline: MutableSharedFlow<UserStatusEvent> = MutableSharedFlow(),
    ): TypingPresenceRelay =
        mockk<TypingPresenceRelay> {
            every { this@mockk.forcedOnline } returns forcedOnline
        }

    private fun connectionSocket(
        state: MutableStateFlow<SocketConnectionState> =
            MutableStateFlow(SocketConnectionState.DISCONNECTED),
    ): SocketManager = mockk<SocketManager> {
        every { connectionState } returns state
    }

    private fun session(userId: String? = null): SessionRepository = mockk<SessionRepository> {
        every { currentUser } returns
            MutableStateFlow(userId?.let { MeeshyUser(id = it, username = it) })
    }

    private val workManager: WorkManager = mockk(relaxed = true)

    private fun messageRepository(recent: List<LocalMessage> = emptyList()): MessageRepository =
        mockk<MessageRepository> {
            coEvery { recentMessages(any(), any()) } returns recent
        }

    private fun categoryRepo(
        categories: List<me.meeshy.sdk.model.CategoryOption> = emptyList(),
    ): CategoryRepository = mockk<CategoryRepository> {
        every { categoriesStream(any(), any()) } returns flowOf(categories)
    }

    private fun categorySocket(
        events: MutableSharedFlow<me.meeshy.sdk.model.CategoryEvent> = MutableSharedFlow(),
    ): me.meeshy.sdk.socket.CategorySocketManager = mockk<me.meeshy.sdk.socket.CategorySocketManager> {
        every { categoryEvents } returns events
    }

    private fun preferencesSocket(
        events: MutableSharedFlow<me.meeshy.sdk.model.UserPreferencesConversationUpdatedSocketData> =
            MutableSharedFlow(),
    ): me.meeshy.sdk.socket.PreferencesSocketManager =
        mockk<me.meeshy.sdk.socket.PreferencesSocketManager> {
            every { conversationPreferencesUpdated } returns events
        }

    private fun storyRepo(): me.meeshy.sdk.story.StoryRepository =
        mockk<me.meeshy.sdk.story.StoryRepository>(relaxed = true) {
            every { storiesStream(any(), any()) } returns kotlinx.coroutines.flow.emptyFlow()
        }

    private class FixedClock(private val now: Long = 0L) : CacheClock {
        override fun nowMillis(): Long = now
    }

    private fun statusBarCache(vararg entries: Pair<StatusFeedMode, List<StatusEntry>>): StatusBarCache =
        StatusBarCache(FixedClock()).apply {
            entries.forEach { (mode, statuses) -> save(mode, statuses) }
        }

    private fun status(userId: String, moodEmoji: String) =
        StatusEntry(id = "status-$userId", userId = userId, moodEmoji = moodEmoji)

    private fun viewModel(
        repo: ConversationRepository,
        connection: SocketManager = connectionSocket(),
        draftStore: ConversationDraftStore = InMemoryConversationDraftStore(),
        socket: MessageSocketManager = socketManager(),
        relay: TypingPresenceRelay = typingPresenceRelay(),
        starredStore: StarredMessagesStore = InMemoryStarredMessagesStore(),
        categoryRepository: CategoryRepository = categoryRepo(),
        categorySocketManager: me.meeshy.sdk.socket.CategorySocketManager = categorySocket(),
        preferencesSocketManager: me.meeshy.sdk.socket.PreferencesSocketManager = preferencesSocket(),
        session: SessionRepository = session(),
        messageRepo: MessageRepository = messageRepository(),
        lockStore: ConversationLockStore = InMemoryConversationLockStore(),
        storyRepository: me.meeshy.sdk.story.StoryRepository = storyRepo(),
        statusBarCache: StatusBarCache = statusBarCache(),
    ) = ConversationListViewModel(
        repo, messageRepo, socket, relay, workManager, draftStore, starredStore,
        categoryRepository, categorySocketManager, preferencesSocketManager, connection, session, lockStore,
        storyRepository, statusBarCache,
    )

    private fun direct(id: String, otherId: String = "other") = ApiConversation(
        id = id,
        type = "direct",
        participants = listOf(
            ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
            ApiParticipant(id = "p-other", userId = otherId, displayName = "Contact"),
        ),
    )

    /**
     * Un message entrant vaut TROIS trames serveur — `message:new`,
     * `conversation:updated` et `conversation:unread-updated`, toutes emises par
     * le meme `MessageHandler.broadcastNewMessage` pour le meme message. Repondre
     * a chacune par un `repository.refresh()` (une requete de liste COMPLETE plus
     * une transaction Room `upsertAll` + `deleteNotIn`) triplait le cout reseau,
     * batterie et base de chaque message recu.
     */
    @Test
    fun the_three_socket_frames_of_one_incoming_message_collapse_into_a_single_trailing_refresh() =
        runTest(dispatcher) {
            val messageReceived = MutableSharedFlow<ApiMessage>()
            val conversationUpdated = MutableSharedFlow<ConversationUpdatedSocketEvent>()
            val unreadUpdated = MutableSharedFlow<UnreadUpdateEvent>()
            val firstRefreshHeld = CompletableDeferred<Unit>()
            var refreshCount = 0
            val repo = repositoryReturning(flowOf(CacheResult.Empty))
            coEvery { repo.refresh() } coAnswers {
                refreshCount++
                if (refreshCount == 1) firstRefreshHeld.await()
            }
            viewModel(
                repo,
                socket = socketManager(
                    messageReceived = messageReceived,
                    conversationUpdated = conversationUpdated,
                    unreadUpdated = unreadUpdated,
                ),
            )
            advanceUntilIdle()

            messageReceived.emit(ApiMessage(id = "m1", conversationId = "c1"))
            advanceUntilIdle()
            assertThat(refreshCount).isEqualTo(1)

            conversationUpdated.emit(ConversationUpdatedSocketEvent(conversationId = "c1"))
            unreadUpdated.emit(UnreadUpdateEvent(conversationId = "c1", unreadCount = 1))
            advanceUntilIdle()

            // Les deux trames jumelles arrivent pendant la relecture en vol : elles
            // se fondent en UNE seule demande en attente, elles n'en empilent pas deux.
            assertThat(refreshCount).isEqualTo(1)

            firstRefreshHeld.complete(Unit)
            advanceUntilIdle()

            // Une relecture de queue — jamais zero (rien n'est perdu), jamais trois.
            assertThat(refreshCount).isEqualTo(2)
        }

    /**
     * #4389 — la MONTANTE du couple `delete-for-me` / `restore-for-me`.
     *
     * `conversation:restored` part sur la room PERSONNELLE du restaurateur :
     * l'appareil qui a appelé la route lit sa propre réponse REST, les AUTRES
     * n'apprennent la restauration que par cet événement. Sans cette collecte,
     * la conversation restait absente de leur liste jusqu'au prochain
     * chargement complet — le symptôme que #4344 nommait, survivant à sa
     * moitié serveur.
     *
     * Le témoin assert sur l'EFFET (une relecture est demandée), pas sur
     * l'abonnement : c'est la seule forme qui tombe si l'on retire le
     * `collect` du ViewModel.
     */
    @Test
    fun a_restored_conversation_refreshes_the_list_on_this_device() =
        runTest(dispatcher) {
            val conversationRestored = MutableSharedFlow<ConversationRestoredSocketEvent>()
            var refreshCount = 0
            val repo = repositoryReturning(flowOf(CacheResult.Empty))
            coEvery { repo.refresh() } coAnswers { refreshCount++; Unit }
            viewModel(repo, socket = socketManager(conversationRestored = conversationRestored))
            advanceUntilIdle()
            val avant = refreshCount

            conversationRestored.emit(
                ConversationRestoredSocketEvent(conversationId = "c1", userId = "u1"),
            )
            advanceUntilIdle()

            assertThat(refreshCount).isGreaterThan(avant)
        }

    /**
     * La contrepartie de la fusion : elle ne doit RIEN retarder. Une trame isolee
     * declenche sa relecture immediatement — pas de `debounce`, pas de fenetre
     * d'attente (Instant App, cache-first/network-second).
     */
    @Test
    fun an_isolated_socket_frame_still_refreshes_the_list_without_any_delay() =
        runTest(dispatcher) {
            val messageReceived = MutableSharedFlow<ApiMessage>()
            val repo = repositoryReturning(flowOf(CacheResult.Empty))
            viewModel(repo, socket = socketManager(messageReceived = messageReceived))
            advanceUntilIdle()

            messageReceived.emit(ApiMessage(id = "m1", conversationId = "c1"))
            advanceUntilIdle()

            coVerify(exactly = 1) { repo.refresh() }
        }

    /**
     * Une relecture qui echoue (session en teardown, reseau coupe) ne doit pas
     * emporter la pompe avec elle : la trame SUIVANTE doit encore etre servie.
     * Avant la fusion, chaque collecteur portait son propre `try/catch` ; la
     * pompe unique en fait un point de defaillance unique s'il manque.
     */
    @Test
    fun a_failed_refresh_does_not_stop_the_next_socket_frame_from_refreshing() =
        runTest(dispatcher) {
            val messageReceived = MutableSharedFlow<ApiMessage>()
            val repo = repositoryReturning(flowOf(CacheResult.Empty))
            var refreshCount = 0
            coEvery { repo.refresh() } coAnswers {
                refreshCount++
                if (refreshCount == 1) throw IllegalStateException("session teardown")
            }
            viewModel(repo, socket = socketManager(messageReceived = messageReceived))
            advanceUntilIdle()

            messageReceived.emit(ApiMessage(id = "m1", conversationId = "c1"))
            advanceUntilIdle()
            messageReceived.emit(ApiMessage(id = "m2", conversationId = "c1"))
            advanceUntilIdle()

            assertThat(refreshCount).isEqualTo(2)
        }

    @Test
    fun a_live_user_status_event_is_stored_in_presence_by_user_id() = runTest(dispatcher) {
        val userStatusFlow = MutableSharedFlow<UserStatusEvent>()
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        val vm = viewModel(repo, socket = socketManager(userStatus = userStatusFlow))
        advanceUntilIdle()

        userStatusFlow.emit(UserStatusEvent(userId = "other", isOnline = true, lastActiveAt = null))
        advanceUntilIdle()

        assertThat(vm.state.value.presenceByUserId["other"]?.isOnline).isTrue()
    }

    @Test
    fun a_forced_online_event_from_a_typing_frame_is_stored_in_presence_by_user_id() = runTest(dispatcher) {
        val forcedOnlineFlow = MutableSharedFlow<UserStatusEvent>()
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        val vm = viewModel(repo, relay = typingPresenceRelay(forcedOnline = forcedOnlineFlow))
        advanceUntilIdle()

        forcedOnlineFlow.emit(UserStatusEvent(userId = "other", isOnline = true, lastActiveAt = null))
        advanceUntilIdle()

        assertThat(vm.state.value.presenceByUserId["other"]?.isOnline).isTrue()
    }

    @Test
    fun a_presence_snapshot_populates_every_user_in_one_pass() = runTest(dispatcher) {
        val presenceSnapshotFlow = MutableSharedFlow<PresenceSnapshotEvent>()
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        val vm = viewModel(repo, socket = socketManager(presenceSnapshot = presenceSnapshotFlow))
        advanceUntilIdle()

        presenceSnapshotFlow.emit(
            PresenceSnapshotEvent(
                users = listOf(
                    UserStatusEvent(userId = "u1", isOnline = true),
                    UserStatusEvent(userId = "u2", isOnline = false),
                ),
            ),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.presenceByUserId.keys).containsExactly("u1", "u2")
    }

    @Test
    fun a_lock_store_emission_is_reflected_in_locked_conversation_ids() = runTest(dispatcher) {
        val lockStore = InMemoryConversationLockStore()
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        val vm = viewModel(repo, lockStore = lockStore)
        advanceUntilIdle()

        lockStore.setLock("c1", "1111")
        advanceUntilIdle()

        assertThat(vm.state.value.lockedConversationIds).containsExactly("c1")
    }

    @Test
    fun removeLock_on_the_store_is_reflected_in_locked_conversation_ids() = runTest(dispatcher) {
        val lockStore = InMemoryConversationLockStore().apply { setLock("c1", "1111") }
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        val vm = viewModel(repo, lockStore = lockStore)
        advanceUntilIdle()

        lockStore.removeLock("c1")
        advanceUntilIdle()

        assertThat(vm.state.value.lockedConversationIds).isEmpty()
    }

    @Test
    fun presenceStateFor_resolves_the_other_participants_live_presence() = runTest(dispatcher) {
        val userStatusFlow = MutableSharedFlow<UserStatusEvent>()
        val conversation = direct(id = "c1", otherId = "other")
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(conversation), ageMillis = 0)),
        )
        val vm = viewModel(repo, socket = socketManager(userStatus = userStatusFlow), session = session("me"))
        advanceUntilIdle()

        userStatusFlow.emit(UserStatusEvent(userId = "other", isOnline = true, lastActiveAt = null))
        advanceUntilIdle()

        assertThat(vm.state.value.presenceStateFor(conversation, nowEpochMillis = 0L))
            .isEqualTo(me.meeshy.sdk.model.PresenceState.ONLINE)
    }

    @Test
    fun presenceStateFor_is_null_for_a_group_conversation() = runTest(dispatcher) {
        val group = ApiConversation(
            id = "c2",
            type = "group",
            title = "Team",
            participants = listOf(
                ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
                ApiParticipant(id = "p-other", userId = "other", displayName = "Contact"),
            ),
        )
        val userStatusFlow = MutableSharedFlow<UserStatusEvent>()
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(group), ageMillis = 0)))
        val vm = viewModel(repo, socket = socketManager(userStatus = userStatusFlow), session = session("me"))
        advanceUntilIdle()

        userStatusFlow.emit(UserStatusEvent(userId = "other", isOnline = true))
        advanceUntilIdle()

        assertThat(vm.state.value.presenceStateFor(group, nowEpochMillis = 0L)).isNull()
    }

    @Test
    fun presenceStateFor_is_null_when_nothing_has_arrived_for_the_other_participant_yet() = runTest(dispatcher) {
        val conversation = direct(id = "c3", otherId = "other")
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(conversation), ageMillis = 0)))
        val vm = viewModel(repo, session = session("me"))
        advanceUntilIdle()

        assertThat(vm.state.value.presenceStateFor(conversation, nowEpochMillis = 0L)).isNull()
    }

    @Test
    fun fresh_result_populates_conversations_without_skeleton() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1", title = "Team")), ageMillis = 0)),
        )
        val vm = viewModel(repo)
        advanceUntilIdle()

        assertThat(vm.state.value.conversations).hasSize(1)
        assertThat(vm.state.value.showSkeleton).isFalse()
        assertThat(vm.state.value.isSyncing).isFalse()
    }

    @Test
    fun category_catalogue_stream_hydrates_the_state_categories() = runTest(dispatcher) {
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        val vm = viewModel(
            repo,
            categoryRepository = categoryRepo(
                listOf(
                    me.meeshy.sdk.model.CategoryOption(id = "work", name = "Work", order = 0),
                    me.meeshy.sdk.model.CategoryOption(id = "fam", name = "Family", order = 1),
                ),
            ),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.categories.map { it.id }).containsExactly("work", "fam").inOrder()
    }

    @Test
    fun categories_default_to_empty_when_the_catalogue_is_cold() = runTest(dispatcher) {
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        val vm = viewModel(repo)
        advanceUntilIdle()

        assertThat(vm.state.value.categories).isEmpty()
    }

    /**
     * Le geste fait sur un AUTRE appareil arrive jusqu'au CACHE (#4127). La ligne
     * `UserConversationPreferences` etant par UTILISATEUR, epingler depuis le web
     * n'atteignait Android par aucun chemin : ni `conversation:updated` (l'ecrivain
     * de preferences ne l'emet pas), ni une relecture, que rien ne declenchait.
     *
     * Le temoin s'arrete a l'ecrivain de cache et non a l'etat rendu, parce que
     * c'est la que la valeur passe : `ConversationRepository.applyRemoteConversation
     * Preferences` ecrit la ligne Room, dont `conversationsStream` est l'observateur.
     * L'arbitrage de version vit dans le port pur, couvert cote `:sdk-core`.
     */
    @Test
    fun a_preferences_socket_event_reaches_the_conversation_cache() = runTest(dispatcher) {
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        val events =
            MutableSharedFlow<me.meeshy.sdk.model.UserPreferencesConversationUpdatedSocketData>()
        viewModel(repo, preferencesSocketManager = preferencesSocket(events))
        advanceUntilIdle()

        val event = me.meeshy.sdk.model.UserPreferencesConversationUpdatedSocketData(
            userId = "u1",
            conversationId = "c1",
            version = 3,
            reset = false,
            preferences = me.meeshy.sdk.model.ConversationPreferencesWirePayload(isPinned = true),
        )
        events.emit(event)
        advanceUntilIdle()

        coVerify(exactly = 1) { repo.applyRemoteConversationPreferences(event) }
    }

    /**
     * Et il n'y repond PAS par une relecture de liste : la charge PORTE l'instantane
     * complet et versionne, donc redemander la liste couterait une requete pour une
     * information qu'on tient deja — exactement le triplement que la pompe de
     * [refreshRequests] existe pour eviter.
     */
    @Test
    fun a_preferences_socket_event_triggers_no_list_refresh() = runTest(dispatcher) {
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        val events =
            MutableSharedFlow<me.meeshy.sdk.model.UserPreferencesConversationUpdatedSocketData>()
        viewModel(repo, preferencesSocketManager = preferencesSocket(events))
        advanceUntilIdle()

        events.emit(
            me.meeshy.sdk.model.UserPreferencesConversationUpdatedSocketData(
                userId = "u1",
                conversationId = "c1",
                version = 3,
                preferences = me.meeshy.sdk.model.ConversationPreferencesWirePayload(isPinned = true),
            ),
        )
        advanceUntilIdle()

        coVerify(exactly = 0) { repo.refresh() }
    }

    @Test
    fun a_category_upsert_socket_event_adds_the_category_to_the_catalogue() = runTest(dispatcher) {
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        val events = MutableSharedFlow<me.meeshy.sdk.model.CategoryEvent>()
        val vm = viewModel(
            repo,
            categoryRepository = categoryRepo(
                listOf(me.meeshy.sdk.model.CategoryOption(id = "work", name = "Work", order = 0)),
            ),
            categorySocketManager = categorySocket(events),
        )
        advanceUntilIdle()

        events.emit(
            me.meeshy.sdk.model.CategoryEvent.Upserted(
                me.meeshy.sdk.model.CategoryOption(id = "fam", name = "Family", order = 1),
            ),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.categories.map { it.id }).containsExactly("work", "fam").inOrder()
    }

    @Test
    fun a_category_delete_socket_event_removes_the_category_from_the_catalogue() = runTest(dispatcher) {
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        val events = MutableSharedFlow<me.meeshy.sdk.model.CategoryEvent>()
        val vm = viewModel(
            repo,
            categoryRepository = categoryRepo(
                listOf(
                    me.meeshy.sdk.model.CategoryOption(id = "work", name = "Work", order = 0),
                    me.meeshy.sdk.model.CategoryOption(id = "fam", name = "Family", order = 1),
                ),
            ),
            categorySocketManager = categorySocket(events),
        )
        advanceUntilIdle()

        events.emit(me.meeshy.sdk.model.CategoryEvent.Deleted("fam"))
        advanceUntilIdle()

        assertThat(vm.state.value.categories.map { it.id }).containsExactly("work")
    }

    @Test
    fun a_category_reorder_socket_event_re_ranks_the_catalogue() = runTest(dispatcher) {
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        val events = MutableSharedFlow<me.meeshy.sdk.model.CategoryEvent>()
        val vm = viewModel(
            repo,
            categoryRepository = categoryRepo(
                listOf(
                    me.meeshy.sdk.model.CategoryOption(id = "work", name = "Work", order = 0),
                    me.meeshy.sdk.model.CategoryOption(id = "fam", name = "Family", order = 1),
                ),
            ),
            categorySocketManager = categorySocket(events),
        )
        advanceUntilIdle()

        events.emit(me.meeshy.sdk.model.CategoryEvent.Reordered(mapOf("work" to 5)))
        advanceUntilIdle()

        assertThat(vm.state.value.categories.map { it.id }).containsExactly("fam", "work").inOrder()
    }

    @Test
    fun a_category_upsert_socket_event_seeds_a_cold_catalogue() = runTest(dispatcher) {
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        val events = MutableSharedFlow<me.meeshy.sdk.model.CategoryEvent>()
        val vm = viewModel(repo, categorySocketManager = categorySocket(events))
        advanceUntilIdle()

        events.emit(
            me.meeshy.sdk.model.CategoryEvent.Upserted(
                me.meeshy.sdk.model.CategoryOption(id = "new", name = "New", order = 0),
            ),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.categories.map { it.id }).containsExactly("new")
    }

    @Test
    fun a_conversation_with_a_stored_draft_floats_to_the_top() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(
                CacheResult.Fresh(
                    listOf(ApiConversation(id = "c1"), ApiConversation(id = "c2"), ApiConversation(id = "c3")),
                    ageMillis = 0,
                ),
            ),
        )
        val draftStore = InMemoryConversationDraftStore(
            mapOf("c3" to ConversationDraft(conversationId = "c3", text = "unsent")),
        )
        val vm = viewModel(repo, draftStore = draftStore)
        advanceUntilIdle()

        assertThat(vm.state.value.conversations.map { it.id }).containsExactly("c3", "c1", "c2").inOrder()
        assertThat(vm.state.value.draftFor("c3")?.text).isEqualTo("unsent")
    }

    @Test
    fun discarding_a_draft_clears_the_preview_and_sinks_the_row() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(
                CacheResult.Fresh(
                    listOf(ApiConversation(id = "c1"), ApiConversation(id = "c2"), ApiConversation(id = "c3")),
                    ageMillis = 0,
                ),
            ),
        )
        val draftStore = InMemoryConversationDraftStore(
            mapOf("c3" to ConversationDraft(conversationId = "c3", text = "unsent")),
        )
        val vm = viewModel(repo, draftStore = draftStore)
        advanceUntilIdle()

        vm.discardDraft("c3")
        advanceUntilIdle()

        assertThat(vm.state.value.draftFor("c3")).isNull()
        assertThat(vm.state.value.conversations.map { it.id }).containsExactly("c1", "c2", "c3").inOrder()
        assertThat(draftStore.load("c3")).isNull()
    }

    @Test
    fun discarding_a_draft_gives_instant_optimistic_feedback_before_the_store_settles() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)),
        )
        val draftStore = InMemoryConversationDraftStore(
            mapOf("c1" to ConversationDraft(conversationId = "c1", text = "unsent")),
        )
        val vm = viewModel(repo, draftStore = draftStore)
        advanceUntilIdle()

        // No advanceUntilIdle: the optimistic state update is synchronous.
        vm.discardDraft("c1")

        assertThat(vm.state.value.draftFor("c1")).isNull()
    }

    @Test
    fun discarding_when_no_meaningful_draft_exists_is_a_no_op() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)),
        )
        val blank = ConversationDraft(conversationId = "c1", text = "   ")
        val draftStore = InMemoryConversationDraftStore(mapOf("c1" to blank))
        val vm = viewModel(repo, draftStore = draftStore)
        advanceUntilIdle()

        vm.discardDraft("c1")
        advanceUntilIdle()

        // The inert draft is left untouched — the affordance is never offered for it.
        assertThat(draftStore.load("c1")).isEqualTo(blank)
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun discarding_an_unknown_conversation_changes_nothing() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)),
        )
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.discardDraft("does-not-exist")
        advanceUntilIdle()

        assertThat(vm.state.value.conversations.map { it.id }).containsExactly("c1")
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun empty_result_shows_the_skeleton() = runTest(dispatcher) {
        val vm = viewModel(repositoryReturning(flowOf(CacheResult.Empty)))
        advanceUntilIdle()

        assertThat(vm.state.value.showSkeleton).isTrue()
        assertThat(vm.state.value.conversations).isEmpty()
    }

    @Test
    fun stale_result_keeps_data_and_marks_syncing() = runTest(dispatcher) {
        val vm = viewModel(
            repositoryReturning(flowOf(CacheResult.Stale(listOf(ApiConversation(id = "c1")), ageMillis = 0))),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.conversations).hasSize(1)
        assertThat(vm.state.value.isSyncing).isTrue()
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun background_sync_error_clears_skeleton_and_surfaces_message() = runTest(dispatcher) {
        val repo = mockk<ConversationRepository>(relaxed = true)
        val onError = slot<(Throwable) -> Unit>()
        every { repo.conversationsStream(any(), capture(onError)) } returns flowOf(CacheResult.Empty)
        val vm = viewModel(repo)
        advanceUntilIdle()

        onError.captured.invoke(RuntimeException("Server down"))

        assertThat(vm.state.value.errorMessage).isEqualTo("Server down")
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun refresh_failure_surfaces_the_error_message() = runTest(dispatcher) {
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        coEvery { repo.refresh() } throws RuntimeException("Network unavailable")
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.refresh()
        advanceUntilIdle()

        assertThat(vm.state.value.errorMessage).isEqualTo("Network unavailable")
        assertThat(vm.state.value.isUserRefreshing).isFalse()
    }

    @Test
    fun pull_to_refresh_spinner_tracks_the_user_gesture_only() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(
                CacheResult.Stale(
                    listOf(ApiConversation(id = "c1", title = "Team")),
                    ageMillis = 0,
                ),
            ),
        )
        val vm = viewModel(repo)
        advanceUntilIdle()

        assertThat(vm.state.value.isSyncing).isTrue()
        assertThat(vm.state.value.isUserRefreshing).isFalse()

        vm.refresh()
        advanceUntilIdle()

        assertThat(vm.state.value.isUserRefreshing).isFalse()
    }

    @Test
    fun selecting_a_filter_narrows_the_visible_list() = runTest(dispatcher) {
        val convs = listOf(
            ApiConversation(id = "read", title = "Read", unreadCount = 0),
            ApiConversation(id = "unread", title = "Unread", unreadCount = 4),
        )
        val vm = viewModel(repositoryReturning(flowOf(CacheResult.Fresh(convs, ageMillis = 0))))
        advanceUntilIdle()
        assertThat(vm.state.value.conversations).hasSize(2)

        vm.selectFilter(ConversationFilter.UNREAD)
        advanceUntilIdle()

        assertThat(vm.state.value.conversations.map { it.id }).containsExactly("unread")
        assertThat(vm.state.value.selectedFilter).isEqualTo(ConversationFilter.UNREAD)
    }

    @Test
    fun search_filters_by_title_and_flags_filtered_empty() = runTest(dispatcher) {
        val convs = listOf(
            ApiConversation(id = "a", title = "Design Team"),
            ApiConversation(id = "b", title = "Operations"),
        )
        val vm = viewModel(repositoryReturning(flowOf(CacheResult.Fresh(convs, ageMillis = 0))))
        advanceUntilIdle()

        vm.setSearch("design")
        advanceUntilIdle()
        assertThat(vm.state.value.conversations.map { it.id }).containsExactly("a")

        vm.setSearch("zzz")
        advanceUntilIdle()
        assertThat(vm.state.value.conversations).isEmpty()
        assertThat(vm.state.value.isFilteredEmpty).isTrue()
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun closing_search_clears_the_query_and_restores_the_list() = runTest(dispatcher) {
        val convs = listOf(
            ApiConversation(id = "a", title = "Design Team"),
            ApiConversation(id = "b", title = "Operations"),
        )
        val vm = viewModel(repositoryReturning(flowOf(CacheResult.Fresh(convs, ageMillis = 0))))
        advanceUntilIdle()

        vm.setSearchActive(true)
        vm.setSearch("design")
        advanceUntilIdle()
        assertThat(vm.state.value.conversations).hasSize(1)

        vm.setSearchActive(false)
        advanceUntilIdle()

        assertThat(vm.state.value.searchText).isEmpty()
        assertThat(vm.state.value.isSearchActive).isFalse()
        assertThat(vm.state.value.conversations).hasSize(2)
    }

    @Test
    fun archived_conversations_are_hidden_from_all_filter_but_shown_under_archived() = runTest(dispatcher) {
        val convs = listOf(
            ApiConversation(id = "live", title = "Live"),
            ApiConversation(
                id = "old",
                title = "Old",
                preferences = ApiConversationPreferences(isArchived = true),
            ),
        )
        val vm = viewModel(repositoryReturning(flowOf(CacheResult.Fresh(convs, ageMillis = 0))))
        advanceUntilIdle()
        assertThat(vm.state.value.conversations.map { it.id }).containsExactly("live")

        vm.selectFilter(ConversationFilter.ARCHIVED)
        advanceUntilIdle()
        assertThat(vm.state.value.conversations.map { it.id }).containsExactly("old")
    }

    @Test
    fun the_banner_follows_the_socket_connection_state() = runTest(dispatcher) {
        val connection = MutableStateFlow(SocketConnectionState.CONNECTING)
        val repo = repositoryReturning(
            flowOf(
                CacheResult.Fresh(
                    listOf(ApiConversation(id = "c1", title = "Team")),
                    ageMillis = 0,
                ),
            ),
        )
        val vm = viewModel(repo, connectionSocket(connection))
        advanceUntilIdle()

        assertThat(vm.state.value.banner).isEqualTo(ConnectionBanner.RECONNECTING)

        connection.value = SocketConnectionState.CONNECTED
        advanceUntilIdle()

        assertThat(vm.state.value.banner).isEqualTo(ConnectionBanner.HIDDEN)
    }

    @Test
    fun toggle_pin_flips_the_cached_state_and_schedules_a_flush() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1", title = "Team")), ageMillis = 0)),
        )
        coEvery { repo.setPinnedOptimistic("c1", true) } returns true
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.togglePin("c1")
        advanceUntilIdle()

        coVerify { repo.setPinnedOptimistic("c1", true) }
        verify { workManager.enqueue(any<androidx.work.WorkRequest>()) }
    }

    @Test
    fun reassign_category_assigns_the_conversation_and_schedules_a_flush() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1", title = "Team")), ageMillis = 0)),
        )
        coEvery { repo.setCategoryOptimistic("c1", "work") } returns true
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.reassignCategory("c1", "work")
        advanceUntilIdle()

        coVerify { repo.setCategoryOptimistic("c1", "work") }
        verify { workManager.enqueue(any<androidx.work.WorkRequest>()) }
    }

    @Test
    fun reassign_category_is_a_noop_when_already_in_that_category() = runTest(dispatcher) {
        val categorized = ApiConversation(
            id = "c1",
            title = "Team",
            preferences = ApiConversationPreferences(categoryId = "work"),
        )
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(categorized), ageMillis = 0)))
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.reassignCategory("c1", "work")
        advanceUntilIdle()

        coVerify(exactly = 0) { repo.setCategoryOptimistic(any(), any()) }
    }

    @Test
    fun create_category_and_assign_creates_then_assigns_the_conversation() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1", title = "Team")), ageMillis = 0)),
        )
        coEvery { repo.setCategoryOptimistic("c1", "new-id") } returns true
        val categoryRepository = categoryRepo()
        val created = me.meeshy.sdk.model.CategoryOption(id = "new-id", name = "Errands", order = 3)
        coEvery { categoryRepository.create("Errands") } returns
            me.meeshy.sdk.net.NetworkResult.Success(created)
        val vm = viewModel(repo, categoryRepository = categoryRepository)
        advanceUntilIdle()

        vm.createCategoryAndAssign("c1", "Errands")
        advanceUntilIdle()

        coVerify { categoryRepository.create("Errands") }
        coVerify { repo.setCategoryOptimistic("c1", "new-id") }
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun create_category_and_assign_surfaces_the_error_and_never_assigns_on_failure() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1", title = "Team")), ageMillis = 0)),
        )
        val categoryRepository = categoryRepo()
        coEvery { categoryRepository.create("Errands") } returns
            me.meeshy.sdk.net.NetworkResult.Failure(me.meeshy.sdk.net.ApiError(message = "duplicate name"))
        val vm = viewModel(repo, categoryRepository = categoryRepository)
        advanceUntilIdle()

        vm.createCategoryAndAssign("c1", "Errands")
        advanceUntilIdle()

        coVerify { categoryRepository.create("Errands") }
        coVerify(exactly = 0) { repo.setCategoryOptimistic(any(), any()) }
        assertThat(vm.state.value.errorMessage).isEqualTo("duplicate name")
    }

    @Test
    fun create_category_and_assign_is_inert_on_a_blank_name() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1", title = "Team")), ageMillis = 0)),
        )
        val categoryRepository = categoryRepo()
        val vm = viewModel(repo, categoryRepository = categoryRepository)
        advanceUntilIdle()

        vm.createCategoryAndAssign("c1", "   ")
        advanceUntilIdle()

        coVerify(exactly = 0) { categoryRepository.create(any()) }
        coVerify(exactly = 0) { repo.setCategoryOptimistic(any(), any()) }
    }

    @Test
    fun toggle_pin_unpins_an_already_pinned_conversation() = runTest(dispatcher) {
        val pinned = ApiConversation(
            id = "c1",
            title = "Team",
            preferences = ApiConversationPreferences(isPinned = true),
        )
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(pinned), ageMillis = 0)))
        coEvery { repo.setPinnedOptimistic("c1", false) } returns true
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.togglePin("c1")
        advanceUntilIdle()

        coVerify { repo.setPinnedOptimistic("c1", false) }
    }

    @Test
    fun toggle_archive_toggles_and_mute_toggles_independently() = runTest(dispatcher) {
        val conv = ApiConversation(
            id = "c1",
            title = "Team",
            preferences = ApiConversationPreferences(isMuted = true),
        )
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(conv), ageMillis = 0)))
        coEvery { repo.setArchivedOptimistic("c1", true) } returns true
        coEvery { repo.setMutedOptimistic("c1", false) } returns true
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.toggleArchive("c1")
        vm.toggleMute("c1")
        advanceUntilIdle()

        coVerify { repo.setArchivedOptimistic("c1", true) }
        coVerify { repo.setMutedOptimistic("c1", false) }
    }

    @Test
    fun toggleMentionsOnly_flips_the_pref_and_calls_the_repository() = runTest(dispatcher) {
        val conv = ApiConversation(id = "c1", title = "Team")
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(conv), ageMillis = 0)))
        coEvery { repo.setMentionsOnlyOptimistic("c1", true) } returns true
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.toggleMentionsOnly("c1")
        advanceUntilIdle()

        coVerify { repo.setMentionsOnlyOptimistic("c1", true) }
    }

    @Test
    fun setCustomName_forwards_the_trimmed_name_to_the_repository() = runTest(dispatcher) {
        val conv = ApiConversation(id = "c1", title = "Team")
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(conv), ageMillis = 0)))
        coEvery { repo.setCustomNameOptimistic("c1", "Work squad") } returns true
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.setCustomName("c1", "Work squad")
        advanceUntilIdle()

        coVerify { repo.setCustomNameOptimistic("c1", "Work squad") }
    }

    @Test
    fun setReaction_forwards_the_emoji_to_the_repository() = runTest(dispatcher) {
        val conv = ApiConversation(id = "c1", title = "Team")
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(conv), ageMillis = 0)))
        coEvery { repo.setReactionOptimistic("c1", "⭐️") } returns true
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.setReaction("c1", "⭐️")
        advanceUntilIdle()

        coVerify { repo.setReactionOptimistic("c1", "⭐️") }
    }

    @Test
    fun setReaction_forwards_null_to_clear_the_favorite() = runTest(dispatcher) {
        val conv = ApiConversation(id = "c1", title = "Team")
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(conv), ageMillis = 0)))
        coEvery { repo.setReactionOptimistic("c1", null) } returns true
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.setReaction("c1", null)
        advanceUntilIdle()

        coVerify { repo.setReactionOptimistic("c1", null) }
    }

    @Test
    fun setTags_forwards_the_full_tag_set_to_the_repository() = runTest(dispatcher) {
        val conv = ApiConversation(id = "c1", title = "Team")
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(conv), ageMillis = 0)))
        coEvery { repo.setTagsOptimistic("c1", listOf("work", "family")) } returns true
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.setTags("c1", listOf("work", "family"))
        advanceUntilIdle()

        coVerify { repo.setTagsOptimistic("c1", listOf("work", "family")) }
    }

    @Test
    fun leaveConversation_calls_the_repository_and_clears_any_prior_error() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1", title = "Team")), ageMillis = 0)),
        )
        coEvery { repo.leave("c1") } returns me.meeshy.sdk.net.NetworkResult.Success(Unit)
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.leaveConversation("c1")
        advanceUntilIdle()

        coVerify { repo.leave("c1") }
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun leaveConversation_surfaces_the_error_on_failure() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1", title = "Team")), ageMillis = 0)),
        )
        coEvery { repo.leave("c1") } returns
            me.meeshy.sdk.net.NetworkResult.Failure(me.meeshy.sdk.net.ApiError(message = "Not a participant"))
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.leaveConversation("c1")
        advanceUntilIdle()

        assertThat(vm.state.value.errorMessage).isEqualTo("Not a participant")
    }

    @Test
    fun deleteConversationForMe_calls_the_repository_and_clears_any_prior_error() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1", title = "Team")), ageMillis = 0)),
        )
        coEvery { repo.deleteForMe("c1") } returns me.meeshy.sdk.net.NetworkResult.Success(Unit)
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.deleteConversationForMe("c1")
        advanceUntilIdle()

        coVerify { repo.deleteForMe("c1") }
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun deleteConversationForMe_surfaces_the_error_on_failure() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1", title = "Team")), ageMillis = 0)),
        )
        coEvery { repo.deleteForMe("c1") } returns
            me.meeshy.sdk.net.NetworkResult.Failure(me.meeshy.sdk.net.ApiError(message = "Not a participant"))
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.deleteConversationForMe("c1")
        advanceUntilIdle()

        assertThat(vm.state.value.errorMessage).isEqualTo("Not a participant")
    }

    @Test
    fun deleteConversationForAll_calls_the_repository_and_clears_any_prior_error() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1", title = "Team")), ageMillis = 0)),
        )
        coEvery { repo.deleteForAll("c1") } returns me.meeshy.sdk.net.NetworkResult.Success(Unit)
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.deleteConversationForAll("c1")
        advanceUntilIdle()

        coVerify { repo.deleteForAll("c1") }
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun deleteConversationForAll_surfaces_the_error_on_failure() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1", title = "Team")), ageMillis = 0)),
        )
        coEvery { repo.deleteForAll("c1") } returns
            me.meeshy.sdk.net.NetworkResult.Failure(me.meeshy.sdk.net.ApiError(message = "Only the creator can do this"))
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.deleteConversationForAll("c1")
        advanceUntilIdle()

        assertThat(vm.state.value.errorMessage).isEqualTo("Only the creator can do this")
    }

    @Test
    fun a_closed_conversation_sheds_its_stars_and_refreshes_the_list() = runTest(dispatcher) {
        val closed = MutableSharedFlow<ConversationClosedSocketEvent>()
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)))
        val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"), star("c2"))))
        val vm = viewModel(repo, socket = socketManager(conversationClosed = closed), starredStore = stars)
        advanceUntilIdle()

        closed.emit(ConversationClosedSocketEvent(conversationId = "c1", closedBy = "creator-1"))
        advanceUntilIdle()

        // c1's bookmark is gone; c2's survives.
        assertThat(stars.starred.value.items.map { it.conversationId }).containsExactly("c2")
        coVerify { repo.refresh() }
    }

    @Test
    fun a_blank_close_event_touches_neither_the_stars_nor_the_network() = runTest(dispatcher) {
        val closed = MutableSharedFlow<ConversationClosedSocketEvent>()
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)))
        val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"))))
        val vm = viewModel(repo, socket = socketManager(conversationClosed = closed), starredStore = stars)
        advanceUntilIdle()

        closed.emit(ConversationClosedSocketEvent(conversationId = "  ", closedBy = "creator-1"))
        advanceUntilIdle()

        assertThat(stars.starred.value.items.map { it.conversationId }).containsExactly("c1")
        coVerify(exactly = 0) { repo.refresh() }
    }

    @Test
    fun a_no_op_mutation_does_not_schedule_a_flush() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)),
        )
        coEvery { repo.markReadOptimistic("c1") } returns false
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.markRead("c1")
        advanceUntilIdle()

        verify(exactly = 0) { workManager.enqueue(any<androidx.work.WorkRequest>()) }
    }

    @Test
    fun mark_unread_calls_the_repository_and_schedules_a_flush() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)),
        )
        coEvery { repo.markUnreadOptimistic("c1") } returns true
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.markUnread("c1")
        advanceUntilIdle()

        coVerify { repo.markUnreadOptimistic("c1") }
        verify { workManager.enqueue(any<androidx.work.WorkRequest>()) }
    }

    @Test
    fun mark_unread_no_op_does_not_schedule_a_flush() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)),
        )
        coEvery { repo.markUnreadOptimistic("c1") } returns false
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.markUnread("c1")
        advanceUntilIdle()

        verify(exactly = 0) { workManager.enqueue(any<androidx.work.WorkRequest>()) }
    }

    private fun star(conversationId: String, messageId: String = "m-$conversationId") =
        StarredMessage(messageId = messageId, conversationId = conversationId)

    @Test
    fun a_deleted_conversation_sheds_its_stars_and_refreshes_the_list() = runTest(dispatcher) {
        val deleted = MutableSharedFlow<ConversationDeletedSocketEvent>()
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)))
        val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"), star("c2"))))
        val vm = viewModel(repo, socket = socketManager(conversationDeleted = deleted), starredStore = stars)
        advanceUntilIdle()

        deleted.emit(ConversationDeletedSocketEvent(conversationId = "c1"))
        advanceUntilIdle()

        // c1's bookmark is gone; c2's survives.
        assertThat(stars.starred.value.items.map { it.conversationId }).containsExactly("c2")
        coVerify { repo.refresh() }
    }

    @Test
    fun a_blank_delete_event_touches_neither_the_stars_nor_the_network() = runTest(dispatcher) {
        val deleted = MutableSharedFlow<ConversationDeletedSocketEvent>()
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)))
        val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"))))
        val vm = viewModel(repo, socket = socketManager(conversationDeleted = deleted), starredStore = stars)
        advanceUntilIdle()

        deleted.emit(ConversationDeletedSocketEvent(conversationId = "  "))
        advanceUntilIdle()

        assertThat(stars.starred.value.items.map { it.conversationId }).containsExactly("c1")
        coVerify(exactly = 0) { repo.refresh() }
    }

    @Test
    fun the_current_user_leaving_sheds_that_conversation_stars_and_refreshes() = runTest(dispatcher) {
        val left = MutableSharedFlow<ParticipantLeftEvent>()
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)))
        val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"))))
        val vm = viewModel(
            repo,
            socket = socketManager(participantLeft = left),
            starredStore = stars,
            session = session(userId = "me"),
        )
        advanceUntilIdle()

        left.emit(ParticipantLeftEvent(conversationId = "c1", userId = "me"))
        advanceUntilIdle()

        assertThat(stars.starred.value.items).isEmpty()
        coVerify { repo.refresh() }
    }

    @Test
    fun another_participant_leaving_leaves_my_stars_and_list_untouched() = runTest(dispatcher) {
        val left = MutableSharedFlow<ParticipantLeftEvent>()
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)))
        val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"))))
        val vm = viewModel(
            repo,
            socket = socketManager(participantLeft = left),
            starredStore = stars,
            session = session(userId = "me"),
        )
        advanceUntilIdle()

        left.emit(ParticipantLeftEvent(conversationId = "c1", userId = "someone-else"))
        advanceUntilIdle()

        assertThat(stars.starred.value.items.map { it.conversationId }).containsExactly("c1")
        coVerify(exactly = 0) { repo.refresh() }
    }

    @Test
    fun load_preview_messages_populates_the_preview_for_that_conversation() = runTest(dispatcher) {
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)))
        val recent = listOf(LocalMessage(message = ApiMessage(id = "m1", conversationId = "c1", content = "hi")))
        val vm = viewModel(repo, messageRepo = messageRepository(recent))
        advanceUntilIdle()

        assertThat(vm.state.value.previewFor("c1")).isNull()

        vm.loadPreviewMessages("c1")
        advanceUntilIdle()

        assertThat(vm.state.value.previewFor("c1")).isEqualTo(recent)
    }

    @Test
    fun load_preview_messages_never_queries_the_repository_twice_for_the_same_conversation() = runTest(dispatcher) {
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)))
        val messageRepo = messageRepository(emptyList())
        val vm = viewModel(repo, messageRepo = messageRepo)
        advanceUntilIdle()

        vm.loadPreviewMessages("c1")
        advanceUntilIdle()
        vm.loadPreviewMessages("c1")
        advanceUntilIdle()

        coVerify(exactly = 1) { messageRepo.recentMessages("c1", any()) }
    }

    @Test
    fun load_preview_messages_does_not_re_query_while_a_load_is_already_in_flight() = runTest(dispatcher) {
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)))
        val messageRepo = mockk<MessageRepository>()
        coEvery { messageRepo.recentMessages(any(), any()) } coAnswers {
            kotlinx.coroutines.delay(1_000)
            emptyList()
        }
        val vm = viewModel(repo, messageRepo = messageRepo)
        advanceUntilIdle()

        vm.loadPreviewMessages("c1")
        vm.loadPreviewMessages("c1")
        advanceUntilIdle()

        coVerify(exactly = 1) { messageRepo.recentMessages("c1", any()) }
    }

    @Test
    fun load_preview_messages_for_different_conversations_are_independent() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1"), ApiConversation(id = "c2")), ageMillis = 0)),
        )
        val messageRepo = mockk<MessageRepository>()
        coEvery { messageRepo.recentMessages("c1", any()) } returns
            listOf(LocalMessage(message = ApiMessage(id = "a", conversationId = "c1")))
        coEvery { messageRepo.recentMessages("c2", any()) } returns
            listOf(LocalMessage(message = ApiMessage(id = "b", conversationId = "c2")))
        val vm = viewModel(repo, messageRepo = messageRepo)
        advanceUntilIdle()

        vm.loadPreviewMessages("c1")
        vm.loadPreviewMessages("c2")
        advanceUntilIdle()

        assertThat(vm.state.value.previewFor("c1")?.single()?.message?.id).isEqualTo("a")
        assertThat(vm.state.value.previewFor("c2")?.single()?.message?.id).isEqualTo("b")
    }

    @Test
    fun the_star_cleanup_survives_a_failing_refresh_without_crashing_or_surfacing_an_error() =
        runTest(dispatcher) {
            val deleted = MutableSharedFlow<ConversationDeletedSocketEvent>()
            val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)))
            coEvery { repo.refresh() } throws RuntimeException("offline")
            val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"))))
            val vm = viewModel(repo, socket = socketManager(conversationDeleted = deleted), starredStore = stars)
            advanceUntilIdle()

            deleted.emit(ConversationDeletedSocketEvent(conversationId = "c1"))
            advanceUntilIdle()

            // The local star cleanup happened regardless of the refresh outcome; the
            // background failure stays silent (no user-facing error banner).
            assertThat(stars.starred.value.items).isEmpty()
            assertThat(vm.state.value.errorMessage).isNull()
        }

    @Test
    fun `a typing_start frame surfaces the typer on the matching row`() =
        runTest(dispatcher) {
            val started = MutableSharedFlow<TypingEvent>()
            val repo = repositoryReturning(flowOf(CacheResult.Empty))
            val vm = viewModel(
                repo,
                socket = socketManager(typingStarted = started),
                session = session("me"),
            )
            advanceUntilIdle()

            started.emit(TypingEvent(conversationId = "c1", userId = "u1", displayName = "Alice"))
            // runCurrent (not advanceUntilIdle) so the 15s safety timer does not fire.
            runCurrent()

            assertThat(vm.state.value.typingDisplayNameFor("c1")).isEqualTo("Alice")
            assertThat(vm.state.value.typingDisplayNameFor("c2")).isNull()
        }

    @Test
    fun `the reader never sees themselves typing in a row`() =
        runTest(dispatcher) {
            val started = MutableSharedFlow<TypingEvent>()
            val repo = repositoryReturning(flowOf(CacheResult.Empty))
            val vm = viewModel(
                repo,
                socket = socketManager(typingStarted = started),
                session = session("me"),
            )
            advanceUntilIdle()

            started.emit(TypingEvent(conversationId = "c1", userId = "me", displayName = "Me"))
            runCurrent()

            assertThat(vm.state.value.typingDisplayNameFor("c1")).isNull()
        }

    @Test
    fun `a typing_stop frame clears exactly that typer`() =
        runTest(dispatcher) {
            val started = MutableSharedFlow<TypingEvent>()
            val stopped = MutableSharedFlow<TypingEvent>()
            val repo = repositoryReturning(flowOf(CacheResult.Empty))
            val vm = viewModel(
                repo,
                socket = socketManager(typingStarted = started, typingStopped = stopped),
                session = session("me"),
            )
            advanceUntilIdle()

            started.emit(TypingEvent(conversationId = "c1", userId = "u1", displayName = "Alice"))
            started.emit(TypingEvent(conversationId = "c1", userId = "u2", displayName = "Bob"))
            runCurrent()
            stopped.emit(TypingEvent(conversationId = "c1", userId = "u1"))
            runCurrent()

            // Bob is still composing, so the row stays lit with his name.
            assertThat(vm.state.value.typingDisplayNameFor("c1")).isEqualTo("Bob")
        }

    @Test
    fun `a stuck typer is force-cleared after the 15s safety timeout`() =
        runTest(dispatcher) {
            val started = MutableSharedFlow<TypingEvent>()
            val repo = repositoryReturning(flowOf(CacheResult.Empty))
            val vm = viewModel(
                repo,
                socket = socketManager(typingStarted = started),
                session = session("me"),
            )
            advanceUntilIdle()

            started.emit(TypingEvent(conversationId = "c1", userId = "u1", displayName = "Alice"))
            runCurrent()
            assertThat(vm.state.value.typingDisplayNameFor("c1")).isEqualTo("Alice")

            advanceTimeBy(15_001)
            runCurrent()

            assertThat(vm.state.value.typingDisplayNameFor("c1")).isNull()
        }

    @Test
    fun `a fresh typing_start re-arms the safety timeout so an active typer is not dropped early`() =
        runTest(dispatcher) {
            val started = MutableSharedFlow<TypingEvent>()
            val repo = repositoryReturning(flowOf(CacheResult.Empty))
            val vm = viewModel(
                repo,
                socket = socketManager(typingStarted = started),
                session = session("me"),
            )
            advanceUntilIdle()

            started.emit(TypingEvent(conversationId = "c1", userId = "u1", displayName = "Alice"))
            runCurrent()
            // 10s in, still typing → a second start re-arms the 15s window.
            advanceTimeBy(10_000)
            started.emit(TypingEvent(conversationId = "c1", userId = "u1", displayName = "Alice"))
            runCurrent()
            // 10s more: 20s since the first start, but only 10s since the re-arm → still lit.
            advanceTimeBy(10_000)
            runCurrent()
            assertThat(vm.state.value.typingDisplayNameFor("c1")).isEqualTo("Alice")

            // 6s more crosses the re-armed 15s deadline → cleared.
            advanceTimeBy(6_000)
            runCurrent()
            assertThat(vm.state.value.typingDisplayNameFor("c1")).isNull()
        }

    // --- mood-status avatar affordance (parity iOS conversationMoodStatus) ------

    @Test
    fun `the FRIENDS statuses bar paints the peer's mood emoji onto its direct row`() =
        runTest(dispatcher) {
            val vm = viewModel(
                repositoryReturning(flowOf(CacheResult.Empty)),
                session = session("me"),
                statusBarCache = statusBarCache(
                    StatusFeedMode.FRIENDS to listOf(status("other", "🔥")),
                ),
            )
            advanceUntilIdle()

            assertThat(vm.state.value.moodEmojiFor(direct("c1"))).isEqualTo("🔥")
        }

    @Test
    fun `a DISCOVER-only status never decorates a conversation row`() =
        runTest(dispatcher) {
            // Only the DISCOVER bar holds the status; the row reads the FRIENDS bar.
            val vm = viewModel(
                repositoryReturning(flowOf(CacheResult.Empty)),
                session = session("me"),
                statusBarCache = statusBarCache(
                    StatusFeedMode.DISCOVER to listOf(status("other", "🎉")),
                ),
            )
            advanceUntilIdle()

            assertThat(vm.state.value.moodEmojiFor(direct("c1"))).isNull()
        }

    @Test
    fun `a cold statuses cache leaves every row without a mood badge`() =
        runTest(dispatcher) {
            val vm = viewModel(
                repositoryReturning(flowOf(CacheResult.Empty)),
                session = session("me"),
                statusBarCache = statusBarCache(),
            )
            advanceUntilIdle()

            assertThat(vm.state.value.moodStatuses).isEmpty()
            assertThat(vm.state.value.moodEmojiFor(direct("c1"))).isNull()
        }
}
