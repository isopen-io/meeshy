package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class StoryTextObjectWireTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    @Test
    fun `un ancien texte se decode sans poids ni cadre et se republie inchange`() {
        val texte = json.decodeFromString(StoryTextObject.serializer(), """{"id":"t","text":"Salut"}""")
        assertThat(texte.fontWeight).isNull()
        assertThat(texte.frameShape).isNull()
        assertThat(texte.framePaddingScale).isNull()
        assertThat(texte.frameBorderWidth).isNull()
        assertThat(texte.frameBorderColor).isNull()
        val wire = json.encodeToString(StoryTextObject.serializer(), texte)
        assertThat(wire).doesNotContain("fontWeight")
        assertThat(wire).doesNotContain("frame")
    }

    @Test
    fun `le poids et le cadre ecrits par iOS font l aller retour`() {
        val raw = """{"id":"t","text":"Hi","fontWeight":"semibold","frameShape":"cloud","framePaddingScale":1.5,"frameBorderWidth":6.0,"frameBorderColor":"FF0000","borderColor":"000000","borderWidth":3.0}"""
        val texte = json.decodeFromString(StoryTextObject.serializer(), raw)
        assertThat(texte.fontWeight).isEqualTo("semibold")
        assertThat(texte.frameShape).isEqualTo("cloud")
        assertThat(texte.framePaddingScale).isEqualTo(1.5)
        assertThat(texte.frameBorderWidth).isEqualTo(6.0)
        assertThat(texte.frameBorderColor).isEqualTo("FF0000")
        assertThat(texte.borderWidth).isEqualTo(3.0)
        assertThat(json.decodeFromString(StoryTextObject.serializer(), json.encodeToString(StoryTextObject.serializer(), texte)))
            .isEqualTo(texte)
    }

    @Test
    fun `une forme de cadre plus recente voyage intacte`() {
        val texte = json.decodeFromString(StoryTextObject.serializer(), """{"id":"t","frameShape":"hexagon"}""")
        assertThat(json.encodeToString(StoryTextObject.serializer(), texte)).contains("\"frameShape\":\"hexagon\"")
    }
}
