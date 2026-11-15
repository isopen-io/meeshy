package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/** Rejeu de `sort.vectors.json`. */
class SortVectorParityTest {

    @Test
    fun `rejoue toutes les entrees de sort vectors`() {
        val cases = SectionVectors.cases("sort.vectors.json")
        assertThat(cases).isNotEmpty()
        cases.forEach { case ->
            val actual = ConversationSortOrder
                .sort(SectionVectors.conversations(case["input"]!!.jsonObject))
                .map { it.id }
            val expected = case["expected"]!!.jsonArray.map { it.jsonPrimitive.content }
            assertWithMessage(SectionVectors.label(case)).that(actual).isEqualTo(expected)
        }
    }
}
