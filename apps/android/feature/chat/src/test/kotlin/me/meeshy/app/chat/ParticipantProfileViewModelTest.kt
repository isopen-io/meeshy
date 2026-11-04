package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.ParticipantProfileCache
import me.meeshy.sdk.conversation.ParticipantProfileKey
import me.meeshy.sdk.model.ConversationSocketEvent
import me.meeshy.sdk.model.ParticipantEntryLink
import me.meeshy.sdk.model.ParticipantRightsUpdatedEvent
import me.meeshy.sdk.model.ServedParticipantRights
import me.meeshy.sdk.model.UserUpdatedEvent
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.ConversationSocketEventsManager
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.model.ApiParticipantProfile
import me.meeshy.sdk.model.ParticipantCapability
import me.meeshy.sdk.model.ParticipantEntryCapabilities
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ParticipantRightsUpdateResult
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * La fiche d'un participant sur Android (#3943) — troisième client du geste
 * « voit l'historique depuis le \<date\> » que iOS et web rendent depuis #3877.
 *
 * Deux invariants gouvernent ce ViewModel, et ils viennent tous deux du
 * gateway, pas de l'écran :
 *
 * 1. **`canGrantHistory` ne se recalcule JAMAIS côté client.** C'est un SIGNAL
 *    du serveur — « CE lecteur peut-il poser l'octroi ? » — et lui seul sait
 *    répondre : un modérateur LIT l'octroi sans pouvoir l'écrire, et
 *    `historyVisibleFrom: null` ne distingue pas « pas hôte » de « hôte, aucun
 *    octroi ». Déduire le droit d'un rang afficherait un contrôle qui échouerait
 *    en 403.
 * 2. **L'écriture est optimiste, et elle se REND en cas d'échec.** Un octroi
 *    posé qui resterait affiché après un refus serveur ferait croire à un droit
 *    qui n'existe pas.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ParticipantProfileViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private fun profile(
        canGrantHistory: Boolean = false,
        historyVisibleFrom: String? = null,
        capabilities: ParticipantEntryCapabilities? = null,
    ) = ApiParticipantProfile(
        participantId = "p1",
        conversationId = "c1",
        isAnonymous = capabilities != null,
        displayName = "ano_bob",
        canGrantHistory = canGrantHistory,
        historyVisibleFrom = historyVisibleFrom,
        entryCapabilities = capabilities,
    )

    private fun repo(
        load: NetworkResult<ApiParticipantProfile> = NetworkResult.Success(profile()),
        write: NetworkResult<ParticipantRightsUpdateResult> =
            NetworkResult.Success(ParticipantRightsUpdateResult()),
    ) = mockk<ConversationRepository>(relaxed = true).also {
        coEvery { it.participantProfile(any(), any()) } returns load
        coEvery { it.updateHistoryGrant(any(), any(), any()) } returns write
    }

    private val rightsEvents = MutableSharedFlow<ConversationSocketEvent>()
    private val userEvents = MutableSharedFlow<UserUpdatedEvent>()
    private val cache = ParticipantProfileCache()

    private fun viewModel(repository: ConversationRepository = repo()): ParticipantProfileViewModel {
        val conversationSocket = mockk<ConversationSocketEventsManager>()
        every { conversationSocket.events } returns rightsEvents
        val messageSocket = mockk<MessageSocketManager>()
        every { messageSocket.userUpdated } returns userEvents
        val session = mockk<SessionRepository>()
        every { session.currentUserId } returns "reader"
        return ParticipantProfileViewModel(repository, cache, conversationSocket, messageSocket, session)
    }

    // ── Chargement ──────────────────────────────────────────────────────────

    @Test
    fun `load serves the profile and marks it loaded`() = runTest {
        val vm = viewModel(repo(NetworkResult.Success(profile(canGrantHistory = true))))

        vm.load("c1", "p1")
        advanceUntilIdle()

        assertThat(vm.state.value.status).isEqualTo(ProfileLoadStatus.Loaded)
        assertThat(vm.state.value.profile?.participantId).isEqualTo("p1")
    }

    @Test
    fun `load addresses the PARTICIPANT id, never a user id`() = runTest {
        val repository = repo()
        val vm = viewModel(repository)

        vm.load("c1", "part-42")
        advanceUntilIdle()

        coVerify { repository.participantProfile("c1", "part-42") }
    }

    @Test
    fun `a failed load is an error state, not an empty sheet`() = runTest {
        val vm = viewModel(repo(NetworkResult.Failure(ApiError("boom", code = "NETWORK"))))

        vm.load("c1", "p1")
        advanceUntilIdle()

        assertThat(vm.state.value.status).isEqualTo(ProfileLoadStatus.Error)
        assertThat(vm.state.value.profile).isNull()
    }

    // ── Le droit d'écrire vient du serveur ──────────────────────────────────

    @Test
    fun `canGrantHistory mirrors the server signal, it is never derived`() = runTest {
        val vm = viewModel(repo(NetworkResult.Success(profile(canGrantHistory = true))))

        vm.load("c1", "p1")
        advanceUntilIdle()

        assertThat(vm.state.value.canGrantHistory).isTrue()
    }

    @Test
    fun `a moderator reads the grant without being offered the control`() = runTest {
        val vm = viewModel(
            repo(NetworkResult.Success(profile(canGrantHistory = false, historyVisibleFrom = "2026-01-15T00:00:00.000Z")))
        )

        vm.load("c1", "p1")
        advanceUntilIdle()

        assertThat(vm.state.value.canGrantHistory).isFalse()
        assertThat(vm.state.value.profile?.historyVisibleFrom).isEqualTo("2026-01-15T00:00:00.000Z")
    }

    @Test
    fun `setHistoryGrant does nothing when the server says the viewer may not`() = runTest {
        val repository = repo(NetworkResult.Success(profile(canGrantHistory = false)))
        val vm = viewModel(repository)
        vm.load("c1", "p1")
        advanceUntilIdle()

        vm.setHistoryGrant("2026-03-01T00:00:00.000Z")
        advanceUntilIdle()

        coVerify(exactly = 0) { repository.updateHistoryGrant(any(), any(), any()) }
    }

    // ── Poser, retirer, échouer ─────────────────────────────────────────────

    @Test
    fun `setHistoryGrant posts the date and keeps it`() = runTest {
        val repository = repo(NetworkResult.Success(profile(canGrantHistory = true)))
        val vm = viewModel(repository)
        vm.load("c1", "p1")
        advanceUntilIdle()

        vm.setHistoryGrant("2026-03-01T00:00:00.000Z")
        advanceUntilIdle()

        coVerify { repository.updateHistoryGrant("c1", "p1", "2026-03-01T00:00:00.000Z") }
        assertThat(vm.state.value.profile?.historyVisibleFrom).isEqualTo("2026-03-01T00:00:00.000Z")
        assertThat(vm.state.value.grantWriteInFlight).isFalse()
    }

    /**
     * `null` est une VALEUR — « retire l'octroi » — pas une absence. Le
     * repository force l'encodage de la clé pour que le gateway puisse
     * distinguer « retirer » de « ne rien dire ».
     */
    @Test
    fun `clearHistoryGrant sends an explicit null`() = runTest {
        val repository = repo(
            NetworkResult.Success(profile(canGrantHistory = true, historyVisibleFrom = "2026-01-15T00:00:00.000Z"))
        )
        val vm = viewModel(repository)
        vm.load("c1", "p1")
        advanceUntilIdle()

        vm.clearHistoryGrant()
        advanceUntilIdle()

        coVerify { repository.updateHistoryGrant("c1", "p1", null) }
        assertThat(vm.state.value.profile?.historyVisibleFrom).isNull()
    }

    @Test
    fun `a refused write is rolled back, never left showing a right that does not exist`() = runTest {
        val repository = repo(
            load = NetworkResult.Success(profile(canGrantHistory = true, historyVisibleFrom = "2026-01-15T00:00:00.000Z")),
            write = NetworkResult.Failure(ApiError("forbidden", code = "HTTP_403", httpStatus = 403)),
        )
        val vm = viewModel(repository)
        vm.load("c1", "p1")
        advanceUntilIdle()

        vm.setHistoryGrant("2026-03-01T00:00:00.000Z")
        advanceUntilIdle()

        assertThat(vm.state.value.profile?.historyVisibleFrom).isEqualTo("2026-01-15T00:00:00.000Z")
        assertThat(vm.state.value.grantFailed).isTrue()
        assertThat(vm.state.value.grantWriteInFlight).isFalse()
    }

    @Test
    fun `dismissGrantError clears the banner without touching the grant`() = runTest {
        val repository = repo(
            load = NetworkResult.Success(profile(canGrantHistory = true)),
            write = NetworkResult.Failure(ApiError("forbidden", code = "HTTP_403", httpStatus = 403)),
        )
        val vm = viewModel(repository)
        vm.load("c1", "p1")
        advanceUntilIdle()
        vm.setHistoryGrant("2026-03-01T00:00:00.000Z")
        advanceUntilIdle()

        vm.dismissGrantError()

        assertThat(vm.state.value.grantFailed).isFalse()
    }

    // ── La règle d'affichage vient du modèle, pas de l'écran ────────────────

    @Test
    fun `deniedCapabilities delegates to the shared rule`() = runTest {
        val vm = viewModel(
            repo(
                NetworkResult.Success(
                    profile(
                        capabilities = ParticipantEntryCapabilities(
                            canSendMessages = true, canSendFiles = true, canSendImages = false,
                            canSendVideos = true, canSendAudios = true, canSendLocations = true,
                            canSendLinks = true, canViewHistory = false,
                        )
                    )
                )
            )
        )

        vm.load("c1", "p1")
        advanceUntilIdle()

        assertThat(vm.state.value.deniedCapabilities).containsExactly(
            ParticipantCapability.CAN_VIEW_HISTORY,
            ParticipantCapability.CAN_SEND_IMAGES,
        ).inOrder()
    }

    @Test
    fun `deniedCapabilities is empty for a registered member who has no entry capabilities`() = runTest {
        val vm = viewModel()

        vm.load("c1", "p1")
        advanceUntilIdle()

        assertThat(vm.state.value.deniedCapabilities).isEmpty()
    }

    // ── Fiche instantanée, droits, direct ──────────────────────────────────

    private fun allowAll() = ParticipantEntryCapabilities(
        canSendMessages = true, canSendFiles = true, canSendImages = true, canSendVideos = true,
        canSendAudios = true, canSendLocations = true, canSendLinks = true, canViewHistory = true,
    )

    private fun editableProfile() = profile(capabilities = allowAll()).copy(entryLink = ParticipantEntryLink(name = "L"))

    @Test
    fun `a cached profile is painted at once and a failed sync keeps it`() = runTest {
        cache.put(ParticipantProfileKey("reader", "c1", "p1"), "ADMIN", profile(canGrantHistory = true))
        val vm = viewModel(repo(NetworkResult.Failure(ApiError("boom", code = "NETWORK"))))
        vm.load("c1", "p1", "ADMIN")
        assertThat(vm.state.value.status).isEqualTo(ProfileLoadStatus.Loaded)
        advanceUntilIdle()
        assertThat(vm.state.value.status).isEqualTo(ProfileLoadStatus.Loaded)
        assertThat(vm.state.value.profile).isNotNull()
    }

    @Test
    fun `a 404 says the person left and wipes the copy`() = runTest {
        val key = ParticipantProfileKey("reader", "c1", "p1")
        cache.put(key, "ADMIN", profile())
        val vm = viewModel(repo(NetworkResult.Failure(ApiError("gone", httpStatus = 404))))
        vm.load("c1", "p1", "ADMIN")
        advanceUntilIdle()
        assertThat(vm.state.value.status).isEqualTo(ProfileLoadStatus.Left)
        assertThat(cache.get(key, "ADMIN")).isNull()
    }

    @Test
    fun `toggling a right sends that single right and keeps the resolved answer`() = runTest {
        val resolved = allowAll().copy(canSendLinks = false)
        val repository = repo(NetworkResult.Success(editableProfile()), NetworkResult.Success(ParticipantRightsUpdateResult(rights = resolved)))
        coEvery { repository.updateParticipantRight(any(), any(), any(), any()) } returns
            NetworkResult.Success(ParticipantRightsUpdateResult(rights = resolved))
        val vm = viewModel(repository)
        vm.load("c1", "p1")
        advanceUntilIdle()
        vm.toggleRight(ParticipantCapability.CAN_SEND_LINKS)
        assertThat(vm.state.value.isGranted(ParticipantCapability.CAN_SEND_LINKS)).isFalse()
        advanceUntilIdle()
        coVerify(exactly = 1) { repository.updateParticipantRight("c1", "p1", ParticipantCapability.CAN_SEND_LINKS, false) }
        assertThat(vm.state.value.profile?.entryCapabilities).isEqualTo(resolved)
        assertThat(vm.state.value.rightsWriteInFlight).isFalse()
    }

    @Test
    fun `a refused right rolls back and announces the failure`() = runTest {
        val repository = repo(NetworkResult.Success(editableProfile()))
        coEvery { repository.updateParticipantRight(any(), any(), any(), any()) } returns
            NetworkResult.Failure(ApiError("no", httpStatus = 403))
        val vm = viewModel(repository)
        vm.load("c1", "p1")
        advanceUntilIdle()
        vm.toggleRight(ParticipantCapability.CAN_SEND_FILES)
        advanceUntilIdle()
        assertThat(vm.state.value.isGranted(ParticipantCapability.CAN_SEND_FILES)).isTrue()
        assertThat(vm.state.value.rightsFailed).isTrue()
    }

    @Test
    fun `only one right is written at a time`() = runTest {
        val repository = repo(NetworkResult.Success(editableProfile()))
        coEvery { repository.updateParticipantRight(any(), any(), any(), any()) } returns
            NetworkResult.Success(ParticipantRightsUpdateResult())
        val vm = viewModel(repository)
        vm.load("c1", "p1")
        advanceUntilIdle()
        vm.toggleRight(ParticipantCapability.CAN_SEND_FILES)
        vm.toggleRight(ParticipantCapability.CAN_SEND_LINKS)
        advanceUntilIdle()
        coVerify(exactly = 1) { repository.updateParticipantRight(any(), any(), any(), any()) }
    }

    @Test
    fun `without entryLink the rights are read only`() = runTest {
        val repository = repo(NetworkResult.Success(profile(capabilities = allowAll())))
        val vm = viewModel(repository)
        vm.load("c1", "p1")
        advanceUntilIdle()
        vm.toggleRight(ParticipantCapability.CAN_SEND_FILES)
        advanceUntilIdle()
        coVerify(exactly = 0) { repository.updateParticipantRight(any(), any(), any(), any()) }
    }

    @Test
    fun `rights-updated applies live to the open profile without a reload`() = runTest {
        val repository = repo(NetworkResult.Success(editableProfile()))
        val vm = viewModel(repository)
        vm.load("c1", "p1")
        advanceUntilIdle()
        rightsEvents.emit(
            ParticipantRightsUpdatedEvent("c1", "p1", rights = ServedParticipantRights(canSendLinks = false)),
        )
        advanceUntilIdle()
        assertThat(vm.state.value.isGranted(ParticipantCapability.CAN_SEND_LINKS)).isFalse()
        coVerify(exactly = 1) { repository.participantProfile(any(), any()) }
    }

    // ── Une fiche par participant : rien de A ne se pose sous B (audit #15733) ──

    private fun hostView(participantId: String, email: String) =
        editableProfile().copy(participantId = participantId, email = email)

    @Test
    fun `a late answer for A is neither shown nor cached under B`() = runTest {
        val answerA = CompletableDeferred<NetworkResult<ApiParticipantProfile>>()
        val answerB = CompletableDeferred<NetworkResult<ApiParticipantProfile>>()
        val repository = repo()
        coEvery { repository.participantProfile("c1", "A") } coAnswers { answerA.await() }
        coEvery { repository.participantProfile("c1", "B") } coAnswers { answerB.await() }
        val vm = viewModel(repository)

        vm.load("c1", "A", "ADMIN")
        advanceUntilIdle()
        vm.load("c1", "B", "ADMIN")
        advanceUntilIdle()
        answerB.complete(NetworkResult.Success(hostView("B", "b@x.io")))
        advanceUntilIdle()
        answerA.complete(NetworkResult.Success(hostView("A", "a@x.io")))
        advanceUntilIdle()

        assertThat(vm.state.value.profile?.email).isEqualTo("b@x.io")
        assertThat(cache.get(ParticipantProfileKey("reader", "c1", "B"), "ADMIN")?.email).isEqualTo("b@x.io")
    }

    @Test
    fun `a late 404 for A neither wipes B nor says B left`() = runTest {
        val answerA = CompletableDeferred<NetworkResult<ApiParticipantProfile>>()
        val repository = repo()
        coEvery { repository.participantProfile("c1", "A") } coAnswers { answerA.await() }
        coEvery { repository.participantProfile("c1", "B") } returns NetworkResult.Success(hostView("B", "b@x.io"))
        val vm = viewModel(repository)

        vm.load("c1", "A", "ADMIN")
        advanceUntilIdle()
        vm.load("c1", "B", "ADMIN")
        advanceUntilIdle()
        answerA.complete(NetworkResult.Failure(ApiError("gone", httpStatus = 404)))
        advanceUntilIdle()

        assertThat(vm.state.value.status).isEqualTo(ProfileLoadStatus.Loaded)
        assertThat(cache.get(ParticipantProfileKey("reader", "c1", "B"), "ADMIN")).isNotNull()
    }

    @Test
    fun `opening B without a copy never shows the header of A while loading`() = runTest {
        val answerB = CompletableDeferred<NetworkResult<ApiParticipantProfile>>()
        val repository = repo()
        coEvery { repository.participantProfile("c1", "A") } returns NetworkResult.Success(hostView("A", "a@x.io"))
        coEvery { repository.participantProfile("c1", "B") } coAnswers { answerB.await() }
        val vm = viewModel(repository)

        vm.load("c1", "A", "ADMIN")
        advanceUntilIdle()
        vm.load("c1", "B", "ADMIN")

        assertThat(vm.state.value.status).isEqualTo(ProfileLoadStatus.Loading)
        assertThat(vm.state.value.profile).isNull()
    }

    @Test
    fun `a right written on A that lands after B opened never touches B`() = runTest {
        val writeA = CompletableDeferred<NetworkResult<ParticipantRightsUpdateResult>>()
        val repository = repo()
        coEvery { repository.participantProfile("c1", "A") } returns NetworkResult.Success(hostView("A", "a@x.io"))
        coEvery { repository.participantProfile("c1", "B") } returns NetworkResult.Success(hostView("B", "b@x.io"))
        coEvery { repository.updateParticipantRight("c1", "A", any(), any()) } coAnswers { writeA.await() }
        val vm = viewModel(repository)

        vm.load("c1", "A", "ADMIN")
        advanceUntilIdle()
        vm.toggleRight(ParticipantCapability.CAN_SEND_LINKS)
        advanceUntilIdle()
        vm.load("c1", "B", "ADMIN")
        advanceUntilIdle()
        writeA.complete(NetworkResult.Success(ParticipantRightsUpdateResult(rights = allowAll().copy(canSendLinks = false))))
        advanceUntilIdle()

        assertThat(vm.state.value.isGranted(ParticipantCapability.CAN_SEND_LINKS)).isTrue()
        assertThat(vm.state.value.rightsWriteInFlight).isFalse()
        assertThat(cache.get(ParticipantProfileKey("reader", "c1", "B"), "ADMIN")?.entryCapabilities?.canSendLinks)
            .isTrue()
    }

    @Test
    fun `a toggle on B writes B from the rights of B`() = runTest {
        val repository = repo()
        coEvery { repository.participantProfile("c1", "A") } returns
            NetworkResult.Success(hostView("A", "a@x.io").copy(entryCapabilities = allowAll().copy(canSendLinks = false)))
        coEvery { repository.participantProfile("c1", "B") } returns NetworkResult.Success(hostView("B", "b@x.io"))
        coEvery { repository.updateParticipantRight(any(), any(), any(), any()) } returns
            NetworkResult.Success(ParticipantRightsUpdateResult())
        val vm = viewModel(repository)

        vm.load("c1", "A", "ADMIN")
        advanceUntilIdle()
        vm.load("c1", "B", "ADMIN")
        advanceUntilIdle()
        vm.toggleRight(ParticipantCapability.CAN_SEND_LINKS)
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.updateParticipantRight("c1", "B", ParticipantCapability.CAN_SEND_LINKS, false) }
    }

    // ── Le rôle du lecteur garde la copie ; un refus la retire ──────────────

    @Test
    fun `without the reader role no copy is painted before the sync`() = runTest {
        cache.put(ParticipantProfileKey("reader", "c1", "p1"), null, hostView("p1", "a@x.io"))
        val answer = CompletableDeferred<NetworkResult<ApiParticipantProfile>>()
        val repository = repo()
        coEvery { repository.participantProfile("c1", "p1") } coAnswers { answer.await() }
        val vm = viewModel(repository)

        vm.load("c1", "p1")

        assertThat(vm.state.value.profile).isNull()
        assertThat(vm.state.value.status).isEqualTo(ProfileLoadStatus.Loading)
    }

    @Test
    fun `a 403 wipes the copy and every host-only field`() = runTest {
        val key = ParticipantProfileKey("reader", "c1", "p1")
        cache.put(key, "ADMIN", hostView("p1", "a@x.io"))
        val vm = viewModel(repo(NetworkResult.Failure(ApiError("forbidden", httpStatus = 403))))

        vm.load("c1", "p1", "ADMIN")
        advanceUntilIdle()

        assertThat(vm.state.value.profile).isNull()
        assertThat(vm.state.value.status).isEqualTo(ProfileLoadStatus.Error)
        assertThat(cache.get(key, "ADMIN")).isNull()
    }

    @Test
    fun `a 401 wipes the copy too`() = runTest {
        val key = ParticipantProfileKey("reader", "c1", "p1")
        cache.put(key, "ADMIN", hostView("p1", "a@x.io"))
        val vm = viewModel(repo(NetworkResult.Failure(ApiError("expired", httpStatus = 401))))

        vm.load("c1", "p1", "ADMIN")
        advanceUntilIdle()

        assertThat(vm.state.value.profile).isNull()
        assertThat(cache.get(key, "ADMIN")).isNull()
    }

    @Test
    fun `a 5xx keeps the copy on screen`() = runTest {
        cache.put(ParticipantProfileKey("reader", "c1", "p1"), "ADMIN", hostView("p1", "a@x.io"))
        val vm = viewModel(repo(NetworkResult.Failure(ApiError("down", httpStatus = 503))))

        vm.load("c1", "p1", "ADMIN")
        advanceUntilIdle()

        assertThat(vm.state.value.profile?.email).isEqualTo("a@x.io")
    }

    // ── Une fiche fermée n'écoute plus rien (dimension 3) ────────────────────

    @Test
    fun `a closed profile stops listening to the room`() = runTest {
        val vm = viewModel(repo(NetworkResult.Success(editableProfile())))
        vm.load("c1", "p1", "ADMIN")
        advanceUntilIdle()

        vm.close()
        advanceUntilIdle()
        rightsEvents.emit(
            ParticipantRightsUpdatedEvent("c1", "p1", rights = ServedParticipantRights(canSendLinks = false)),
        )
        advanceUntilIdle()

        assertThat(rightsEvents.subscriptionCount.value).isEqualTo(0)
        assertThat(userEvents.subscriptionCount.value).isEqualTo(0)
        assertThat(vm.state.value.isGranted(ParticipantCapability.CAN_SEND_LINKS)).isTrue()
    }

    @Test
    fun `a reader whose role changed reloads the profile from scratch`() = runTest {
        val repository = repo()
        coEvery { repository.participantProfile("c1", "p1") } returnsMany listOf(
            NetworkResult.Success(hostView("p1", "a@x.io")),
            NetworkResult.Success(profile()),
        )
        val vm = viewModel(repository)
        vm.load("c1", "p1", "ADMIN")
        advanceUntilIdle()

        vm.load("c1", "p1", "MEMBER")

        assertThat(vm.state.value.profile).isNull()
        advanceUntilIdle()
        assertThat(vm.state.value.profile?.email).isNull()
    }
}
