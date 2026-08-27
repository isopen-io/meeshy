package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationRepository
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

    private fun viewModel(repository: ConversationRepository = repo()) =
        ParticipantProfileViewModel(repository)

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
}
