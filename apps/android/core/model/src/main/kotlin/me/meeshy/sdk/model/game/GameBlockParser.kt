package me.meeshy.sdk.model.game

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Lecture du bloc `game` — la seule porte d'entrée. MIROIR de `parseGameBlock`
 * (`packages/shared/types/game.ts`) et de `GameBlock.parse` (iOS).
 *
 * **Jamais d'exception, jamais de zéro inventé** : un bloc absent, `null`,
 * illisible ou partiel rend `null`. Un champ inconnu ajouté par un serveur plus
 * récent est ignoré. Les extensions optionnelles illisibles tombent seules
 * (mission personnelle, contenu du jour, fragments, étapes…) : niveau, Flamme et
 * coffre restent lus.
 */
public object GameBlockParser {

    /** Le bloc depuis le JSON du bloc lui-même. */
    public fun parse(text: String?): GameBlock? {
        if (text.isNullOrBlank()) return null
        val element = try {
            Json.parseToJsonElement(text)
        } catch (_: Exception) {
            return null
        }
        return parse(element)
    }

    public fun parse(element: JsonElement?): GameBlock? {
        val obj = element as? JsonObject ?: return null
        return try {
            parseObject(obj)
        } catch (_: GameParseException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    /** Le bloc porté par la clé `game` d'une charge `GET /me/engagement` (déjà déballée de `data`). */
    public fun fromEngagement(payload: JsonElement?): GameBlock? =
        parse((payload as? JsonObject)?.get("game"))

    public fun fromEngagement(text: String?): GameBlock? {
        if (text.isNullOrBlank()) return null
        val element = try {
            Json.parseToJsonElement(text)
        } catch (_: Exception) {
            return null
        }
        return fromEngagement(element)
    }

    private fun parseObject(obj: JsonObject): GameBlock = GameBlock(
        level = parseLevel(obj.reqObject("level")),
        glory = parseGlory(obj.reqObject("glory")),
        treasury = parseTreasury(obj.reqObject("treasury")),
        mint = parseMintPreview(obj.reqObject("mint")),
        missions = parseMissions(obj.reqObject("missions")),
        chest = parseChest(obj.reqObject("chest")),
        flame = parseFlame(obj.reqObject("flame")),
        boosts = parseBoosts(obj.reqObject("boosts")),
        guideSeen = obj.reqArray("guideSeen").strings("guideSeen"),
        starFragments = obj.lenient("starFragments", ::parseStarFragments),
    )

    private fun parseLevel(obj: JsonObject): GameLevel = GameLevel(
        level = obj.reqInt("level"),
        tier = obj.reqEnum("tier"),
        score = obj.reqLong("score"),
        floorScore = obj.reqLong("floorScore"),
        nextThreshold = obj.nullableLong("nextThreshold"),
        pointsToNext = obj.reqLong("pointsToNext"),
        progress = obj.reqDouble("progress"),
        record = obj.reqInt("record"),
        prestige = obj.reqInt("prestige"),
        canPrestige = obj.reqBool("canPrestige"),
        ladder = obj.nullableObject("ladder")?.let(::parseLadder),
        sparks = obj.optCountLong("sparks"),
        sparksCycle = obj.optCountLong("sparksCycle"),
        sparksLifetime = obj.optCountLong("sparksLifetime"),
        levelMaxLifetime = obj.optCount("levelMaxLifetime"),
        sparksDebt = obj.optCountLong("sparksDebt"),
    )

    private fun parseLadder(obj: JsonObject): GameLevelLadder = GameLevelLadder(
        level = obj.reqInt("level"),
        tier = obj.reqEnum("tier"),
        floorScore = obj.reqLong("floorScore"),
        nextThreshold = obj.nullableLong("nextThreshold"),
        pointsToNext = obj.reqLong("pointsToNext"),
        progress = obj.reqDouble("progress"),
        record = obj.reqInt("record"),
        cap = obj.nullableInt("cap"),
        isMax = obj.reqBool("isMax"),
        held = obj.optBool("held") ?: false,
        step = obj.lenient("step", ::parseStep),
        steps = obj.lenient("steps", ::parseStepCounts),
        levelMaxLifetime = obj.optCount("levelMaxLifetime"),
        pastCycleRecords = pastCycleRecords(obj["pastCycleRecords"]),
    )

    private fun pastCycleRecords(element: JsonElement?): List<Int>? {
        val array = element as? JsonArray ?: return null
        val records = array.map { (it as? JsonPrimitive)?.takeUnless { p -> p is JsonNull || p.isString }?.intOrNull }
        return if (records.any { it == null }) null else records.filterNotNull()
    }

    private fun parseStep(obj: JsonObject): GameLevelStep = GameLevelStep(
        level = obj.reqInt("level"),
        kind = obj.reqEnum("kind"),
        target = obj.reqLong("target"),
        current = obj.reqLong("current"),
        met = obj.reqBool("met"),
        rank = obj.nullableEnum<GloryRank>("rank"),
    )

    private fun parseStepCounts(obj: JsonObject): GameLevelStepCounts = GameLevelStepCounts(
        minted = obj.reqInt("minted"),
        missionsDone = obj.reqInt("missionsDone"),
        flameRecord = obj.reqInt("flameRecord"),
    )

    private fun parseGlory(obj: JsonObject): GameGlory = GameGlory(
        glory = obj.reqInt("glory"),
        rank = obj.reqEnum("rank"),
        division = obj.nullableInt("division")?.also { if (it !in 1..3) throw GameParseException("division") },
        division5 = obj.optInt("division5")?.takeIf { it in 1..5 },
        next = obj.nullableObject("next")?.let(::parseGloryStep),
        gloryMissing = obj.nullableInt("gloryMissing"),
        progress = obj.reqDouble("progress"),
        mythic = obj.lenient("mythic", ::parseMythicSeat)?.takeIf { it.isValid },
    )

    private fun parseGloryStep(obj: JsonObject): GloryStep = GloryStep(
        rank = obj.reqEnum("rank"),
        division = obj.reqInt("division").also { if (it !in 1..3) throw GameParseException("division") },
        division5 = obj.optInt("division5")?.takeIf { it in 1..5 },
        minGlory = obj.reqInt("minGlory"),
    )

    private fun parseMythicSeat(obj: JsonObject): MythicSeatRef =
        MythicSeatRef(number = obj.reqInt("number"), edition = obj.reqInt("edition"))
}
