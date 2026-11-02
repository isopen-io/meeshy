package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import me.meeshy.sdk.testutil.SharedFixtures
import me.meeshy.sdk.testutil.stringOrNull
import org.junit.Test

/**
 * Rejeu de `game.vectors.json` (TS fait foi) contre les lois de niveau, d'étapes, de Gloire et de
 * Mythe : level, level-record, glory-standing, glory-gain, mythic-seats, mythic-crossing,
 * mythic-signature. Les fractions sont comparées à 1e-4, les coordonnées au dixième.
 */
class GameLawsVectorParityTest {

    private val cases = SharedFixtures.vectors("reading-modes/game.vectors.json")

    private fun cases(law: String) = cases.filter { it.input.stringOrNull("law") == law }
        .also { assertWithMessage("aucun vecteur $law").that(it).isNotEmpty() }

    private fun JsonElement?.int(): Int? = if (this == null || this is JsonNull) null else jsonPrimitive.intOrNull
    private fun JsonElement?.long(): Long? = if (this == null || this is JsonNull) null else jsonPrimitive.longOrNull
    private fun JsonElement?.double(): Double? = if (this == null || this is JsonNull) null else jsonPrimitive.doubleOrNull
    private fun JsonElement?.bool(): Boolean = this?.jsonPrimitive?.contentOrNull == "true"
    private fun JsonElement?.obj(): JsonObject? = this as? JsonObject

    private fun check(label: String?, field: String, actual: Any?, expected: Any?) =
        assertWithMessage("$label : $field").that(actual).isEqualTo(expected)

    private fun near(label: String?, field: String, actual: Double?, expected: Double?) {
        if (expected == null) return check(label, field, actual, null)
        assertWithMessage("$label : $field").that(actual).isNotNull()
        assertWithMessage("$label : $field").that(actual!!).isWithin(1e-4).of(expected)
    }

    private fun tierOf(wire: String?) = LevelTierKey.entries.first { enumWire(it) == wire }
    private fun enumWire(tier: LevelTierKey) = tier.name.lowercase()
    private fun rankWire(rank: GloryRank?) = rank?.name?.lowercase()

    private fun factsOf(input: JsonObject): LevelStepFacts? {
        val steps = input["steps"].obj() ?: return null
        val glory = input["glory"].int()!!
        return LevelStepFacts(
            minted = steps["minted"].int()!!,
            missionsDone = steps["missionsDone"].int()!!,
            flameRecord = steps["flameRecord"].int()!!,
            glory = glory,
            rank = GloryLaws.standing(glory).rank,
        )
    }

    @Test
    fun `level rejoue le niveau servi les etapes et les deblocages`() {
        cases("level").forEach { v ->
            val e = v.expected!!.jsonObject
            val score = v.input["score"].long()!!
            val glory = v.input["glory"].int()!!
            val facts = factsOf(v.input)
            val gate = GameLevelSteps.gate(facts)
            val p = GameLevels.progress(score, GloryLaws.levelCap(glory), gate)
            val legacy = GameLevels.legacyProgress(score, gate)
            check(v.label, "level", p.level, e["level"].int())
            check(v.label, "tier", enumWire(p.tier), e["tier"].stringOrNull())
            check(v.label, "floorScore", p.floorScore, e["floorScore"].long())
            check(v.label, "nextThreshold", p.nextThreshold, e["nextThreshold"].long())
            check(v.label, "pointsToNext", p.pointsToNext, e["pointsToNext"].long())
            near(v.label, "progress", p.progress, e["progress"].double())
            check(v.label, "isMax", p.isMax, e["isMax"].bool())
            check(v.label, "cap", p.cap, e["cap"].int())
            check(v.label, "legacyLevel", legacy.level, e["legacyLevel"].int())
            check(v.label, "legacyTier", enumWire(legacy.tier), e["legacyTier"].stringOrNull())
            check(v.label, "held", p.held, e["held"].bool())
            check(v.label, "gate", gate, e["gate"].int())
            val step = GameLevelSteps.next(p.level, facts)
            val expectedStep = e["step"].obj()
            check(v.label, "step.present", step != null, expectedStep != null)
            if (step != null && expectedStep != null) {
                check(v.label, "step.level", step.level, expectedStep["level"].int())
                check(v.label, "step.kind", step.kind.name.lowercase(), expectedStep["kind"].stringOrNull())
                check(v.label, "step.target", step.target, expectedStep["target"].long())
                check(v.label, "step.current", step.current, expectedStep["current"].long())
                check(v.label, "step.met", step.met, expectedStep["met"].bool())
                check(v.label, "step.rank", rankWire(step.rank), expectedStep["rank"].stringOrNull())
            }
            check(v.label, "unlockLevel", GameLevels.levelForUnlocks(score, v.input["levelRecord"].int()), e["unlockLevel"].int())
        }
    }

    @Test
    fun `level-record rejoue le record et les nouveaux niveaux`() {
        cases("level-record").forEach { v ->
            val e = v.expected!!.jsonObject
            val level = v.input["level"].int()!!
            val previous = v.input["previousRecord"].int()
            val fresh = GameLevels.newLevelsReached(level, previous)
            check(v.label, "record", GameLevels.record(level, previous), e["record"].int())
            check(v.label, "from", fresh.from, e["newLevelsFrom"].int())
            check(v.label, "to", fresh.to, e["newLevelsTo"].int())
            check(v.label, "count", fresh.count, e["newLevelsCount"].int())
            check(v.label, "canPrestige", GameLevels.canPrestige(level, v.input["prestige"].int()!!), e["canPrestige"].bool())
        }
    }

