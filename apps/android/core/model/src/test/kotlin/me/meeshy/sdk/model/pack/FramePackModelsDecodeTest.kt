package me.meeshy.sdk.model.pack

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.game.FrameUsage
import me.meeshy.sdk.model.game.FreeFrameSurface
import org.junit.Test

class FramePackModelsDecodeTest {

    private val sha = "b19ebab0f4cfeed8715e0264fab552c11fcce89f71ba78b2f01feb0b78ab634e"
    private val ref = """{"src":"b19ebab0f4cfeed8.webp","bytes":10,"sha256":"$sha"}"""

    private fun pack(json: String) = FramePack.parse(Json.parseToJsonElement(json))

    @Test
    fun `un pack complet se lit avec ses noms, ses chaines et ses collections`() {
        val pack = pack(
            """{"slug":"afrique","name":"Afrique","description":"d","author":"Meeshy","builtin":false,"status":"approved","itemCount":3,
            "coverUrl":"/api/v1/pack-assets/b19ebab0f4cfeed8.webp","installed":true,"installCount":4,"origin":"official","version":2,
            "names":{"fr":{"name":"Afrique","description":"Cadres"},"en":{"name":"Africa"}},"preview":$ref,
            "usage":{"kind":"free","surfaces":["banner"]},"contractSchema":1,"contract":$ref,"strings":{"fr":$ref},
            "collections":[{"slug":"lions","usage":{"kind":"prestige"}}]}""",
        )!!
        assertThat(pack.usage).isEqualTo(FrameUsage.Free(listOf(FreeFrameSurface.Banner)))
        assertThat(pack.coverFile?.name).isEqualTo("b19ebab0f4cfeed8.webp")
        assertThat(pack.localizedName("en-US")).isEqualTo("Africa")
        assertThat(pack.localizedName("de")).isEqualTo("Afrique")
        assertThat(pack.stringsRef("pt-BR")).isEqualTo(pack.strings["fr"])
        assertThat(pack.collections.single().usage).isEqualTo(FrameUsage.Prestige)
        assertThat(pack.withInstall(false, 3).installed).isFalse()
    }

    @Test
    fun `un champ, une surface ou une origine d'une version future ne fait pas tomber le pack`() {
        val pack = pack(
            """{"slug":"futur","name":"Futur","status":"archived","origin":"galactic","hologram":{"x":1},
            "usage":{"kind":"free","surfaces":["call","hologram"]},"strings":{"fr":{"src":"nope.png","bytes":1,"sha256":"x"}},
            "collections":[{"slug":"a","usage":{"kind":"warp"}},{"nope":1}]}""",
        )!!
        assertThat(pack.usage).isNull()
        assertThat(pack.status).isEqualTo(PackStatus.UNKNOWN)
        assertThat(pack.origin).isEqualTo(PackOrigin.UNKNOWN)
        assertThat(pack.strings).isEmpty()
        assertThat(pack.collections.map { it.slug }).containsExactly("a")
        assertThat(pack.collections.single().usage).isNull()
    }

    @Test
    fun `un pack sans slug ne se lit pas et les champs mal types retombent sur leur defaut`() {
        assertThat(pack("""{"name":"x"}""")).isNull()
        val pack = pack("""{"slug":"s","itemCount":"many","installed":"yes","names":[1]}""")!!
        assertThat(pack.name).isEqualTo("s")
        assertThat(pack.itemCount).isEqualTo(0)
        assertThat(pack.installed).isFalse()
        assertThat(pack.names).isEmpty()
    }

    private fun frame(id: String, usage: String, extra: String = "") =
        """{"id":"$id","usage":$usage,"thumb":$ref,"i18n":{"name":"frame.$id"}$extra}"""

    @Test
    fun `un contrat garde les cadres lisibles et compte ceux qui tombent`() {
        val rank = """{"kind":"rank","rank":"ambassadeur","division":3}"""
        val text = """{"schema":1,"frames":[
            ${frame("afrique.amb3", rank, ""","collection":"afrique","appliesTo":{"family":"rank","rank":"ambassadeur","division":3},"motifs":[],"hidden":false,"option":null""")},
            ${frame("afrique.amb3", rank)},
            ${frame("libre", """{"kind":"free","surfaces":["call"]}""")},
            ${frame("warp", """{"kind":"warp"}""")},
            ${frame("autre.prestige", """{"kind":"prestige"}""")}
        ]}"""
        val parsed = GloryFramePackContract.parse(text)!!
        assertThat(parsed.contract.frames.map { it.id }).containsExactly("afrique.amb3", "autre.prestige").inOrder()
        assertThat(parsed.rejected).isEqualTo(3)
        assertThat(parsed.contract.frames[0].placement?.collection).isEqualTo("afrique")
        assertThat(parsed.contract.frames[1].placement).isNull()
    }

    @Test
    fun `un contrat d'une version inconnue ou illisible ne se lit pas`() {
        assertThat(GloryFramePackContract.parse("""{"schema":2,"frames":[]}""")).isNull()
        assertThat(GloryFramePackContract.parse("pas du json")).isNull()
        assertThat(GloryFramePackContract.parse("""{"schema":1}""")).isNull()
    }

    @Test
    fun `les chaines d'un pack tombent paire par paire`() {
        val strings = PackStringKey.parseStrings("""{"frame.a":"Bonjour","Bad Key":"x","frame.b":"  ","frame.c":3}""")
        assertThat(strings).containsExactly("frame.a", "Bonjour")
        assertThat(PackStringKey.parseStrings("[]")).isEmpty()
    }
}
