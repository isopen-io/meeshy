package me.meeshy.app.chat.appearance

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import me.meeshy.sdk.appearance.AppearanceCatalogLoader
import me.meeshy.sdk.appearance.WallpaperPackRepository
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.mediahub.BackgroundPhotoSource
import me.meeshy.sdk.mediahub.ConversationBackgroundPhotos
import me.meeshy.sdk.mediahub.ConversationMediaHubIndex
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.ConversationAppearance
import me.meeshy.sdk.model.appearance.ConversationBackground
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.packs.PackShopRepository
import me.meeshy.sdk.model.packs.PackInstallationUpdatedEvent
import kotlinx.coroutines.flow.MutableSharedFlow
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationAppearanceViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private class Fixture(val stream: MutableStateFlow<ApiConversation?>, val repository: ConversationRepository, val photos: ConversationBackgroundPhotos, val vm: ConversationAppearanceViewModel, val installations: MutableSharedFlow<PackInstallationUpdatedEvent>, val packs: WallpaperPackRepository)

    private fun fixture(
        appearanceJson: String? = null,
        writes: Boolean = true,
        current: () -> AppearanceCatalog = { AppearanceCatalog.EMPTY },
        installed: List<me.meeshy.sdk.model.appearance.InstalledPackSummary>? = null,
    ): Fixture {
        val conversation = ApiConversation(
            id = "c1",
            type = "direct",
            preferences = ApiConversationPreferences(appearance = appearanceJson?.let(Json::parseToJsonElement)),
        )
        val stream = MutableStateFlow<ApiConversation?>(conversation)
        val repository = mockk<ConversationRepository>()
        every { repository.conversationStream("c1") } returns stream
        coEvery { repository.setAppearanceOptimistic("c1", any()) } returns writes
        val loader = mockk<AppearanceCatalogLoader>()
        every { loader.current } answers { current() }
        coEvery { loader.catalog() } returns AppearanceCatalog.EMPTY
        val packs = mockk<WallpaperPackRepository>()
        every { packs.cached } returns null
        coEvery { packs.refresh() } returns installed
        val installations = MutableSharedFlow<PackInstallationUpdatedEvent>(extraBufferCapacity = 4)
        val shop = mockk<PackShopRepository>()
        every { shop.installations } returns installations
        val photos = ConversationBackgroundPhotos(ConversationMediaHubIndex(null))
        val tokens = mockk<TokenStore>()
        every { tokens.jwt } returns "jwt-1"
        every { tokens.sessionToken } returns null
        return Fixture(stream, repository, photos, ConversationAppearanceViewModel(repository, loader, packs, shop, photos, tokens, MeeshyConfig()), installations, packs)
    }

    @Test
    fun `le choix deja enregistre se lit depuis la ligne des preferences`() = runTest(dispatcher) {
        val f = fixture("""{"v":1,"background":{"kind":"solid","color":"sky"},"accent":null,"animate":true}""")
        f.vm.start("c1")
        advanceUntilIdle()
        assertThat(f.vm.state.value.appearance.background).isEqualTo(ConversationBackground.Solid("sky"))
    }

    @Test
    fun `un choix s applique aussitot puis s ecrit une seule fois`() = runTest(dispatcher) {
        val f = fixture()
        f.vm.start("c1")
        advanceUntilIdle()

        f.vm.setAccent("ocean")
        assertThat(f.vm.state.value.appearance.accent).isEqualTo("ocean")
        advanceUntilIdle()
        f.vm.setAccent("ocean")
        advanceUntilIdle()

        coVerify(exactly = 1) { f.repository.setAppearanceOptimistic("c1", ConversationAppearance.DEFAULT.withAccent("ocean")) }
        assertThat(f.vm.state.value.saveFailed).isFalse()
    }

    @Test
    fun `un refus d ecriture retablit l etat d avant et le dit`() = runTest(dispatcher) {
        val f = fixture(writes = false)
        f.vm.start("c1")
        advanceUntilIdle()

        f.vm.selectSolid("sky")
        advanceUntilIdle()

        assertThat(f.vm.state.value.appearance).isEqualTo(ConversationAppearance.DEFAULT)
        assertThat(f.vm.state.value.saveFailed).isTrue()
    }

    @Test
    fun `une photo choisie se memorise pour repeindre le fond hors de la fenetre du fil`() = runTest(dispatcher) {
        val f = fixture()
        f.vm.start("c1")
        advanceUntilIdle()

        f.vm.selectPhoto("a1", BackgroundPhotoSource("https://cdn/t", "https://cdn/full"))
        advanceUntilIdle()

        assertThat(f.vm.photoSource("a1").fullUrl).isEqualTo("https://cdn/full")
        assertThat((f.vm.state.value.appearance.background as ConversationBackground.Photo).attachmentId).isEqualTo("a1")
    }

    @Test
    fun `sans pièce connue la photo se charge par la route de la piece`() = runTest(dispatcher) {
        val f = fixture()
        f.vm.start("c1")
        advanceUntilIdle()
        val source = f.vm.photoSource("zz")
        assertThat(source.fullUrl).isEqualTo("https://gate.meeshy.me/api/v1/attachments/zz")
        assertThat(source.authenticated).isTrue()
        assertThat(f.vm.photoHeaders(source)).containsExactly("Authorization", "Bearer jwt-1")
    }

    @Test
    fun `l identite du lecteur ne part jamais vers une adresse de piece connue`() = runTest(dispatcher) {
        val f = fixture()
        f.vm.start("c1")
        advanceUntilIdle()

        f.vm.selectPhoto("a1", BackgroundPhotoSource("https://cdn/t", "https://cdn/full"))

        assertThat(f.vm.photoHeaders(f.vm.photoSource("a1"))).isEmpty()
    }

    @Test
    fun `une piece de l index se charge a son adresse resolue sur la passerelle`() = runTest(dispatcher) {
        val index = ConversationMediaHubIndex(null).apply {
            runBlocking { merge(
                "c1",
                me.meeshy.sdk.model.mediahub.ConversationMediaKind.VISUAL,
                listOf(me.meeshy.sdk.model.ApiMessage(id = "m1", conversationId = "c1", attachments = listOf(me.meeshy.sdk.model.ApiMessageAttachment(id = "p1", mimeType = "image/png", fileUrl = "/api/v1/attachments/file/p.png")))),
                complete = true,
                ticket = null,
            ) }
        }
        val source = ConversationBackgroundPhotos(index).resolve("c1", "p1", MeeshyConfig().apiBaseUrl)

        assertThat(source.fullUrl).isEqualTo("https://gate.meeshy.me/api/v1/attachments/file/p.png")
        assertThat(source.authenticated).isFalse()
    }

    @Test
    fun `reinitialiser rend Signature et l accent automatique`() = runTest(dispatcher) {
        val f = fixture("""{"v":1,"background":{"kind":"solid","color":"sky"},"accent":null,"animate":true}""")
        f.vm.start("c1")
        advanceUntilIdle()

        f.vm.reset()
        advanceUntilIdle()

        assertThat(f.vm.state.value.appearance.isDefault).isTrue()
        coVerify { f.repository.setAppearanceOptimistic("c1", ConversationAppearance.DEFAULT) }
    }

    @Test
    fun `une installation de fond faite dans la boutique relit les packs du selecteur`() = runTest(dispatcher) {
        val f = fixture()
        f.vm.start("c1")
        advanceUntilIdle()

        f.installations.emit(PackInstallationUpdatedEvent(domain = "wallpaper", slug = "aurores", installed = true))
        advanceUntilIdle()

        coVerify(exactly = 2) { f.packs.refresh() }
    }

    @Test
    fun `l installation d un autre domaine ne relit pas les fonds`() = runTest(dispatcher) {
        val f = fixture()
        f.vm.start("c1")
        advanceUntilIdle()

        f.installations.emit(PackInstallationUpdatedEvent(domain = "avatar-ring", slug = "halo", installed = true))
        advanceUntilIdle()

        coVerify(exactly = 1) { f.packs.refresh() }
    }

    @Test
    fun `un pack de fonds servi non embarque se propose et se peint des que la relecture a charge son contrat`() = runTest(dispatcher) {
        val catalogText = generateSequence(java.io.File(".").absoluteFile) { it.parentFile }.take(8)
            .flatMap { sequenceOf(java.io.File(it, "sdk-core/src/main/assets/appearance-catalog.json"), java.io.File(it, "apps/android/sdk-core/src/main/assets/appearance-catalog.json")) }
            .first { it.isFile }.readText()
        val root = Json.parseToJsonElement(catalogText) as kotlinx.serialization.json.JsonObject
        val designs = ((root["wallpapers"] as kotlinx.serialization.json.JsonArray).first() as kotlinx.serialization.json.JsonObject)["designs"]!!
        val contractText = """{"domain":"wallpaper","designs":$designs}"""
        val contract = checkNotNull(me.meeshy.sdk.model.appearance.ServedAppearanceContract.parse(contractText))
        val served = AppearanceCatalog.EMPTY.withServed(
            me.meeshy.sdk.model.appearance.ServedAppearanceContracts(
                byAddress = mapOf("0123456789abcdef.json" to contract),
                packs = mapOf(
                    me.meeshy.sdk.model.appearance.AppearancePackDomain.WALLPAPER to
                        listOf(me.meeshy.sdk.model.appearance.ServedAppearancePack("fonds-neige", "0123456789abcdef.json")),
                ),
            ),
        )
        var refreshed = false
        val f = fixture(
            current = { if (refreshed) served else AppearanceCatalog.EMPTY },
            installed = listOf(me.meeshy.sdk.model.appearance.InstalledPackSummary(slug = "fonds-neige", installed = true, owned = true)),
        )
        refreshed = true

        f.vm.start("c1")
        advanceUntilIdle()

        assertThat(f.vm.state.value.packs.map { it.slug }).containsExactly("fonds-neige")
        assertThat(f.vm.state.value.catalog).isSameInstanceAs(served)
    }
}
