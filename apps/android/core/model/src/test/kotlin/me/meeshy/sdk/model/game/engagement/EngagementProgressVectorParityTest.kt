package me.meeshy.sdk.model.game.engagement

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.testutil.SharedFixtures
import org.junit.Test

/**
 * Rejeu Android de `reading-modes/engagement-progress.vectors.json` — le contrat cross-plateforme de la loi de
 * progression (TS fait foi, iOS le rejoue aussi). Les fractions se comparent à 1e-4.
 */
class EngagementProgressVectorParityTest {

    private val vectors = SharedFixtures.vectors("reading-modes/engagement-progress.vectors.json")

    private fun JsonObject.int(key: String): Int? = this[key]?.takeUnless { it is JsonNull }?.jsonPrimitive?.intOrNull

    private fun JsonObject.fraction(key: String): Double = this.getValue(key).jsonPrimitive.doubleOrNull!!

    @Test
    fun `chaque vecteur partage rend la meme progression que le TypeScript`() {
        assertThat(vectors).isNotEmpty()
        vectors.forEach { vector ->
            val label = vector.label.orEmpty()
            val payload = EngagementProgressParser.parse(vector.input)
            assertWithMessage("$label : charge lisible").that(payload).isNotNull()
            val progress = EngagementProgressResolver.resolve(payload!!)
            val expected = vector.expected!!.jsonObject

            assertWithMessage("$label : level").that(progress.level.level).isEqualTo(expected.int("level"))
            assertWithMessage("$label : levelNext").that(progress.level.scale.nextThreshold).isEqualTo(expected.int("levelNext"))
            assertThat(progress.level.scale.progress).isWithin(1e-4).of(expected.fraction("levelProgress"))
            assertWithMessage("$label : streakNext").that(progress.streak.scale.nextThreshold).isEqualTo(expected.int("streakNext"))
            assertThat(progress.streak.scale.progress).isWithin(1e-4).of(expected.fraction("streakProgress"))
            assertWithMessage("$label : streakReached").that(progress.streak.scale.reachedCount).isEqualTo(expected.int("streakReached"))
            assertWithMessage("$label : badgesEarned").that(progress.badgesEarned).isEqualTo(expected.int("badgesEarned"))
            assertWithMessage("$label : isEmpty").that(progress.isEmpty).isEqualTo(expected.getValue("isEmpty").jsonPrimitive.content.toBoolean())

            val unlocked = progress.achievements.filter { it.unlocked }.map { it.key.wire }
            val expectedUnlocked = (expected["achievements"] as JsonArray).map { it.jsonPrimitive.content }
            assertWithMessage("$label : achievements").that(unlocked).containsExactlyElementsIn(expectedUnlocked).inOrder()

            val shownAxes = progress.axes.filter { it.scale.value > 0 || it.scale.reachedCount > 0 }
            val expectedAxes = expected.getValue("axes").jsonObject
            assertWithMessage("$label : axes présents").that(shownAxes.map { it.axis.wire }).containsExactlyElementsIn(expectedAxes.keys)
            shownAxes.forEach { axis ->
                val e = expectedAxes.getValue(axis.axis.wire).jsonObject
                assertWithMessage("$label : ${axis.axis.wire}").that(axis.scale.reachedCount).isEqualTo(e.int("reachedCount"))
                assertThat(axis.scale.nextThreshold).isEqualTo(e.int("nextThreshold"))
                assertThat(axis.scale.progress).isWithin(1e-4).of(e.fraction("progress"))
            }
        }
    }
}
