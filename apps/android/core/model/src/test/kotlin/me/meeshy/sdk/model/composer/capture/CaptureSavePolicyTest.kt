package me.meeshy.sdk.model.composer.capture

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.testutil.SharedFixtures
import me.meeshy.sdk.testutil.stringOrNull
import org.junit.Test

class CaptureSavePolicyTest {
    private val fixture = "capture-save/capture-save.vectors.json"

    @Test
    fun `destination replays the shared vectors`() {
        val cases = SharedFixtures.root(fixture)["destinations"]!!.jsonArray
        assertThat(cases).isNotEmpty()
        cases.map { it.jsonObject }.forEach { c ->
            val zone = CaptureZone.valueOf(c.stringOrNull("zone")!!.uppercase())
            val saves = c["savesOriginal"]!!.jsonPrimitive.boolean
            val expected = c["expected"]!!.jsonObject
            val got = CaptureSaveLaw.destination(zone, saves)
            assertThat(got.gallery).isEqualTo(expected["gallery"]!!.jsonPrimitive.boolean)
            assertThat(got.keptInApp).isEqualTo(expected["keptInApp"]!!.jsonPrimitive.boolean)
        }
    }

    @Test
    fun `save button visibility replays the shared sequences`() {
        val sequences = SharedFixtures.root(fixture)["sequences"]!!.jsonArray.map { it.jsonObject }
        assertThat(sequences).isNotEmpty()
        sequences.forEach { s -> assertSequence(s) }
    }

    private fun assertSequence(s: JsonObject) {
        val name = s.stringOrNull("name")
        val o = s["origin"]!!.jsonObject
        val format = o.stringOrNull("format")!!
        val origin = if (o.stringOrNull("zone") == "frame") {
            CaptureOrigin.Frame(o.stringOrNull("frameId")!!, format)
        } else {
            CaptureOrigin.Outside(o.stringOrNull("frameId"), format)
        }
        var state = CaptureSaveLaw.beginTake(origin)
        val seen = mutableListOf(CaptureSaveLaw.saveButtonVisible(state))
        s["steps"]!!.jsonArray.map { it.jsonObject }.forEach { step ->
            state = when (step.stringOrNull("op")) {
                "save" -> CaptureSaveLaw.applySaved(state)
                "frame" -> CaptureSaveLaw.applyFrameChange(state, step["frameId"].takeUnless { it is JsonNull }?.jsonPrimitive?.content)
                "format" -> CaptureSaveLaw.applyFormatChange(state, step.stringOrNull("format")!!)
                "saveFailed" -> CaptureSaveLaw.applySaveFailed(state, SavedVersion(step.stringOrNull("frameId"), step.stringOrNull("format")!!))
                else -> error("op inconnue dans $name")
            }
            seen += CaptureSaveLaw.saveButtonVisible(state)
        }
        val expected = (s["visible"] as JsonArray).map { it.jsonPrimitive.boolean }
        assertWithMessage(name).that(seen).isEqualTo(expected)
    }

    @Test
    fun `destination - outside keeps the original in the app unless the setting says otherwise`() {
        assertThat(CaptureSaveLaw.destination(CaptureZone.OUTSIDE).gallery).isFalse()
        assertThat(CaptureSaveLaw.destination(CaptureZone.OUTSIDE, savesOriginal = true).gallery).isTrue()
        assertThat(CaptureSaveLaw.destination(CaptureZone.FRAME).gallery).isTrue()
    }

    @Test
    fun `standard policy saves no original and renders on demand`() {
        assertThat(CaptureSavePolicy.Standard.savesOriginal).isFalse()
        assertThat(CaptureSavePolicy.Standard.renderedMode).isEqualTo(CaptureRenderedSaveMode.MANUAL)
    }

    @Test
    fun `finish saves the render only in automatic mode and never twice`() {
        val auto = CaptureSavePolicy(renderedMode = CaptureRenderedSaveMode.AUTOMATIC)
        assertThat(auto.savesRenderOnFinish(alreadySaved = false)).isTrue()
        assertThat(auto.savesRenderOnFinish(alreadySaved = true)).isFalse()
        assertThat(CaptureSavePolicy.Standard.savesRenderOnFinish(alreadySaved = false)).isFalse()
    }

    @Test
    fun `corrupt storage degrades to the standard policy`() {
        assertThat(CaptureSavePolicy.fromStorage(null, "garbage")).isEqualTo(CaptureSavePolicy.Standard)
        assertThat(CaptureSavePolicy.fromStorage(true, "automatic"))
            .isEqualTo(CaptureSavePolicy(true, CaptureRenderedSaveMode.AUTOMATIC))
    }
}
