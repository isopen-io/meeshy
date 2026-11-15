package me.meeshy.sdk.pack

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.game.FrameUsage
import me.meeshy.sdk.model.pack.FramePack
import me.meeshy.sdk.model.pack.FrameShelfContent
import me.meeshy.sdk.model.pack.PackAssetRef
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class FramePackShelfLoaderTest {

    @get:Rule val folder = TemporaryFolder()

    private class FakeAssets(val files: MutableMap<String, ByteArray> = HashMap()) : PackAssetReading {
        val reads = mutableListOf<String>()
        override suspend fun data(ref: PackAssetRef): ByteArray {
            reads += ref.src
            val bytes = files[ref.src] ?: throw java.io.IOException("absent ${ref.src}")
            if (!ContentAddressedStore.matches(bytes, ref)) throw DigestMismatchException(ref.src)
            return bytes
        }
    }

    private class Scenario(val loader: FramePackShelfLoader, val assets: FakeAssets, val index: PackFileIndex, val detail: FramePack)

    private fun ref(content: String, ext: String) = packRef(content, ext)

    private fun asset(assets: FakeAssets, content: String, ext: String): PackAssetRef =
        ref(content, ext).also { assets.files[it.src] = content.toByteArray() }

    private fun refJson(r: PackAssetRef) = """{"src":"${r.src}","bytes":${r.bytes},"sha256":"${r.sha256}"}"""

    private fun scenario(
        schema: Int? = 1,
        contractText: String? = null,
        language: String = "es",
        strings: Map<String, String> = mapOf(
            "fr" to """{"frame.a":"Cadre A fr"}""",
            "es" to """{"frame.a":"Marco A"}""",
        ),
        fail: Boolean = false,
    ): Scenario {
        val assets = FakeAssets()
        val thumb = asset(assets, "thumb-a", "webp")
        val contract = asset(
            assets,
            contractText ?: """{"schema":1,"frames":[{"id":"a","usage":{"kind":"prestige"},"thumb":${refJson(thumb)},"i18n":{"name":"frame.a"}}]}""",
            "json",
        )
        val stringRefs = strings.mapValues { asset(assets, it.value, "json") }
        val detail = FramePack(slug = "afrique", name = "Afrique", version = 1, contractSchema = schema, contract = contract, strings = stringRefs)
        val index = PackFileIndex(File(folder.root, "index.json"), Dispatchers.Unconfined)
        val loader = FramePackShelfLoader(
            details = { if (fail) throw java.io.IOException("réseau") else detail },
            contracts = FramePackContractStore(assets, index),
            language = { language },
            usageCopy = { usage -> if (usage == FrameUsage.Prestige) "Prestige uniquement" else "?" },
        )
        return Scenario(loader, assets, index, detail)
    }

    private fun content(s: Scenario) = s.loader.contents.value["afrique"]

    @Test
    fun `un pack installe montre ses cadres avec le nom de la langue du lecteur et le libelle d'usage`() = runBlocking<Unit> {
        val s = scenario()

        s.loader.load(s.detail)

        val tiles = (content(s) as FrameShelfContent.Frames).tiles
        assertThat(tiles.single().name).isEqualTo("Marco A")
        assertThat(tiles.single().usageText).isEqualTo("Prestige uniquement")
    }

    @Test
    fun `une langue sans chaines retombe sur le francais`() = runBlocking<Unit> {
        val s = scenario(language = "de")

        s.loader.load(s.detail)

        assertThat((content(s) as FrameShelfContent.Frames).tiles.single().name).isEqualTo("Cadre A fr")
    }

    @Test
    fun `sans chaines les noms se lisent par identifiant`() = runBlocking<Unit> {
        val s = scenario(strings = emptyMap())

        s.loader.load(s.detail)

        assertThat((content(s) as FrameShelfContent.Frames).tiles.single().name).isEqualTo("a")
    }

    @Test
    fun `des chaines illisibles ne font pas tomber l'onglet`() = runBlocking<Unit> {
        val s = scenario()
        val stringsRef = s.detail.stringsRef("es")!!
        s.assets.files.remove(stringsRef.src)

        s.loader.load(s.detail)

        assertThat((content(s) as FrameShelfContent.Frames).tiles.single().name).isEqualTo("a")
    }

    @Test
    fun `un contrat dont l'empreinte ne correspond pas n'est pas lu`() = runBlocking<Unit> {
        val s = scenario()
        s.assets.files[s.detail.contract!!.src] = "altere".toByteArray()

        s.loader.load(s.detail)

        assertThat(content(s)).isEqualTo(FrameShelfContent.Unavailable)
    }

    @Test
    fun `un contrat d'une version inconnue demande la mise a jour et ne telecharge rien`() = runBlocking<Unit> {
        val s = scenario(schema = 2)

        s.loader.load(s.detail)

        assertThat(content(s)).isEqualTo(FrameShelfContent.NeedsUpdate)
        assertThat(s.assets.reads).isEmpty()
    }

    @Test
    fun `un contrat illisible demande la mise a jour`() = runBlocking<Unit> {
        val s = scenario(contractText = """{"schema":9,"frames":[]}""")

        s.loader.load(s.detail)

        assertThat(content(s)).isEqualTo(FrameShelfContent.NeedsUpdate)
    }

    @Test
    fun `un pack sans contrat est indisponible`() = runBlocking<Unit> {
        val s = scenario()
        val bare = s.detail.copy(contract = null)
        val loader = FramePackShelfLoader({ bare }, FramePackContractStore(s.assets, s.index), { "fr" }, { "u" })

        loader.load(bare)

        assertThat(loader.contents.value["afrique"]).isEqualTo(FrameShelfContent.Unavailable)
    }

    @Test
    fun `une panne du detail rend l'onglet indisponible`() = runBlocking<Unit> {
        val s = scenario(fail = true)

        s.loader.load(s.detail)

        assertThat(content(s)).isEqualTo(FrameShelfContent.Unavailable)
    }

    @Test
    fun `ce qui est deja affiche le reste quand la relecture d'une nouvelle version echoue`() = runBlocking<Unit> {
        val s = scenario()
        var down = false
        val loader = FramePackShelfLoader(
            details = { if (down) throw java.io.IOException("x") else s.detail },
            contracts = FramePackContractStore(s.assets, s.index),
            language = { "es" },
            usageCopy = { "u" },
        )
        loader.load(s.detail)
        val shown = loader.contents.value["afrique"]
        down = true

        loader.load(s.detail.copy(version = 2))

        assertThat(shown).isInstanceOf(FrameShelfContent.Frames::class.java)
        assertThat(loader.contents.value["afrique"]).isEqualTo(shown)
    }

    @Test
    fun `un pack se charge une fois par version`() = runBlocking<Unit> {
        val s = scenario()

        s.loader.load(s.detail)
        val reads = s.assets.reads.size
        s.loader.load(s.detail)

        assertThat(s.assets.reads).hasSize(reads)
    }

    @Test
    fun `l'onglet consigne dans l'index les fichiers qu'il a ranges`() = runBlocking<Unit> {
        val s = scenario()

        s.loader.load(s.detail)

        val manifest = s.index.all().single { it.slug == "afrique" }
        assertThat(manifest.files).contains(s.detail.contract!!.src)
        assertThat(manifest.frames.keys).containsExactly("a")
    }
}