    @Test
    fun `glory-standing rejoue le rang les divisions la suite et le plafond`() {
        cases("glory-standing").forEach { v ->
            val e = v.expected!!.jsonObject
            val seatObj = v.input["mythicSeat"].obj()
            val seat = seatObj?.let { MythicSeatRef(it["number"].int()!!, it["edition"].int()!!) }
            val s = GloryLaws.standing(v.input["glory"].int()!!, mythic = v.input["mythic"].bool(), mythicSeat = seat)
            check(v.label, "rank", rankWire(s.rank), e["rank"].stringOrNull())
            check(v.label, "division", s.division, e["division"].int())
            check(v.label, "division5", s.division5, e["division5"].int())
            check(v.label, "divisionMinGlory", s.divisionMinGlory, e["divisionMinGlory"].int())
            check(v.label, "nextRank", rankWire(s.next?.rank), e["nextRank"].stringOrNull())
            check(v.label, "nextDivision", s.next?.division, e["nextDivision"].int())
            check(v.label, "nextDivision5", s.next?.division5, e["nextDivision5"].int())
            check(v.label, "nextMinGlory", s.next?.minGlory, e["nextMinGlory"].int())
            check(v.label, "gloryMissing", s.gloryMissing, e["gloryMissing"].int())
            near(v.label, "progress", s.progress, e["progress"].double())
            check(v.label, "mythicNumber", s.mythic?.number, e["mythicNumber"].int())
            check(v.label, "mythicEdition", s.mythic?.edition, e["mythicEdition"].int())
            check(v.label, "levelCap", GloryLaws.levelCap(s.rank), e["levelCap"].int())
        }
    }

    @Test
    fun `glory-gain rejoue la Gloire des succes des niveaux et des records de Flamme`() {
        cases("glory-gain").forEach { v ->
            val e = v.expected!!.jsonObject
            val rarity = GloryLaws.AchievementRarity.valueOf(
                v.input.stringOrNull("rarity")!!.replaceFirstChar { it.uppercase() },
            )
            check(v.label, "achievement", GloryLaws.gloryForAchievement(rarity), e["achievement"].int())
            check(v.label, "newLevels", GloryLaws.gloryForNewLevels(v.input["level"].int()!!, v.input["previousRecord"].int()), e["newLevels"].int())
            check(
                v.label,
                "flameRecords",
                GloryLaws.gloryForFlameRecords(v.input["previousLongest"].int()!!, v.input["longest"].int()!!),
                e["flameRecords"].int(),
            )
        }
    }

    @Test
    fun `mythic-seats rejoue l'attribution des places`() {
        cases("mythic-seats").forEach { v ->
            val taken = v.input["taken"]!!.jsonArray.map { it.int()!! }
            val seated = v.input["seated"]!!.jsonArray.map { it.jsonPrimitive.content }
            val arrivals = v.input["arrivals"]!!.jsonArray.map {
                val o = it.jsonObject
                MythicArrival(o.stringOrNull("userId")!!, o["glory"].int()!!, o.stringOrNull("crossedAt")!!)
            }
            val expected = v.expected!!.jsonObject["grants"]!!.jsonArray.map {
                MythicSeatGrant(it.jsonObject.stringOrNull("userId")!!, it.jsonObject["number"].int()!!)
            }
            check(v.label, "grants", GameMythe.assignSeats(taken, seated, arrivals), expected)
        }
    }

    @Test
    fun `mythic-crossing rejoue le franchissement du million`() {
        cases("mythic-crossing").forEach { v ->
            val gains = v.input["gains"]!!.jsonArray.map {
                GloryGain(it.jsonObject["delta"].int()!!, it.jsonObject.stringOrNull("createdAt")!!)
            }
            check(v.label, "crossedAt", GameMythe.crossedAt(gains), v.expected!!.jsonObject.stringOrNull("crossedAt"))
        }
    }

    @Test
    fun `mythic-signature rejoue la geometrie de chaque emission`() {
        cases("mythic-signature").forEach { v ->
            val actual = GameMythe.signature(v.input["edition"].int()!!)
            val e = v.expected!!.jsonObject["signature"].obj()
            if (e == null) return@forEach check(v.label, "signature", actual, null)
            val s = actual!!
            check(v.label, "edition", s.edition, e["edition"].int())
            check(v.label, "hue", s.hue, e["hue"].int())
            check(v.label, "numeral", s.numeral, e.stringOrNull("numeral"))
            val halo = e["halo"].obj()!!
            check(v.label, "halo", listOf(s.halo.cx, s.halo.cy, s.halo.inner, s.halo.outer, s.halo.strokeWidth),
                listOf("cx", "cy", "inner", "outer", "strokeWidth").map { halo[it].double() })
            val rays = e["rays"] as JsonArray
            check(v.label, "rays", s.rays.map { listOf(it.x1, it.y1, it.x2, it.y2) },
                rays.map { r -> listOf("x1", "y1", "x2", "y2").map { r.jsonObject[it].double() } })
            val gem = e["gem"].obj()!!
            check(v.label, "gem", listOf(s.gem.cx, s.gem.cy, s.gem.r, s.gem.orbit, s.gem.angle.toDouble()),
                listOf("cx", "cy", "r", "orbit", "angle").map { gem[it].double() })
            val beads = e["beads"] as JsonArray
            check(v.label, "beads", s.beads.map { listOf(it.cx, it.cy, it.r, it.slot.toDouble()) },
                beads.map { b -> listOf("cx", "cy", "r", "slot").map { b.jsonObject[it].double() } })
            val eng = e["engraving"].obj()!!
            check(v.label, "engraving", listOf(s.engraving.x, s.engraving.y, s.engraving.size),
                listOf("x", "y", "size").map { eng[it].double() })
        }
    }
}
