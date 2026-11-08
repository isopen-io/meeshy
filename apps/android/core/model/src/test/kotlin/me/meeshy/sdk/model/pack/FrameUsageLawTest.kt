package me.meeshy.sdk.model.pack

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.game.FrameCaptureMedia
import me.meeshy.sdk.model.game.FrameUsage
import me.meeshy.sdk.model.game.FrameUsageLaw
import me.meeshy.sdk.model.game.FrameUseContext
import me.meeshy.sdk.model.game.FreeFrameSurface
import me.meeshy.sdk.model.game.GloryLaws
import me.meeshy.sdk.model.game.GloryRank
import org.junit.Test

/** Les vecteurs partagés de `packages/shared/design/packs`, lus en place (jamais copiés) : en cas d'écart, le TypeScript fait foi. */
internal object FrameUsageVectors {
    fun load(name: String): JsonObject {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "packages/shared/design/packs/$name")
            if (candidate.isFile) return Json.parseToJsonElement(candidate.readText()).jsonObject
            dir = dir.parentFile
        }
        error("$name introuvable en remontant depuis ${File("").absolutePath}")
    }
}

class FrameUsageLawTest {

    private fun replay(file: String, minimum: Int) {
        val root = FrameUsageVectors.load(file)
        val cases = root["cases"]!!.jsonArray
        assertThat(cases.size).isAtLeast(minimum)
        val failures = cases.mapNotNull { element ->
            val case = element.jsonObject
            val usage = FrameUsageWire.parseUsage(case["usage"])
            val context = FrameUsageWire.parseContext(case["context"])
            val expected = case["expected"]!!.jsonPrimitive.boolean
            when {
                usage == null || context == null -> "« ${case["name"]} » illisible"
                FrameUsageLaw.canUseFrame(usage, context) != expected -> "« ${case["name"]} » attendu $expected"
                else -> null
            }
        }
        assertWithMessage(failures.joinToString("\n")).that(failures).isEmpty()
        assertLabels(root["labels"]?.jsonArray)
        assertInvalid(root["invalidUsages"]?.jsonArray) { FrameUsageWire.parseUsage(it) }
        assertInvalid(root["invalidContexts"]?.jsonArray) { FrameUsageWire.parseContext(it) }
    }

    private fun assertInvalid(items: JsonArray?, parse: (JsonElement) -> Any?) {
        items.orEmpty().forEach { assertWithMessage("$it").that(parse(it)).isNull() }
    }

    private fun assertLabels(labels: JsonArray?) {
        labels.orEmpty().forEach { element ->
            val label = element.jsonObject
            val described = FrameUsageLaw.describeFrameUsage(FrameUsageWire.parseUsage(label["usage"])!!)
            assertThat(described.key).isEqualTo(label["key"]!!.jsonPrimitive.content)
            assertThat(described.params).isEqualTo(label["params"]!!.jsonObject.mapValues { it.value.jsonPrimitive.content })
        }
    }

    @Test
    fun `chaque cadre x contexte rend le verdict de la loi TypeScript`() = replay("frame-usage-vectors.json", 150)

    @Test
    fun `chaque cadre x contexte avatar rend le verdict de la loi TypeScript`() = replay("frame-usage-avatar-vectors.json", 40)

    @Test
    fun `chaque cadre x contexte banniere rend le verdict de la loi TypeScript`() = replay("frame-usage-banner-vectors.json", 40)

    @Test
    fun `chaque regle a un cas positif et un cas negatif`() {
        val cases = FrameUsageVectors.load("frame-usage-vectors.json")["cases"]!!.jsonArray.map { it.jsonObject }
        cases.groupBy { it["rule"]!!.jsonPrimitive.content }.forEach { (rule, group) ->
            assertWithMessage("positif : $rule").that(group.any { it["expected"]!!.jsonPrimitive.boolean }).isTrue()
            assertWithMessage("negatif : $rule").that(group.any { !it["expected"]!!.jsonPrimitive.boolean }).isTrue()
        }
    }

    @Test
    fun `un cadre capture seule ne sert pas l'appel et un cadre appel sert aussi la capture`() {
        val captureOnly = FrameUsage.Free(listOf(FreeFrameSurface.Photo, FreeFrameSurface.Video))
        val call = FrameUsage.Free(listOf(FreeFrameSurface.Call))
        assertThat(FrameUsageLaw.canUseFrame(captureOnly, FrameUseContext.Call)).isFalse()
        assertThat(FrameUsageLaw.canUseFrame(captureOnly, FrameUseContext.Capture(FrameCaptureMedia.Photo))).isTrue()
        assertThat(FrameUsageLaw.canUseFrame(call, FrameUseContext.Capture(FrameCaptureMedia.Video))).isTrue()
    }

    @Test
    fun `un cadre libre n'est jamais propose pour un succes et un cadre de rang ne sert que son rang`() {
        val free = FrameUsage.Free(listOf(FreeFrameSurface.Call, FreeFrameSurface.Photo, FreeFrameSurface.Video))
        assertThat(FrameUsageLaw.canUseFrame(free, FrameUseContext.Achievement(GloryLaws.AchievementRarity.Epic))).isFalse()
        assertThat(FrameUsageLaw.canUseFrame(FrameUsage.Rank(GloryRank.Ambassadeur, 4), FrameUseContext.Rank(GloryRank.Ambassadeur, 2))).isFalse()
        assertThat(FrameUsageLaw.canUseFrame(FrameUsage.Rank(GloryRank.Ambassadeur, null), FrameUseContext.Rank(GloryRank.Ambassadeur, 2))).isTrue()
    }

    @Test
    fun `les labels et la projection de capture suivent le TypeScript`() {
        val root = FrameUsageVectors.load("frame-usage-vectors.json")
        root["captureProjection"]!!.jsonArray.forEach { element ->
            val projection = element.jsonObject
            val surfaces = projection["surfaces"]?.let { it as? JsonArray }
                ?.map { CaptureFrameSurface.fromWire(it.jsonPrimitive.content)!! }
            assertThat(FrameUsageWire.captureFrameUsage(surfaces)).isEqualTo(FrameUsageWire.parseUsage(projection["usage"]))
        }
        assertThat(FrameUsageWire.captureFrameUsage(null)).isEqualTo(FrameUsage.Free(listOf(FreeFrameSurface.Photo, FreeFrameSurface.Video)))
        assertThat(FrameUsageLabelKey.all).hasSize(12)
    }

    @Test
    fun `le libelle d'un rang et d'une division est en chiffres romains`() {
        val label = FrameUsageLaw.describeFrameUsage(FrameUsage.Rank(GloryRank.Orateur, 2))
        assertThat(label.key).isEqualTo("frame.usage.rankDivisionOnly")
        assertThat(label.params).containsExactly("rank", "orateur", "division", "II")
    }
}
