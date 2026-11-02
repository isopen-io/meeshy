package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
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
 * Rejeu de `sparks.vectors.json`, `meesh-display-edition.vectors.json` et des lois mint-price,
 * mint-preview et treasury de `game.vectors.json` (TS fait foi).
 */
class GameMintVectorParityTest {

    private fun cases(file: String, vararg laws: String) = SharedFixtures.vectors("reading-modes/$file")
        .filter { it.input.stringOrNull("law") in laws }
        .also { assertWithMessage("aucun vecteur $laws").that(it).isNotEmpty() }

    private fun JsonElement?.int(): Int? = if (this == null || this is JsonNull) null else jsonPrimitive.intOrNull
    private fun JsonElement?.long(): Long? = if (this == null || this is JsonNull) null else jsonPrimitive.longOrNull
    private fun JsonElement?.obj(): JsonObject? = this as? JsonObject
    private fun JsonElement?.text(): String? = if (this == null || this is JsonNull) null else jsonPrimitive.contentOrNull

    private fun check(label: String?, field: String, actual: Any?, expected: Any?) =
        assertWithMessage("$label : $field").that(actual).isEqualTo(expected)

    private fun wire(edition: MeeshEdition?) = edition?.name?.lowercase()

    private fun stepsOf(input: JsonObject, glory: Int, minted: Int): LevelStepFacts? {
        val steps = input["steps"].obj() ?: return null
        val rankWire = steps["rank"].text()
        val rank = GloryRank.entries.firstOrNull { it.name.lowercase() == rankWire } ?: GloryLaws.standing(glory).rank
        return LevelStepFacts(minted, steps["missionsDone"].int()!!, steps["flameRecord"].int()!!, glory, rank)
    }

    private fun requirementJson(r: RankRequirement?): Any? =
        r?.let { Triple(it.rank.name.lowercase(), it.division, it.division5) }

    private fun requirementOf(e: JsonElement?): Any? = e.obj()?.let {
        Triple(it["rank"].text(), it["division"].int(), it["division5"].int())
    }

    @Test
    fun `mint-price rejoue le prix et l'edition`() {
        cases("game.vectors.json", "mint-price").forEach { v ->
            val n = v.input["n"].int()!!
            val e = v.expected as JsonObject
            check(v.label, "price", GameMint.price(n), e["price"].int())
            check(v.label, "edition", wire(GameMint.edition(n)), e["edition"].text())
        }
    }

    @Test
    fun `mint-preview rejoue la loi d'hier`() {
        cases("game.vectors.json", "mint-preview").forEach { v ->
            val i = v.input
            val glory = i["glory"].int() ?: 0
            val minted = i["mintedLifetime"].int()!!
            val p = GameMint.preview(
                score = i["score"].long()!!,
                mintedLifetime = minted,
                debitablePoints = i["debitablePoints"].long()!!,
                levelCap = GloryLaws.levelCap(glory),
                steps = stepsOf(i, glory, minted),
            )
            val e = v.expected as JsonObject
            check(v.label, "number", p.number, e["number"].int())
            check(v.label, "price", p.price, e["price"].int())
            check(v.label, "edition", wire(p.edition), e["edition"].text())
            check(v.label, "canMint", p.canMint, e["canMint"]!!.jsonPrimitive.booleanOrNull)
            check(v.label, "missingPoints", p.missingPoints, e["missingPoints"].long())
            check(v.label, "levelBefore", p.levelBefore, e["levelBefore"].int())
            check(v.label, "levelAfter", p.levelAfter, e["levelAfter"].int())
            check(v.label, "levelsLost", p.levelsLost, e["levelsLost"].int())
            check(v.label, "gloryGained", p.gloryGained, e["gloryGained"].int())
        }
    }

    @Test
    fun `treasury rejoue le palier courant et le suivant`() {
        cases("game.vectors.json", "treasury").forEach { v ->
            val s = GameTreasury.standing(v.input["held"].int()!!)
            val e = v.expected as JsonObject
            check(v.label, "tier", s.tier?.name?.lowercase(), e["tier"].text())
            check(v.label, "nextKey", s.next?.key?.name?.lowercase(), e["nextKey"].text())
            check(v.label, "missing", s.next?.missing, e["missing"].int())
        }
    }

    @Test
    fun `mint-cost-factor et mint-price des etincelles`() {
        cases("sparks.vectors.json", "mint-cost-factor").forEach { v ->
            check(v.label, "permille", GameMint.costFactorPermille(v.input["level"].int()!!), (v.expected as JsonObject)["permille"].int())
        }
        cases("sparks.vectors.json", "mint-price").forEach { v ->
            val price = GameMint.effectivePrice(v.input["number"].int()!!, v.input["level"].int()!!)
            check(v.label, "price", price, (v.expected as JsonObject)["price"].int())
        }
    }

    @Test
    fun `sparks-of rejoue poche cycle total a vie et dette`() {
        cases("sparks.vectors.json", "sparks-of").forEach { v ->
            val i = v.input
            val l = GameSparks.ledgerOf(i["engagementScore"].long(), i["sparksSincePrestige"].long(), i["sparksEarnedLifetime"].long(), i["sparksDebt"].long())
            val e = v.expected as JsonObject
            check(v.label, "pocket", l.pocket, e["pocket"].long())
            check(v.label, "cycle", l.cycle, e["cycle"].long())
            check(v.label, "lifetime", l.lifetime, e["lifetime"].long())
            check(v.label, "debt", l.debt, e["debt"].long())
        }
    }

