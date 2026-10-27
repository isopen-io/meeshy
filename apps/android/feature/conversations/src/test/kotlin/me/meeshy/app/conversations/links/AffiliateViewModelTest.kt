package me.meeshy.app.conversations.links

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.link.AffiliateReferralRepository
import me.meeshy.sdk.link.AffiliateRepository
import me.meeshy.sdk.link.LinksCache
import me.meeshy.sdk.model.AffiliateCount
import me.meeshy.sdk.model.AffiliateRegisterRequest
import me.meeshy.sdk.model.AffiliateStats
import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.sdk.model.AffiliateTrackVisitRequest
import me.meeshy.sdk.model.AffiliateTrackVisitResult
import me.meeshy.sdk.model.AffiliateValidation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateAffiliateTokenRequest
import me.meeshy.sdk.net.api.AffiliateApi
import me.meeshy.sdk.net.api.AffiliateReferralApi
import okhttp3.ResponseBody
import org.junit.After
import org.junit.Before
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class AffiliateViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private fun token(id: String, clicks: Int = 0, referrals: Int = 0) =
        AffiliateToken(id = id, token = "t$id", name = "n$id", affiliateLink = "https://meeshy.me/signup/affiliate/t$id", clickCount = clicks, _count = AffiliateCount(referrals))

    private class ReadApi(var list: ApiResponse<List<AffiliateToken>>) : AffiliateApi {
        override suspend fun listTokens(offset: Int, limit: Int) = list
        override suspend fun stats() = ApiResponse<AffiliateStats>(success = false)
    }

    private class WriteApi(
        var create: ApiResponse<AffiliateToken> = ApiResponse(success = false),
        var delete: ApiResponse<Unit> = ApiResponse(success = true, data = Unit),
        val refusedIds: Set<String> = emptySet(),
    ) : AffiliateReferralApi {
        val created = mutableListOf<CreateAffiliateTokenRequest>()
        val deleted = mutableListOf<String>()
        override suspend fun createToken(body: CreateAffiliateTokenRequest): ApiResponse<AffiliateToken> { created += body; return create }
        override suspend fun deleteToken(id: String): ApiResponse<Unit> {
            deleted += id
            return if (id in refusedIds) ApiResponse(success = false) else delete
        }
        override suspend fun register(body: AffiliateRegisterRequest): ApiResponse<JsonElement> = error("unused")
        override suspend fun click(token: String): ApiResponse<JsonElement> = error("unused")
        override suspend fun trackVisit(body: AffiliateTrackVisitRequest): ApiResponse<AffiliateTrackVisitResult> = error("unused")
        override suspend fun validate(token: String): ApiResponse<AffiliateValidation> = error("unused")
        override suspend fun openGraph(token: String): Response<ResponseBody> = error("unused")
    }

    private fun viewModel(read: ReadApi, write: WriteApi = WriteApi(), cache: LinksCache = LinksCache()) =
        AffiliateViewModel(AffiliateRepository(read), AffiliateReferralRepository(write), cache)

    @Test
    fun `un cache non vide peint la liste avant la reponse du reseau`() = runTest {
        val cache = LinksCache().apply { putAffiliateTokens(listOf(token("1"))) }
        val vm = viewModel(ReadApi(ApiResponse(success = true, data = listOf(token("1"), token("2")))), cache = cache)

        assertThat(vm.state.value.hasLoaded).isTrue()
        assertThat(vm.state.value.tokens.linkCount).isEqualTo(1)

        advanceUntilIdle()
        assertThat(vm.state.value.tokens.linkCount).isEqualTo(2)
        assertThat(cache.affiliateTokens()).hasSize(2)
    }

    @Test
    fun `un echec de chargement garde le cache et leve le bandeau`() = runTest {
        val cache = LinksCache().apply { putAffiliateTokens(listOf(token("1"))) }
        val vm = viewModel(ReadApi(ApiResponse(success = false)), cache = cache)
        advanceUntilIdle()

        assertThat(vm.state.value.tokens.linkCount).isEqualTo(1)
        assertThat(vm.state.value.refreshFailed).isTrue()
    }

    @Test
    fun `a froid le squelette dure jusqu'a la premiere reponse`() = runTest {
        val vm = viewModel(ReadApi(ApiResponse(success = true, data = emptyList())))
        assertThat(vm.state.value.hasLoaded).isFalse()
        advanceUntilIdle()
        assertThat(vm.state.value.hasLoaded).isTrue()
    }

    @Test
    fun `la creation met le jeton en tete et ferme la feuille`() = runTest {
        val write = WriteApi(create = ApiResponse(success = true, data = token("9")))
        val vm = viewModel(ReadApi(ApiResponse(success = true, data = listOf(token("1")))), write)
        advanceUntilIdle()

        vm.openCreate()
        vm.editForm { it.copy(name = "  Twitter ").withMaxUses("5") }
        vm.create()
        advanceUntilIdle()

        assertThat(write.created.single().name).isEqualTo("Twitter")
        assertThat(write.created.single().maxUses).isEqualTo(5)
        assertThat(vm.state.value.tokens.tokens.map { it.id }).containsExactly("9", "1").inOrder()
        assertThat(vm.state.value.createSheet).isNull()
    }

    @Test
    fun `une creation refusee garde la feuille ouverte et signale l'echec`() = runTest {
        val vm = viewModel(ReadApi(ApiResponse(success = true, data = emptyList())), WriteApi(create = ApiResponse(success = false)))
        advanceUntilIdle()
        vm.openCreate()
        vm.editForm { it.copy(name = "x") }
        vm.create()
        advanceUntilIdle()

        val sheet = vm.state.value.createSheet
        assertThat(sheet?.failed).isTrue()
        assertThat(sheet?.isCreating).isFalse()
    }

    @Test
    fun `un nom vide ne part pas au reseau`() = runTest {
        val write = WriteApi()
        val vm = viewModel(ReadApi(ApiResponse(success = true, data = emptyList())), write)
        advanceUntilIdle()
        vm.openCreate()
        vm.create()
        advanceUntilIdle()
        assertThat(write.created).isEmpty()
    }

    @Test
    fun `la suppression retire le jeton tout de suite`() = runTest {
        val write = WriteApi()
        val vm = viewModel(ReadApi(ApiResponse(success = true, data = listOf(token("1"), token("2")))), write)
        advanceUntilIdle()

        vm.delete("1")
        assertThat(vm.state.value.tokens.tokens.map { it.id }).containsExactly("2")
        advanceUntilIdle()
        assertThat(write.deleted).containsExactly("1")
        assertThat(vm.state.value.tokens.linkCount).isEqualTo(1)
    }

    @Test
    fun `une suppression refusee remet la liste d'avant et le cache avec`() = runTest {
        val cache = LinksCache()
        val write = WriteApi(delete = ApiResponse(success = false))
        val vm = viewModel(ReadApi(ApiResponse(success = true, data = listOf(token("1"), token("2")))), write, cache)
        advanceUntilIdle()

        vm.delete("1")
        advanceUntilIdle()

        assertThat(vm.state.value.tokens.tokens.map { it.id }).containsExactly("1", "2").inOrder()
        assertThat(cache.affiliateTokens()?.map { it.id }).containsExactly("1", "2").inOrder()
    }

    @Test
    fun `un refus ne ressuscite que son jeton, jamais celui qu'une autre suppression a retire`() = runTest {
        val cache = LinksCache()
        val write = WriteApi(refusedIds = setOf("1"))
        val vm = viewModel(ReadApi(ApiResponse(success = true, data = listOf(token("1"), token("2"), token("3")))), write, cache)
        advanceUntilIdle()

        vm.delete("1")
        vm.delete("2")
        assertThat(vm.state.value.tokens.tokens.map { it.id }).containsExactly("3")
        advanceUntilIdle()

        assertThat(vm.state.value.tokens.tokens.map { it.id }).containsExactly("1", "3").inOrder()
        assertThat(cache.affiliateTokens()?.map { it.id }).containsExactly("1", "3").inOrder()
    }
}
