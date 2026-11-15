package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

class LongMessageExcerptVectorParityTest {

    private val vectors = Json.parseToJsonElement(
        FocalFixtures.file("long-message/excerpt.vectors.json").readText(),
    ).jsonArray

    @Test
    fun `les vecteurs sont chargés, jamais une boucle vide`() {
        assertThat(vectors.size).isAtLeast(10)
    }

    @Test
    fun `rejoue chaque vecteur partagé à l'identique`() {
        vectors.forEach { element ->
            val vector = element.jsonObject
            val label = vector["_label"]!!.jsonPrimitive.content
            val text = vector["input"]!!.jsonObject["text"]!!.jsonPrimitive.content
            val expected = vector["expected"]!!.jsonObject
            val result = LongMessageExcerpt.of(text)
            assertWithMessage("cas « $label » : troncature")
                .that(result.truncated).isEqualTo(expected["truncated"]!!.jsonPrimitive.boolean)
            assertWithMessage("cas « $label » : extrait")
                .that(result.excerpt).isEqualTo(expected["excerpt"]!!.jsonPrimitive.content)
        }
    }

    @Test
    fun `isLong suit le seuil de 512 graphèmes`() {
        assertThat(LongMessageExcerpt.isLong("a".repeat(512))).isFalse()
        assertThat(LongMessageExcerpt.isLong("a".repeat(513))).isTrue()
    }
}
