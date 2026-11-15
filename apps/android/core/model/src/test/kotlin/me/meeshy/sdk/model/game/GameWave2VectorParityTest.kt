package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/**
 * Rejeu Android de `packages/shared/fixtures/reading-modes/game.vectors.json` pour les
 * extensions de la vague 2 (TS fait foi). Les vecteurs portent les SORTIES des lois : chaque
 * clé fermée qu'une loi SERT doit se décoder, sinon l'extension entière tomberait chez le joueur.
 */
class GameWave2VectorParityTest {

    private class Vector(val label: String, val law: String, val input: JsonObject, val expected: JsonObject)

    private fun fixtureFile(): File {
        val relative = "packages/shared/fixtures/reading-modes/game.vectors.json"
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relative)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        error("game.vectors.json introuvable en remontant depuis ${File("").absolutePath}")
    }

    private val vectors: List<Vector> by lazy {
        Json.parseToJsonElement(fixtureFile().readText()).jsonObject["vectors"]!!.jsonArray.mapNotNull { v ->
            val obj = v.jsonObject
            val expected = obj["expected"] as? JsonObject ?: return@mapNotNull null
            val input = obj["input"]!!.jsonObject
            Vector(obj["_label"]?.jsonPrimitive?.contentOrNull.orEmpty(), input["law"]!!.jsonPrimitive.content, input, expected)
        }
    }

    private fun JsonElement?.text(): String? = this?.takeUnless { it is JsonNull }?.jsonPrimitive?.contentOrNull

    private inline fun <reified E : Enum<E>> replay(law: String, wires: (Vector) -> List<String>) {
        val replayed = vectors.filter { it.law == law }.flatMap { v -> wires(v).map { v to it } }
        assertThat(replayed).isNotEmpty()
        replayed.forEach { (v, wire) ->
            assertWithMessage("${v.label} : $wire").that(enumFromWire<E>(wire)).isNotNull()
        }
    }

    @Test
    fun `les acces de ligue servis par la loi sont tous connus`() =
        replay<LeagueAccess>("league-access") { listOfNotNull(it.expected["status"].text()) }

    @Test
    fun `les zones coupes et ligues du reglement sont toutes connues`() {
        replay<LeagueZone>("league-settle") { listOfNotNull(it.expected["me"]?.jsonObject?.get("zone").text()) }
        replay<LeagueCup>("league-settle") { v ->
            (v.expected["cups"] as? JsonArray).orEmpty().mapNotNull { it.jsonArray[1].text() }
        }
        replay<LeagueKey>("league-settle") { v ->
            listOfNotNull(v.input["league"].text(), v.expected["me"]?.jsonObject?.get("outcome")?.jsonObject?.get("nextLeague").text())
        }
    }

    @Test
    fun `les statuts de duo servis par la loi sont tous connus`() =
        replay<DuoBlockStatus>("duo-transition") { listOfNotNull(it.input["status"].text(), it.expected["next"].text()) }

    @Test
    fun `les recompenses de saison servies sont toutes connues`() =
        replay<SeasonRewardKind>("season-reward") { listOfNotNull(it.expected["reward"]?.takeIf { r -> r !is JsonNull }?.jsonObject?.get("kind").text()) }

    @Test
    fun `les etats de saison servis sont tous connus`() =
        replay<GameArchiveStatus>("season-tense") { listOfNotNull(it.expected["tense"].text(), it.expected["live"].text(), it.input["served"].text()) }

    @Test
    fun `les visibilites de la vitrine servies sont toutes connues`() {
        replay<ShowcaseVisibility>("showcase-cap") { listOfNotNull(it.expected["visibility"].text()) }
    }

    @Test
    fun `les rarites servies sont toutes connues`() =
        replay<AchievementRarity>("rarity") { listOfNotNull(it.expected["rarity"].text(), it.expected["measured"].text()) }

    @Test
    fun `l'affichage d'une rarete suit la loi des seuils`() {
        val replayed = vectors.filter { it.law == "rarity-display" }
        assertThat(replayed).isNotEmpty()
        replayed.forEach { v ->
            val holders = v.input["holders"]!!.jsonPrimitive.int
            val population = v.input["population"]!!.jsonPrimitive.int
            val expected = v.expected["displayable"]!!.jsonPrimitive.content.toBoolean()
            assertWithMessage(v.label).that(GameRarityEntry.isShareDisplayable(holders, population)).isEqualTo(expected)
            assertWithMessage(v.label)
                .that(GameRarityEntry(AchievementRarity.Epic, holders, population).visibleRarity != null)
                .isEqualTo(expected)
        }
    }
}
