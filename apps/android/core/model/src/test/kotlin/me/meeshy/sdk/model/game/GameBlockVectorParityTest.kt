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
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/**
 * Rejeu Android de `packages/shared/fixtures/reading-modes/game.vectors.json`
 * (contrat cross-plateforme des lois du Jeu, TS fait foi). Les vecteurs portent
 * les SORTIES des lois ; ce que le modèle du bloc en lit — les clés FERMÉES
 * (palier, rang, forme de Flamme, réserve, édition, prime) et le coffre — doit
 * donc se décoder pour CHAQUE sortie : un palier ou un rang que la loi sert et
 * que l'énumération Android ne connaît pas ferait tomber tout le bloc du jeu.
 */
class GameBlockVectorParityTest {

    private class Vector(val label: String, val law: String, val expected: JsonObject)

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
            Vector(obj["_label"]?.jsonPrimitive?.contentOrNull.orEmpty(), obj["input"]!!.jsonObject["law"]!!.jsonPrimitive.content, expected)
        }
    }

    private fun Vector.str(key: String): String? = (expected[key] as? JsonElement)?.takeUnless { it is JsonNull }?.jsonPrimitive?.contentOrNull

    private inline fun <reified E : Enum<E>> check(law: String, key: String) {
        val replayed = vectors.filter { it.law == law }.mapNotNull { v -> v.str(key)?.let { v to it } }
        assertThat(replayed).isNotEmpty()
        replayed.forEach { (v, wire) ->
            assertWithMessage("${v.label} : $key=$wire").that(enumFromWire<E>(wire)).isNotNull()
        }
    }

    @Test
    fun `les paliers de niveau servis par la loi sont tous connus`() {
        check<LevelTierKey>("level", "tier")
        check<LevelTierKey>("level", "legacyTier")
    }

    @Test
    fun `les rangs de Gloire servis par la loi sont tous connus`() {
        check<GloryRank>("glory-standing", "rank")
        check<GloryRank>("glory-standing", "nextRank")
    }

    @Test
    fun `les formes de Flamme les reserves et les editions servies sont toutes connues`() {
        check<FlameFormKey>("flame-form", "form")
        check<TreasuryTierKey>("treasury", "tier")
        check<TreasuryTierKey>("treasury", "nextKey")
        check<MeeshEdition>("mint-price", "edition")
    }

    @Test
    fun `les divisions servies tiennent dans les bornes du modele`() {
        vectors.filter { it.law == "glory-standing" }.forEach { v ->
            v.str("division")?.toInt()?.let { assertWithMessage(v.label).that(it in 1..3).isTrue() }
            v.str("division5")?.toInt()?.let { assertWithMessage(v.label).that(it in 1..5).isTrue() }
        }
    }

    @Test
    fun `chaque coffre servi par la loi se decode comme un coffre ouvert`() {
        val chests = vectors.filter { it.law == "chest" }
        assertThat(chests).isNotEmpty()
        chests.forEach { v ->
            val chest = parseDailyChest(v.expected)
            assertWithMessage(v.label).that(chest.points).isEqualTo(v.str("points")!!.toInt())
            assertWithMessage(v.label).that(chest.glory).isEqualTo(v.str("glory")!!.toInt())
            assertWithMessage(v.label).that(chest.bonus).isNotNull()
            assertWithMessage(v.label).that(chest.bonusPoints).isEqualTo(v.str("bonusPoints")!!.toInt())
        }
    }

    @Test
    fun `chaque total de fragments servi se decode`() {
        val totals = vectors.filter { it.law == "star-fragments" }
        assertThat(totals).isNotEmpty()
        totals.forEach { v ->
            assertWithMessage(v.label).that(parseStarFragments(v.expected).collected).isEqualTo(v.str("collected")!!.toInt())
        }
    }

    @Test
    fun `les vecteurs ne contiennent pas de tableau sans entree`() {
        assertThat(vectors.map { it.expected }.filterIsInstance<JsonArray>()).isEmpty()
        assertThat(vectors).isNotEmpty()
    }
}
