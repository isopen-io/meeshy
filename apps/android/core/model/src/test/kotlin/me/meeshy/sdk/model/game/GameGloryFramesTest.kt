package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/** La loi de proposition des cadres de gloire (#10156) : atmosphère, dernier choix, packs installés ; rejouée sur les vecteurs partagés. */
class GameGloryFramesTest {

    private fun JsonElement?.string(): String? = if (this == null || this is JsonNull) null else jsonPrimitive.contentOrNull
    private fun JsonElement?.int(): Int? = if (this == null || this is JsonNull) null else jsonPrimitive.intOrNull

    private val root: JsonObject by lazy {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "packages/shared/design/packs/frame-offer-vectors.json")
            if (candidate.isFile) return@lazy Json.parseToJsonElement(candidate.readText()).jsonObject
            dir = dir.parentFile
        }
        error("frame-offer-vectors.json introuvable")
    }

    private fun rank(wire: String?) = wire?.let { w -> GloryRank.entries.first { it.name.lowercase() == w } }
    private fun rarity(wire: String?) = wire?.let { w -> GloryLaws.AchievementRarity.entries.first { it.name.lowercase() == w } }

    private fun usageOf(o: JsonObject): FrameUsage = when (o["kind"].string()) {
        "rank" -> FrameUsage.Rank(rank(o["rank"].string())!!, o["division"].int())
        "prestige" -> FrameUsage.Prestige
        "achievement" -> FrameUsage.Achievement(rarity(o["rarity"].string()))
        "moment" -> FrameUsage.Moment(FrameMomentFamily.entries.first { it.wire == o["family"].string() })
        else -> error("usage ${o["kind"]}")
    }

    private fun appliesOf(o: JsonObject): GloryFrameAppliesTo = when (o["family"].string()) {
        "rank" -> GloryFrameAppliesTo.Rank(rank(o["rank"].string())!!, o["division"].int())
        "tier" -> GloryFrameAppliesTo.Tier(LevelTierKey.entries.first { it.name.lowercase() == o["tier"].string() })
        "meesh" -> GloryFrameAppliesTo.Meesh(MeeshFrameEdition.entries.first { it.wire == o["edition"].string() })
        "treasury" -> GloryFrameAppliesTo.Treasury(TreasuryTierKey.entries.first { it.name.lowercase() == o["treasury"].string() })
        "flame" -> GloryFrameAppliesTo.Flame(o["days"].int()!!)
        "day" -> GloryFrameAppliesTo.Day
        "achievement" -> GloryFrameAppliesTo.Achievement(rarity(o["rarity"].string()))
        else -> error("cible ${o["family"]}")
    }

    private val catalog: List<GloryFrameOfferPack> by lazy {
        root["catalog"]!!.jsonArray.map { p ->
            val pack = p.jsonObject
            GloryFrameOfferPack(
                slug = pack["slug"].string()!!,
                atmosphere = pack["atmosphere"].string(),
                collections = pack["collections"]!!.jsonArray.map { it.jsonPrimitive.content },
                frames = pack["frames"]!!.jsonArray.map { f ->
                    val frame = f.jsonObject
                    GloryFrameOfferFrame(
                        id = frame["id"].string()!!,
                        usage = usageOf(frame["usage"]!!.jsonObject),
                        placement = GloryFramePlacement(
                            collection = frame["collection"].string()!!,
                            appliesTo = appliesOf(frame["appliesTo"]!!.jsonObject),
                            option = frame["option"].string(),
                            hidden = frame["hidden"]!!.jsonPrimitive.content.toBoolean(),
                        ),
                    )
                },
            )
        }
    }

    private fun refs(array: JsonElement?) = array!!.jsonArray.map { GloryFrameRef(it.jsonObject["pack"].string()!!, it.jsonObject["frameId"].string()!!) }

    @Test
    fun `chaque cas du fichier partage rend la sortie de la loi TypeScript`() {
        val cases = root["cases"]!!.jsonArray.map { it.jsonObject }
        assertThat(cases.size).isAtLeast(30)
        cases.forEach { case ->
            val input = case["input"]!!.jsonObject
            val expected = case["expected"]!!.jsonObject
            val offer = GameGloryFrames.framesFor(
                stepId = input["stepId"].string()!!,
                atmosphere = input["atmosphere"].string(),
                lastChosen = input["lastChosen"].string(),
                catalog = catalog,
                installed = input["installed"]!!.jsonArray.map { it.jsonPrimitive.content }.toSet(),
                rarity = rarity(input["rarity"].string()),
            )
            val name = case["name"].string()
            assertWithMessage("$name : needsAtmosphere").that(offer.needsAtmosphere).isEqualTo(expected["needsAtmosphere"]!!.jsonPrimitive.content.toBoolean())
            assertWithMessage("$name : suggested").that(offer.suggested).isEqualTo(refs(expected["suggested"]))
            assertWithMessage("$name : others").that(offer.others).isEqualTo(
                expected["others"]!!.jsonArray.map {
                    val o = it.jsonObject
                    GloryFrameOtherPack(o["pack"].string()!!, o["atmosphere"].string(), o["installed"]!!.jsonPrimitive.content.toBoolean(), refs(o["frames"]))
                },
            )
            assertWithMessage("$name : reinstall").that(offer.reinstall).isEqualTo(expected["reinstall"].string())
            val preselected = expected["preselected"]
            assertWithMessage("$name : preselected").that(offer.preselected)
                .isEqualTo(if (preselected == null || preselected is JsonNull) null else refs(kotlinx.serialization.json.JsonArray(listOf(preselected))).single())
        }
    }

    @Test
    fun `un cadre libre ne sert jamais le jeu et un cadre de rang ne sert que son rang`() {
        val free = FrameUsage.Free(listOf(FreeFrameSurface.Photo, FreeFrameSurface.Video))
        assertThat(FrameUsageLaw.canUseFrame(free, FrameUseContext.Capture(FrameCaptureMedia.Photo))).isTrue()
        assertThat(FrameUsageLaw.canUseFrame(free, FrameUseContext.Call)).isFalse()
        assertThat(FrameUsageLaw.canUseFrame(free, FrameUseContext.Achievement(null))).isFalse()
        val ranked = FrameUsage.Rank(GloryRank.Oracle, 3)
        assertThat(FrameUsageLaw.canUseFrame(ranked, FrameUseContext.Rank(GloryRank.Oracle, 3))).isTrue()
        assertThat(FrameUsageLaw.canUseFrame(ranked, FrameUseContext.Rank(GloryRank.Oracle, 2))).isFalse()
        assertThat(FrameUsageLaw.canUseFrame(FrameUsage.Prestige, FrameUseContext.Rank(GloryRank.Oracle, 3))).isFalse()
    }

    @Test
    fun `une etape sans cadre a servir ne propose rien`() {
        val offer = GameGloryFrames.framesFor("start", null, null, catalog, setOf("afrique"))
        assertThat(offer).isEqualTo(GloryFramesOffer())
    }
}
