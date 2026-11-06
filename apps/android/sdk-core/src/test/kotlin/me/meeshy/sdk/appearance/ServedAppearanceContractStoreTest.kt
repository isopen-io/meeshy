package me.meeshy.sdk.appearance

import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.appearance.InstalledPackSummary
import me.meeshy.sdk.model.appearance.ProfileDecorResolver
import me.meeshy.sdk.model.appearance.ServedAppearanceContracts
import me.meeshy.sdk.model.appearance.WallpaperDesign
import me.meeshy.sdk.model.pack.PackAssetRef
import org.junit.After
import org.junit.Test

/**
 * Le dépôt des contrats d'apparence servis (#16265) : il vérifie l'empreinte, sert le cache d'abord (mémoire, puis disque
 * adressé par contenu, puis réseau) et garde le dernier contrat valide de chaque pack installé pour le hors-ligne.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ServedAppearanceContractStoreTest {

    private val directory: File = Files.createTempDirectory("served-contracts").toFile()

    @After
    fun tearDown() {
        directory.deleteRecursively()
    }

    private val catalogText: String by lazy {
        val relative = "src/main/assets/appearance-catalog.json"
        generateSequence(File(".").absoluteFile) { it.parentFile }.take(8)
            .flatMap { sequenceOf(File(it, relative), File(it, "sdk-core/$relative"), File(it, "apps/android/sdk-core/$relative")) }
            .first { it.isFile }
            .readText()
    }

    private val catalog: AppearanceCatalog by lazy { AppearanceCatalog.decode(catalogText) }

    private fun section(name: String, field: String, index: Int = 0): JsonArray {
        val root = Json.parseToJsonElement(catalogText) as JsonObject
        return ((root[name] as JsonArray)[index] as JsonObject)[field] as JsonArray
    }

    private val ringText: String by lazy {
        buildJsonObject {
            put("domain", "avatar-ring")
            put("rings", section("rings", "rings"))
        }.toString()
    }

    private val wallpaperText: String by lazy {
        buildJsonObject {
            put("domain", "wallpaper")
            put("designs", section("wallpapers", "designs"))
        }.toString()
    }

    private val otherWallpaperText: String by lazy {
        buildJsonObject {
            put("domain", "wallpaper")
            put("designs", section("wallpapers", "designs", index = 1))
        }.toString()
    }

    private fun sha(text: String): String =
        MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun src(text: String) = sha(text).take(16) + ".json"

    private fun ref(text: String) = checkNotNull(PackAssetRef.of(src(text), text.length.toLong(), sha(text)))

    private class FakeFetcher(var files: Map<String, ByteArray>) : ServedContractFetching {
        val calls = AtomicInteger()
        var gate: CompletableDeferred<Unit>? = null

        override suspend fun fetch(src: String): ByteArray {
            calls.incrementAndGet()
            gate?.await()
            return files[src] ?: throw IOException("absent : $src")
        }
    }

    private class Clock(var now: Long = 0L) : ServedContractClock {
        override fun nowMillis(): Long = now
    }

    private class Sink {
        val received = mutableListOf<ServedAppearanceContracts>()
        fun accept(contracts: ServedAppearanceContracts) {
            received += contracts
        }
    }

    private fun kotlinx.coroutines.test.TestScope.store(
        fetcher: FakeFetcher,
        sink: Sink = Sink(),
        clock: Clock = Clock(),
    ) = ServedAppearanceContractStore(directory, fetcher, UnconfinedTestDispatcher(testScheduler), sink::accept, clock)

    private fun summary(slug: String, text: String, origin: String = "official", installed: Boolean = true) =
        InstalledPackSummary(slug = slug, installed = installed, origin = origin, contract = ref(text), name = "Neige")

    @Test
    fun `un contrat se telecharge une fois, se verifie, se garde sur le disque et se relit sans reseau`() = runTest {
        val fetcher = FakeFetcher(mapOf(src(ringText) to ringText.toByteArray()))

        assertThat(store(fetcher).contract(src(ringText), sha(ringText))).isNotNull()
        assertThat(File(directory, src(ringText)).isFile).isTrue()

        val offline = FakeFetcher(emptyMap())
        assertThat(store(offline).contract(src(ringText), sha256 = null)).isNotNull()
        assertThat(offline.calls.get()).isEqualTo(0)
    }

    @Test
    fun `un contenu altere en route ne se lit pas et ne s ecrit pas`() = runTest {
        val sink = Sink()
        val fetcher = FakeFetcher(mapOf(src(ringText) to (ringText + " ").toByteArray()))

        assertThat(store(fetcher, sink).contract(src(ringText), sha256 = null)).isNull()
        assertThat(File(directory, src(ringText)).exists()).isFalse()
        assertThat(sink.received).isEmpty()
    }

    @Test
    fun `une empreinte complete differente de celle annoncee est refusee`() = runTest {
        val fetcher = FakeFetcher(mapOf(src(ringText) to ringText.toByteArray()))

        assertThat(store(fetcher).contract(src(ringText), sha256 = sha(wallpaperText))).isNull()
    }

    @Test
    fun `un fichier altere sur le disque se retelecharge`() = runTest {
        directory.mkdirs()
        File(directory, src(ringText)).writeText("altéré")
        val fetcher = FakeFetcher(mapOf(src(ringText) to ringText.toByteArray()))

        assertThat(store(fetcher).contract(src(ringText), sha256 = null)).isNotNull()
        assertThat(fetcher.calls.get()).isEqualTo(1)
        assertThat(File(directory, src(ringText)).readText()).isEqualTo(ringText)
    }

    @Test
    fun `des demandes simultanees du meme contrat ne font qu une requete`() = runTest {
        val fetcher = FakeFetcher(mapOf(src(ringText) to ringText.toByteArray())).apply { gate = CompletableDeferred() }
        val store = store(fetcher)

        val reads = List(3) { async { store.contract(src(ringText), sha256 = null) } }
        fetcher.gate?.complete(Unit)

        assertThat(reads.awaitAll().all { it != null }).isTrue()
        assertThat(fetcher.calls.get()).isEqualTo(1)
    }

    @Test
    fun `une adresse qui ne s adresse pas par son contenu ne part jamais sur le reseau`() = runTest {
        val fetcher = FakeFetcher(emptyMap())

        assertThat(store(fetcher).contract("../../secret.json", sha256 = null)).isNull()
        assertThat(fetcher.calls.get()).isEqualTo(0)
    }

    @Test
    fun `un contrat introuvable ne se redemande qu apres une minute`() = runTest {
        val clock = Clock()
        val fetcher = FakeFetcher(emptyMap())
        val store = store(fetcher, clock = clock)

        store.contract(src(ringText), sha256 = null)
        store.contract(src(ringText), sha256 = null)
        assertThat(fetcher.calls.get()).isEqualTo(1)

        clock.now += ServedAppearanceContractStore.RETRY_AFTER_MS
        fetcher.files = mapOf(src(ringText) to ringText.toByteArray())
        assertThat(store.contract(src(ringText), sha256 = null)).isNotNull()
        assertThat(fetcher.calls.get()).isEqualTo(2)
    }

    @Test
    fun `les packs servis installes se chargent, les packs embarques non`() = runTest {
        val sink = Sink()
        val fetcher = FakeFetcher(mapOf(src(wallpaperText) to wallpaperText.toByteArray()))
        val store = store(fetcher, sink)

        store.sync(
            AppearancePackDomain.WALLPAPER,
            listOf(summary("fonds-neige", wallpaperText), summary("fonds-essentiels", otherWallpaperText, origin = "builtin")),
        )

        assertThat(store.contracts.value.packs[AppearancePackDomain.WALLPAPER]?.map { it.slug }).containsExactly("fonds-neige")
        assertThat(fetcher.calls.get()).isEqualTo(1)
        val merged = catalog.withServed(sink.received.last())
        val key = catalog.wallpaperPacks.first().designs.first().key
        assertThat(merged.wallpaper("fonds-neige", key)).isInstanceOf(WallpaperDesign.Designed::class.java)
        assertThat(merged.packName("fonds-neige", "fr")).isEqualTo("Neige")
    }

    @Test
    fun `une nouvelle version introuvable laisse le dernier contrat valide en place`() = runTest {
        val fetcher = FakeFetcher(mapOf(src(wallpaperText) to wallpaperText.toByteArray()))
        val store = store(fetcher)
        store.sync(AppearancePackDomain.WALLPAPER, listOf(summary("fonds-neige", wallpaperText)))

        store.sync(AppearancePackDomain.WALLPAPER, listOf(summary("fonds-neige", otherWallpaperText)))

        assertThat(store.contracts.value.packs[AppearancePackDomain.WALLPAPER]?.single()?.src).isEqualTo(src(wallpaperText))
    }

    @Test
    fun `un pack retire ne se peint plus, une panne ne conclut rien`() = runTest {
        val fetcher = FakeFetcher(mapOf(src(wallpaperText) to wallpaperText.toByteArray()))
        val store = store(fetcher)
        store.sync(AppearancePackDomain.WALLPAPER, listOf(summary("fonds-neige", wallpaperText)))

        store.sync(AppearancePackDomain.WALLPAPER, null)
        assertThat(store.contracts.value.packs[AppearancePackDomain.WALLPAPER]).hasSize(1)

        store.sync(AppearancePackDomain.WALLPAPER, listOf(summary("fonds-neige", wallpaperText, installed = false)))
        assertThat(store.contracts.value.packs[AppearancePackDomain.WALLPAPER]).isEmpty()
    }

    @Test
    fun `au redemarrage les packs installes se repeignent depuis le disque, sans reseau`() = runTest {
        val online = FakeFetcher(mapOf(src(wallpaperText) to wallpaperText.toByteArray()))
        store(online).sync(AppearancePackDomain.WALLPAPER, listOf(summary("fonds-neige", wallpaperText)))

        val sink = Sink()
        val offline = FakeFetcher(emptyMap())
        val restored = store(offline, sink)
        restored.restore()

        assertThat(restored.contracts.value.packs[AppearancePackDomain.WALLPAPER]?.map { it.slug }).containsExactly("fonds-neige")
        assertThat(offline.calls.get()).isEqualTo(0)
        assertThat(catalog.withServed(sink.received.last()).wallpaperPacks.map { it.slug }).contains("fonds-neige")
    }

    @Test
    fun `un changement de compte oublie les packs installes, garde les contrats`() = runTest {
        val fetcher = FakeFetcher(mapOf(src(wallpaperText) to wallpaperText.toByteArray()))
        val store = store(fetcher)
        store.sync(AppearancePackDomain.WALLPAPER, listOf(summary("fonds-neige", wallpaperText)))

        store.clear()

        assertThat(store.contracts.value.packs).isEmpty()
        assertThat(store.contracts.value.byAddress).containsKey(src(wallpaperText))
        val restored = store(FakeFetcher(emptyMap()))
        restored.restore()
        assertThat(restored.contracts.value.packs).isEmpty()
    }

    @Test
    fun `le decor d autrui demande son contrat, et le catalogue servi le peint`() = runTest {
        val fetcher = FakeFetcher(mapOf(src(ringText) to ringText.toByteArray()))
        val loader = AppearanceCatalogLoader(
            asset = AppearanceCatalogAsset { ByteArrayInputStream(catalogText.toByteArray()) },
            ioDispatcher = UnconfinedTestDispatcher(testScheduler),
            errors = AppearanceCatalogErrorLog { _, _ -> },
        )
        val store = ServedAppearanceContractStore(directory, fetcher, UnconfinedTestDispatcher(testScheduler), loader::serve)
        val ringKey = catalog.ringPacks.first().rings.first().key
        val item = ServedProfileDecorItem("contours-d-autrui", ringKey, PackOrigin.COMMUNITY, contract = src(ringText))
        loader.catalog()

        store.request(src(ringText))
        testScheduler.advanceUntilIdle()

        assertThat(ProfileDecorResolver.ring(item, checkNotNull(loader.current))?.key).isEqualTo(ringKey)
    }
}
