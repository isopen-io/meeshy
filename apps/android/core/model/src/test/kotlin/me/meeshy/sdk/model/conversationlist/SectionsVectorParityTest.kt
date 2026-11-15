package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertWithMessage
import java.time.Instant
import java.time.ZoneId
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/** Rejeu de `sections.vectors.json` (TS et iOS le rejouent aussi). */
class SectionsVectorParityTest {

    private fun render(section: ConversationSection): String {
        val ids = section.conversations.joinToString(",") { it.id }
        return when (section) {
            is ConversationSection.Pinned -> "pinned:$ids"
            is ConversationSection.Live -> "live:$ids"
            is ConversationSection.Category -> "category/${section.categoryId}:$ids"
            is ConversationSection.Temporal -> "${temporalName(section.kind)}:$ids"
        }
    }

    private fun temporalName(kind: TemporalSectionKind) = when (kind) {
        TemporalSectionKind.TODAY -> "today"
        TemporalSectionKind.YESTERDAY -> "yesterday"
        TemporalSectionKind.THIS_WEEK -> "thisWeek"
        TemporalSectionKind.OLDER -> "older"
    }

    @Test
    fun `rejoue toutes les entrees de sections vectors`() {
        val cases = SectionVectors.cases("sections.vectors.json")
        assertWithMessage("fixture vide").that(cases).isNotEmpty()
        cases.forEach { case ->
            val input = case["input"]!!.jsonObject
            val actual = ConversationSectionResolver.resolve(
                conversations = SectionVectors.conversations(input),
                categories = input["categories"]!!.jsonArray
                    .map { SectionableCategory(it.jsonObject["id"]!!.jsonPrimitive.content) },
                nowMillis = Instant.parse(input["now"]!!.jsonPrimitive.content).toEpochMilli(),
                zone = ZoneId.of(input["timeZone"]!!.jsonPrimitive.content),
            ).map(::render)
            val expected = case["expected"]!!.jsonArray.map {
                val o = it.jsonObject
                val kind = o["kind"]!!.jsonPrimitive.content
                val ids = o["ids"]!!.jsonArray.joinToString(",") { id -> id.jsonPrimitive.content }
                if (kind == "category") "category/${o["categoryId"]!!.jsonPrimitive.content}:$ids" else "$kind:$ids"
            }
            assertWithMessage(SectionVectors.label(case)).that(actual).isEqualTo(expected)
        }
    }
}
