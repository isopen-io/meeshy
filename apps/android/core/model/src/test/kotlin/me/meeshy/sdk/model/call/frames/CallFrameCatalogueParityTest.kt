package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

class CallFrameCatalogueParityTest {

    private fun sharedDir(): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "packages/shared/design/call-capture-frames")
            if (candidate.isDirectory) return candidate
            dir = dir.parentFile
        }
        error("JSON partagés des cadres introuvables")
    }

    private fun sharedFiles(): List<JsonObject> =
        CallFrameMood.entries.map { Json.parseToJsonElement(File(sharedDir(), "${it.raw}.json").readText()).jsonObject }

    @Test
    fun `le catalogue contient exactement les 146 cadres des JSON partages`() {
        val expected = sharedFiles().sumOf { file ->
            file["motifs"]!!.jsonArray.sumOf { it.jsonObject["variants"]!!.jsonObject.size }
        }

        assertThat(CallFrameCatalogue.all).hasSize(146)
        assertThat(CallFrameCatalogue.all).hasSize(expected)
        assertThat(CallFrameCatalogue.all.map { it.id }.toSet()).hasSize(146)
    }

    @Test
    fun `les douze ambiances sont presentes et ordonnees comme le catalogue web`() {
        assertThat(CallFrameCatalogue.all.map { it.mood }.distinct()).containsExactlyElementsIn(CallFrameMood.entries).inOrder()
        assertThat(CallFrameMood.entries).hasSize(12)
    }

    @Test
    fun `chaque identifiant de cadre suit ambiance point motif point tranche`() {
        CallFrameCatalogue.all.forEach { frame ->
            assertThat(frame.id).isEqualTo("${frame.motif}.${frame.bucket.raw}")
            assertThat(frame.motif).startsWith("${frame.mood.raw}.")
        }
    }

    @Test
    fun `le texte genere est exactement celui des JSON partages`() {
        CallFrameMood.entries.zip(CallFrameCatalogueGenerated.moodFiles).forEach { (mood, generated) ->
            assertThat(generated.first).isEqualTo(mood.raw)
            assertThat(generated.second).isEqualTo(File(sharedDir(), "${mood.raw}.json").readText())
        }
    }

    @Test
    fun `chaque variante des JSON se retrouve dans le catalogue sous son identifiant`() {
        val ids = CallFrameCatalogue.all.map { it.id }.toSet()
        sharedFiles().forEach { file ->
            file["motifs"]!!.jsonArray.forEach { motif ->
                val motifId = motif.jsonObject["id"]!!.jsonPrimitive.content
                motif.jsonObject["variants"]!!.jsonObject.keys.forEach { bucket ->
                    assertThat(ids).contains("$motifId.$bucket")
                }
            }
        }
    }

    @Test
    fun `la variante surcharge la base cle par cle et garde le reste`() {
        val aurore = CallFrameCatalogue.frame("signature.aurore.duo")!!
        val comite = CallFrameCatalogue.frame("signature.aurore.comite")!!

        assertThat(aurore.look.layout.arrangement).isEqualTo(CallFrameArrangement.SPLIT)
        assertThat(aurore.look.title.source).isEqualTo(CallFrameTitleSource.NAMES)
        assertThat(aurore.look.brand?.mark).isEqualTo(CallFrameBrandMark.BOTH)
        assertThat(comite.look.slot.shape).isEqualTo(CallFrameSlotShape.CIRCLE)
        assertThat(comite.look.names.style).isEqualTo(CallFrameNameStyle.BADGE)
        assertThat(comite.look.background).isEqualTo(CallFrameBackground.Accent)
    }

    @Test
    fun `un motif illisible ne fait tomber que ses cadres`() {
        val broken = """{"mood":"jovial","motifs":[{"id":"jovial.x","mood":"jovial","name":"X","base":{},"variants":{"duo":{}}}]}"""
        val good = File(sharedDir(), "elegant.json").readText()

        val frames = CallFrameCatalogue.parse(listOf(broken, good))

        assertThat(frames.map { it.mood }.distinct()).containsExactly(CallFrameMood.ELEGANT)
        assertThat(frames).isNotEmpty()
    }

    @Test
    fun `les cles facultatives inconnues sont ignorees en silence`() {
        val text = """
            {"mood":"signature","motifs":[{"id":"signature.z","mood":"signature","name":"Z","surfaces":["live","hologram"],"cost":"mythic","future":1,
            "base":{"layout":{"arrangement":"grid","margin":0.05,"gap":0.02,"top":0.1,"bottom":0.1},
            "slot":{"shape":"rect","tilt":"none","tone":"color","look":[{"id":"time-travel"},{"id":"vignette","amount":0.4}]},
            "background":{"kind":"accent"},"ornaments":[{"kind":"sparkles","color":"#FFF","density":"low","layer":"back","motion":"teleport"}],
            "names":{"show":"name","style":"caption","font":"bold","color":"#FFF"},
            "title":{"source":"group","font":"bold","color":"#FFF","place":"top","size":"m","form":"nonsense"},
            "elements":[{"source":"alien","place":"top","font":"bold","color":"#FFF","size":"m"}],
            "behaviors":[{"trigger":"onTeleport","action":"burst"}]},
            "variants":{"duo":{}}}]}
        """.trimIndent()

        val frame = CallFrameCatalogue.parse(listOf(text)).single()

        assertThat(frame.surfaces).containsExactly(CallFrameSurface.LIVE)
        assertThat(frame.cost).isNull()
        assertThat(frame.look.slot.look).containsExactly(CallFrameSlotLook(CallFrameSlotLookKind.VIGNETTE, 0.4, null))
        assertThat(frame.look.ornaments.single().motion).isEqualTo(CallFrameOrnamentMotion.STILL)
        assertThat(frame.look.title.form).isNull()
        assertThat(frame.look.elements).isEmpty()
        assertThat(frame.look.behaviors).isEmpty()
    }
}
