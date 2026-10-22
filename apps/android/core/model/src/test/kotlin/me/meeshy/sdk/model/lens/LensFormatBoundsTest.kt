package me.meeshy.sdk.model.lens

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LensFormatBoundsTest {

    private companion object {
        const val UNKNOWN_LAYER = ",{\"kind\":\"hologram\",\"id\":\"h\"}"
    }

    private fun lens(layers: Int, triggers: Int = 0, extraLayers: String = ""): String {
        val layerList = (1..layers).joinToString(",") { """{"kind":"frame","id":"l$it","motif":"a.b"}""" } + extraLayers
        val triggerList = (1..triggers).joinToString(",") { """{"on":"onTap","action":"show","target":"l1"}""" }
        return """{"schema":1,"id":"x","name":"X","credits":{"author":"A","createdAt":"2026-10-01"},
            "surfaces":["capture"],"cost":"light",
            "window":{"startsAt":"2026-12-01T00:00:00Z","endsAt":"2026-12-02T00:00:00Z"},
            "layers":[$layerList],"triggers":[$triggerList]}"""
    }

    @Test
    fun `douze couches passent, treize sont refusees`() {
        assertThat(LensFormat.parse(lens(12))).isInstanceOf(LensParseOutcome.Ok::class.java)
        assertThat(LensFormat.parse(lens(13))).isEqualTo(LensParseOutcome.Invalid)
    }

    @Test
    fun `plus de 32 couches declarees est un abus`() {
        assertThat(LensFormat.parse(lens(33))).isEqualTo(LensParseOutcome.Invalid)
    }

    @Test
    fun `huit declencheurs passent, neuf sont refuses`() {
        assertThat(LensFormat.parse(lens(1, 8))).isInstanceOf(LensParseOutcome.Ok::class.java)
        assertThat(LensFormat.parse(lens(1, 9))).isEqualTo(LensParseOutcome.Invalid)
    }

    @Test
    fun `une couche inconnue est ignoree et comptee`() {
        val outcome = LensFormat.parse(lens(2, extraLayers = UNKNOWN_LAYER)) as LensParseOutcome.Ok
        assertThat(outcome.document.layers).hasSize(2)
        assertThat(outcome.ignoredLayers).isEqualTo(1)
    }

    @Test
    fun `un declencheur vers une couche absente est ignore et compte`() {
        val json = lens(1).replace("\"triggers\":[]", "\"triggers\":[{\"on\":\"onTap\",\"action\":\"show\",\"target\":\"zz\"}]")
        val outcome = LensFormat.parse(json) as LensParseOutcome.Ok
        assertThat(outcome.ignoredTriggers).isEqualTo(1)
        assertThat(outcome.document.triggers).isEmpty()
    }

    @Test
    fun `seize niveaux d'imbrication passent, dix-sept sont refuses`() {
        fun nested(arrays: Int) = "[".repeat(arrays) + "]".repeat(arrays)
        assertThat(LensFormat.parse("""{"schema":2,"x":${nested(15)}}""")).isEqualTo(LensParseOutcome.UpdateRequired(2))
        assertThat(LensFormat.parse("""{"schema":2,"x":${nested(16)}}""")).isEqualTo(LensParseOutcome.Invalid)
    }
}
