package me.meeshy.app.conversations

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateShareLinkDetail
import me.meeshy.sdk.model.CreateShareLinkRequest
import me.meeshy.sdk.model.CreateShareLinkResponse
import me.meeshy.sdk.model.ExtendShareLinkRequest
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.model.MyShareLinkStats
import me.meeshy.sdk.model.ToggleShareLinkRequest
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.api.LinkApi
import me.meeshy.sdk.sharelink.ShareLinkRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class InviteFriendsViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private val texts = InviteTexts(defaultMessage = "Rejoins-moi", defaultLinkName = "Rejoins la conversation \"Les amis\"")

    private class FakeLinkApi : LinkApi {
        val requests = mutableListOf<CreateShareLinkRequest>()
        var responses = ArrayDeque<ApiResponse<CreateShareLinkResponse>>()

        override suspend fun create(body: CreateShareLinkRequest): ApiResponse<CreateShareLinkResponse> {
            requests += body
            return responses.removeFirstOrNull() ?: ok("link-${requests.size}")
        }

        override suspend fun update(linkId: String, body: kotlinx.serialization.json.JsonObject) = ApiResponse(success = true, data = Unit)
        override suspend fun listMyLinks(offset: Int, limit: Int, expand: String?) = ApiResponse<List<MyShareLink>>(success = true, data = emptyList())
        override suspend fun fetchMyStats() = ApiResponse(success = true, data = MyShareLinkStats())
        override suspend fun toggle(linkId: String, body: ToggleShareLinkRequest) = ApiResponse(success = true, data = Unit)
        override suspend fun delete(linkId: String) = ApiResponse(success = true, data = Unit)
        override suspend fun extend(linkId: String, body: ExtendShareLinkRequest) = ApiResponse(success = true, data = Unit)
    }

    private companion object {
        fun ok(linkId: String) = ApiResponse(
            success = true,
            data = CreateShareLinkResponse(linkId = linkId, conversationId = "c1", shareLink = CreateShareLinkDetail(id = "sl", isActive = true)),
        )
    }

    private fun viewModel(api: FakeLinkApi) =
        InviteFriendsViewModel(ShareLinkRepository(api), MeeshyConfig()).apply { now = { 0L } }

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `a l'ouverture le lien est cree avec les defauts sans formulaire`() = runTest {
        val api = FakeLinkApi()
        val vm = viewModel(api)

        vm.start("c1", texts)
        assertThat(vm.state.value.phase).isEqualTo(InviteLinkPhase.Creating)
        advanceUntilIdle()

        val request = api.requests.single()
        assertThat(request.conversationId).isEqualTo("c1")
        assertThat(request.description).isEqualTo("Rejoins-moi")
        assertThat(request.name).isEqualTo(texts.defaultLinkName)
        assertThat(request.allowAnonymousFiles).isFalse()
        assertThat(request.allowViewHistory).isTrue()
        assertThat(vm.state.value.joinUrl).isEqualTo("https://meeshy.me/chat/link-1")
        assertThat(vm.state.value.phase).isEqualTo(InviteLinkPhase.Ready)
    }

    @Test
    fun `rouvrir la feuille ne cree pas un second lien`() = runTest {
        val api = FakeLinkApi()
        val vm = viewModel(api)
        vm.start("c1", texts)
        advanceUntilIdle()
        vm.start("c1", texts)
        advanceUntilIdle()
        assertThat(api.requests).hasSize(1)
    }

    @Test
    fun `partager sans modification ouvre le chooser sans regenerer`() = runTest {
        val api = FakeLinkApi()
        val vm = viewModel(api)
        vm.start("c1", texts)
        advanceUntilIdle()

        vm.effects.test {
            assertThat(awaitItem()).isEqualTo(InviteFriendsUiEffect.SuccessHaptic)
            vm.onEvent(InviteFriendsUiEvent.Share)
            advanceUntilIdle()
            assertThat(awaitItem()).isEqualTo(InviteFriendsUiEffect.OpenChooser("https://meeshy.me/chat/link-1"))
        }
        assertThat(api.requests).hasSize(1)
    }

    @Test
    fun `partager apres une modification regenere le lien puis ouvre le chooser sur le nouveau`() = runTest {
        val api = FakeLinkApi()
        val vm = viewModel(api)
        vm.start("c1", texts)
        advanceUntilIdle()
        vm.onEvent(InviteFriendsUiEvent.EditMessage("Salut"))
        vm.onEvent(InviteFriendsUiEvent.EditForm { it.withAllowAnonymousFiles(true) })
        assertThat(vm.state.value.optionsModified).isTrue()

        vm.effects.test {
            assertThat(awaitItem()).isEqualTo(InviteFriendsUiEffect.SuccessHaptic)
            vm.onEvent(InviteFriendsUiEvent.Share)
            advanceUntilIdle()
            assertThat(awaitItem()).isEqualTo(InviteFriendsUiEffect.OpenChooser("https://meeshy.me/chat/link-2"))
        }
        assertThat(api.requests).hasSize(2)
        assertThat(api.requests.last().allowAnonymousFiles).isTrue()
        assertThat(api.requests.last().description).isEqualTo("Salut")
        assertThat(vm.state.value.optionsModified).isFalse()
    }

    @Test
    fun `copier copie le lien et affiche Copie pendant 1,5 seconde`() = runTest {
        val vm = viewModel(FakeLinkApi())
        vm.start("c1", texts)
        advanceUntilIdle()

        vm.effects.test {
            assertThat(awaitItem()).isEqualTo(InviteFriendsUiEffect.SuccessHaptic)
            vm.onEvent(InviteFriendsUiEvent.Copy)
            assertThat(awaitItem()).isEqualTo(InviteFriendsUiEffect.CopyToClipboard("https://meeshy.me/chat/link-1"))
            assertThat(awaitItem()).isEqualTo(InviteFriendsUiEffect.SuccessHaptic)
        }
        assertThat(vm.state.value.copied).isTrue()
        advanceTimeBy(1_499)
        assertThat(vm.state.value.copied).isTrue()
        advanceTimeBy(2)
        assertThat(vm.state.value.copied).isFalse()
    }

    @Test
    fun `une erreur de creation s'affiche et le reessai recree le lien`() = runTest {
        val api = FakeLinkApi().apply { responses.add(ApiResponse(success = false, error = "boom")) }
        val vm = viewModel(api)
        vm.start("c1", texts)
        advanceUntilIdle()

        assertThat(vm.state.value.phase).isEqualTo(InviteLinkPhase.Failed)
        assertThat(vm.state.value.errorMessage).isEqualTo("boom")

        vm.onEvent(InviteFriendsUiEvent.Retry)
        advanceUntilIdle()
        assertThat(vm.state.value.phase).isEqualTo(InviteLinkPhase.Ready)
        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(api.requests).hasSize(2)
    }

    @Test
    fun `le stepper de limite avance de un puis de dix`() = runTest {
        val vm = viewModel(FakeLinkApi())
        vm.start("c1", texts)
        vm.onEvent(InviteFriendsUiEvent.EditForm { it.withMaxUsesEnabled(true).withMaxUses(99) })
        vm.onEvent(InviteFriendsUiEvent.StepMaxUses(1))
        vm.onEvent(InviteFriendsUiEvent.StepMaxUses(1))
        assertThat(vm.state.value.draft?.form?.maxUses).isEqualTo(110)
    }
}