    @Test
    fun `sparks-credit et sparks-prestige rejouent le registre`() {
        fun ledger(i: JsonObject) = GameSparks.Ledger(i["pocket"].long()!!, i["cycle"].long()!!, i["lifetime"].long()!!, i["debt"].long()!!)
        fun assertLedger(label: String?, l: GameSparks.Ledger, e: JsonObject) {
            check(label, "pocket", l.pocket, e["pocket"].long())
            check(label, "cycle", l.cycle, e["cycle"].long())
            check(label, "lifetime", l.lifetime, e["lifetime"].long())
            check(label, "debt", l.debt, e["debt"].long())
        }
        cases("sparks.vectors.json", "sparks-credit").forEach { v ->
            assertLedger(v.label, GameSparks.afterCredit(ledger(v.input), v.input["points"].long()!!), v.expected as JsonObject)
        }
        cases("sparks.vectors.json", "sparks-prestige").forEach { v ->
            assertLedger(v.label, GameSparks.afterPrestige(ledger(v.input)), v.expected as JsonObject)
        }
    }

    @Test
    fun `sparks-mint-preview rejoue la frappe sur la poche`() {
        cases("sparks.vectors.json", "sparks-mint-preview").forEach { v ->
            val i = v.input
            val glory = i["glory"].int()!!
            val minted = i["mintedLifetime"].int()!!
            val p = GameMint.sparksPreview(
                sparks = i["sparks"].long()!!, mintedLifetime = minted, held = i["held"].int()!!, glory = glory,
                levelCap = i["levelCap"].int(), steps = stepsOf(i, glory, minted),
                mythic = i["mythic"]?.jsonPrimitive?.booleanOrNull ?: false, debt = i["debt"].long() ?: 0L,
            )
            val e = v.expected as JsonObject
            check(v.label, "number", p.number, e["number"].int())
            check(v.label, "price", p.price, e["price"].int())
            check(v.label, "basePrice", p.basePrice, e["basePrice"].int())
            check(v.label, "costLevel", p.costLevel, e["costLevel"].int())
            assertWithMessage("${v.label} : costFactor").that(p.costFactor!!).isWithin(1e-9).of(e["costFactor"]!!.jsonPrimitive.doubleOrNull!!)
            check(v.label, "edition", wire(p.edition), e["edition"].text())
            check(v.label, "canMint", p.canMint, e["canMint"]!!.jsonPrimitive.booleanOrNull)
            check(v.label, "missingPoints", p.missingPoints, e["missingPoints"].long())
            check(v.label, "levelBefore", p.levelBefore, e["levelBefore"].int())
            check(v.label, "levelAfter", p.levelAfter, e["levelAfter"].int())
            check(v.label, "levelsLost", p.levelsLost, e["levelsLost"].int())
            check(v.label, "gloryGained", p.gloryGained, e["gloryGained"].int())
            check(v.label, "locked", p.locked?.let { Triple(it.tier.name.lowercase(), it.minHeld, requirementJson(it.requires)) },
                e["locked"].obj()?.let { Triple(it["tier"].text(), it["minHeld"].int(), requirementOf(it["requires"])) })
            check(v.label, "blockedBy", p.blockedBy?.name?.lowercase(), e["blockedBy"].text())
            check(v.label, "sparksDebt", p.sparksDebt, e["sparksDebt"].long())
        }
    }

    @Test
    fun `treasury-access et treasury-lock rejouent les reserves du rang`() {
        cases("sparks.vectors.json", "treasury-access").forEach { v ->
            val access = GameTreasury.reserveAccess(v.input["glory"].int()!!, v.input["mythic"]?.jsonPrimitive?.booleanOrNull ?: false)
            val expected = (v.expected as JsonElement).jsonArray
            check(v.label, "size", access.size, expected.size)
            access.zip(expected).forEach { (a, e) ->
                val o = e.jsonObject
                check(v.label, "key", a.key.name.lowercase(), o["key"].text())
                check(v.label, "minHeld", a.minHeld, o["minHeld"].int())
                check(v.label, "locked", a.locked, o["locked"]!!.jsonPrimitive.booleanOrNull)
                check(v.label, "requires", requirementJson(a.requires), requirementOf(o["requires"]))
            }
        }
        cases("sparks.vectors.json", "treasury-lock").forEach { v ->
            val lock = GameTreasury.lock(v.input["held"].int()!!, v.input["glory"].int()!!, v.input["mythic"]?.jsonPrimitive?.booleanOrNull ?: false)
            val e = (v.expected as JsonObject)["lock"].obj()
            check(v.label, "lock", lock?.let { Triple(it.tier.name.lowercase(), it.minHeld, requirementJson(it.requires)) },
                e?.let { Triple(it["tier"].text(), it["minHeld"].int(), requirementOf(it["requires"])) })
        }
    }

    @Test
    fun `meesh-display-edition rejoue la loi et le dessin`() {
        cases("meesh-display-edition.vectors.json", "meesh-display-edition").forEach { v ->
            val raw = v.input["n"]!!.jsonPrimitive.content
            val n = raw.toDoubleOrNull()?.takeIf { it.isFinite() }?.toInt() ?: return@forEach
            val e = v.expected as JsonObject
            check(v.label, "edition", wire(GameMint.edition(n)), e["edition"].text())
            check(v.label, "displayEdition", wire(GameMint.displayEdition(n)), e["displayEdition"].text())
        }
    }
}
