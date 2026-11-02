package me.meeshy.sdk.model.game.engagement

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.testutil.SharedFixtures
import me.meeshy.sdk.testutil.stringOrNull
import org.junit.Test

/**
 * Rejeu Android de `packages/shared/fixtures/reading-modes/badge-guide.vectors.json` — le contrat du guide d'une
 * médaille que `badge-guide.ts` (qui fait foi), `BadgeGuideResolver` (iOS) et [BadgeGuideResolver] tiennent ensemble.
 * Le compteur fractionnaire du fil se lit tronqué, comme sur iOS.
 */
class BadgeGuideVectorParityTest {

    private val cases: List<JsonObject> =
        Json.parseToJsonElement(SharedFixtures.file("reading-modes/badge-guide.vectors.json").readText()).jsonArray.map { it.jsonObject }

    private fun materialWire(key: BadgeMaterialKey): String = key.name.lowercase()

    @Test
    fun `the shared file carries cases`() {
        assertThat(cases.size).isAtLeast(10)
    }

    @Test
    fun `every shared vector resolves to the same guide`() {
        cases.forEach { case ->
            val label = case["_label"].stringOrNull()
            val input = case.getValue("input").jsonObject
            val expected = case.getValue("expected").jsonObject
            val axis = EngagementAxisKey.fromWire(input.getValue("axisKey").jsonPrimitive.content)!!
            val served = input.getValue("served").jsonArray.map {
                BadgeServedTier(it.jsonObject.getValue("threshold").jsonPrimitive.int, it.jsonObject.getValue("reachedAt").jsonPrimitive.content)
            }

            val guide = BadgeGuideResolver.resolve(axis, input.getValue("count").jsonPrimitive.double.toInt(), served)

            assertWithMessage("$label · famille").that(guide.family.wire).isEqualTo(expected.getValue("family").jsonPrimitive.content)
            assertWithMessage("$label · compte").that(guide.count).isEqualTo(expected.getValue("count").jsonPrimitive.int)
            assertWithMessage("$label · étoiles").that(guide.stars).isEqualTo(expected.getValue("stars").jsonPrimitive.int)
            val rungs = expected.getValue("rungs").jsonArray.map { it.jsonObject }
            assertWithMessage("$label · paliers").that(guide.rungs.map { listOf(it.threshold, materialWire(it.material), it.ribbon, it.reached, it.reachedAt) })
                .isEqualTo(
                    rungs.map {
                        listOf(
                            it.getValue("threshold").jsonPrimitive.int,
                            it.getValue("material").jsonPrimitive.content,
                            it.getValue("ribbon").jsonPrimitive.boolean,
                            it.getValue("reached").jsonPrimitive.boolean,
                            it["reachedAt"].stringOrNull(),
                        )
                    },
                )
            val reached = expected["reached"]?.takeUnless { it is JsonNull }?.jsonObject
            assertWithMessage("$label · palier tenu").that(guide.reached?.let { listOf(it.threshold, materialWire(it.material), it.reason.wire, it.reachedAt) })
                .isEqualTo(
                    reached?.let {
                        listOf(
                            it.getValue("threshold").jsonPrimitive.int,
                            it.getValue("material").jsonPrimitive.content,
                            it.getValue("reason").jsonPrimitive.content,
                            it["reachedAt"].stringOrNull(),
                        )
                    },
                )
            val next = expected["next"]?.takeUnless { it is JsonNull }?.jsonObject
            assertWithMessage("$label · prochaine étoile").that(guide.next?.let { listOf(it.threshold, materialWire(it.material), it.missing) })
                .isEqualTo(
                    next?.let {
                        listOf(it.getValue("threshold").jsonPrimitive.int, it.getValue("material").jsonPrimitive.content, it.getValue("missing").jsonPrimitive.int)
                    },
                )
        }
    }

    @Test
    fun `the suite of a medal lists its rungs to come and marks the next star`() {
        val guide = BadgeGuideResolver.resolve(EngagementAxisKey.TEXT_MESSAGE, count = 37, served = emptyList())

        assertThat(guide.upcoming.map { it.threshold }).containsExactly(50, 100, 500, 1000, 5000).inOrder()
        assertThat(guide.upcoming.map { guide.stateOf(it) })
            .containsExactly(BadgeRungState.Next, BadgeRungState.Upcoming, BadgeRungState.Upcoming, BadgeRungState.Upcoming, BadgeRungState.Upcoming)
            .inOrder()
    }

    @Test
    fun `a prism medal has nothing to come`() {
        assertThat(BadgeGuideResolver.resolve(EngagementAxisKey.STICKER, count = 5000, served = emptyList()).upcoming).isEmpty()
    }

    @Test
    fun `the catalog ranges the twenty medals by family in catalog order`() {
        val catalog = BadgeGuideResolver.catalog

        assertThat(catalog.map { it.family }).containsExactlyElementsIn(EngagementAxisFamily.entries).inOrder()
        assertThat(catalog.flatMap { group -> group.guides.map { it.axis } }).containsExactlyElementsIn(EngagementAxisKey.entries).inOrder()
    }
}
