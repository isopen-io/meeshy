package me.meeshy.sdk.model.game.engagement

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GameParseException
import me.meeshy.sdk.model.game.MintBlock
import me.meeshy.sdk.model.game.enumFromWire
import me.meeshy.sdk.model.game.optCount
import me.meeshy.sdk.model.game.optCountLong
import me.meeshy.sdk.model.game.optDouble
import me.meeshy.sdk.model.game.optInt
import me.meeshy.sdk.model.game.optObject
import me.meeshy.sdk.model.game.optString
import me.meeshy.sdk.model.game.reqArray
import me.meeshy.sdk.model.game.reqBool
import me.meeshy.sdk.model.game.reqInt
import me.meeshy.sdk.model.game.reqObject
import me.meeshy.sdk.model.game.reqString

/**
 * La charge de `GET /me/engagement` — la forme EXACTE que la passerelle rend, MIROIR de `EngagementProgressPayload`
 * (`packages/shared/types/engagement.ts`) et de `APIEngagementProgress` (iOS).
 *
 * `axisKey` et `milestoneKey` restent des CHAÎNES : un axe ajouté au serveur avant la mise à jour de l'app ne fait
 * jamais échouer le décodage (le résolveur ignore ce qu'il ne connaît pas). `milestoneType`, lui, est une
 * énumération FERMÉE : une nature inconnue refuse la charge entière (fail-closed à la FORME).
 */
public data class ApiEngagementProgress(
    val counters: List<Counter>,
    val milestones: List<Milestone>,
    val streak: Streak,
    val level: Level,
    val meesh: Meesh? = null,
    val elan: Elan? = null,
    /** `familyId -> plus grande valeur que le produit peut rendre vraie` ; absente ⇒ ampleurs masquées. */
    val achievementReach: Map<String, Int>? = null,
    /** Le bloc du jeu — `null` devant un serveur antérieur ou un bloc illisible. */
    val game: GameBlock? = null,
    /** Marqueur d'ORDRE de l'état du jeu (ms serveur) — `null` devant une passerelle antérieure. */
    val gameRevision: Long? = null,
) {
    public data class Counter(val axisKey: String, val count: Int, val points: Int? = null)

    public data class Milestone(val milestoneType: EngagementMilestoneType, val milestoneKey: String, val reachedAt: String)

    public data class Streak(val currentStreakDays: Int, val longestStreakDays: Int)

    public data class Level(
        /** La poche — nom historique, toujours servi. */
        val engagementScore: Int,
        val sparks: Long? = null,
        val sparksCycle: Long? = null,
        val sparksLifetime: Long? = null,
        val levelMaxLifetime: Long? = null,
        val sparksDebt: Long? = null,
    ) {
        /** La poche : `sparks` servi, sinon `engagementScore`. */
        val pocket: Long get() = sparks ?: engagementScore.toLong()
    }

    public data class Elan(
        val factor: Double,
        val activeFamilyCount: Int,
        val hasStanding: Boolean,
        val windowDays: Int,
        val activeFamilies: List<String>? = null,
    )

    public data class Meesh(
        val balance: Int,
        val mintedLifetime: Int,
        val debitablePoints: Int,
        val floorPoints: Int,
        val missingPoints: Int,
        val mintCost: Int,
        val firstMintedAt: String? = null,
        val lastMintedAt: String? = null,
        val baseMintCost: Int? = null,
        val costFactor: Double? = null,
        val sparksDebt: Int? = null,
        val blockedBy: MintBlock? = null,
    )

    public companion object {
        /** Aucune activité — la charge qu'un compte neuf reçoit. */
        public val empty: ApiEngagementProgress = ApiEngagementProgress(
            counters = emptyList(),
            milestones = emptyList(),
            streak = Streak(0, 0),
            level = Level(engagementScore = 0),
        )
    }
}

/** Lecture tolérante de la charge : illisible ⇒ `null`, jamais une exception. */
public object EngagementProgressParser {

    public fun parse(text: String?): ApiEngagementProgress? {
        if (text.isNullOrBlank()) return null
        val element = try {
            Json.parseToJsonElement(text)
        } catch (_: Exception) {
            return null
        }
        return parse(element)
    }

    /** [element] est la charge déjà déballée de `data`. */
    public fun parse(element: JsonElement?): ApiEngagementProgress? {
        val obj = element as? JsonObject ?: return null
        return try {
            ApiEngagementProgress(
                counters = obj.reqArray("counters").map { parseCounter(it.asObject()) },
                milestones = obj.reqArray("milestones").map { parseMilestone(it.asObject()) },
                streak = obj.reqObject("streak").let {
                    ApiEngagementProgress.Streak(it.reqInt("currentStreakDays"), it.reqInt("longestStreakDays"))
                },
                level = parseLevel(obj.reqObject("level")),
                meesh = obj.lenientBlock("meesh", ::parseMeesh),
                elan = obj.lenientBlock("elan", ::parseElan),
                achievementReach = parseReach(obj["achievementReach"]),
                game = GameBlockParser.parse(obj["game"]),
                gameRevision = obj.optCountLong("gameRevision"),
            )
        } catch (_: GameParseException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    private fun JsonElement.asObject(): JsonObject = this as? JsonObject ?: throw GameParseException("object")

    /** Un bloc optionnel illisible tombe SEUL : il ne doit pas emporter la progression entière. */
    private fun <T> JsonObject.lenientBlock(key: String, parse: (JsonObject) -> T): T? {
        val block = optObject(key) ?: return null
        return try {
            parse(block)
        } catch (_: GameParseException) {
            null
        }
    }

    private fun parseCounter(o: JsonObject) =
        ApiEngagementProgress.Counter(o.reqString("axisKey"), o.reqInt("count"), o.optInt("points"))

    private fun parseMilestone(o: JsonObject): ApiEngagementProgress.Milestone {
        val type = EngagementMilestoneType.fromWire(o.reqString("milestoneType"))
            ?: throw GameParseException("milestoneType")
        return ApiEngagementProgress.Milestone(type, o.reqString("milestoneKey"), o.reqString("reachedAt"))
    }

    private fun parseLevel(o: JsonObject) = ApiEngagementProgress.Level(
        engagementScore = o.reqInt("engagementScore"),
        sparks = o.optCountLong("sparks"),
        sparksCycle = o.optCountLong("sparksCycle"),
        sparksLifetime = o.optCountLong("sparksLifetime"),
        levelMaxLifetime = o.optCountLong("levelMaxLifetime"),
        sparksDebt = o.optCountLong("sparksDebt"),
    )

    private fun parseElan(o: JsonObject) = ApiEngagementProgress.Elan(
        factor = o.optDouble("factor") ?: throw GameParseException("factor"),
        activeFamilyCount = o.reqInt("activeFamilyCount"),
        hasStanding = o.reqBool("hasStanding"),
        windowDays = o.reqInt("windowDays"),
        activeFamilies = (o["activeFamilies"] as? JsonArray)?.mapNotNull { (it as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { p -> p.isString }?.content },
    )

    private fun parseMeesh(o: JsonObject) = ApiEngagementProgress.Meesh(
        balance = o.reqInt("balance"),
        mintedLifetime = o.reqInt("mintedLifetime"),
        debitablePoints = o.reqInt("debitablePoints"),
        floorPoints = o.reqInt("floorPoints"),
        missingPoints = o.reqInt("missingPoints"),
        mintCost = o.reqInt("mintCost"),
        firstMintedAt = o.optString("firstMintedAt"),
        lastMintedAt = o.optString("lastMintedAt"),
        baseMintCost = o.optCount("baseMintCost"),
        costFactor = o.optDouble("costFactor"),
        sparksDebt = o.optCount("sparksDebt"),
        blockedBy = enumFromWire<MintBlock>(o.optString("blockedBy")),
    )

    private fun parseReach(element: JsonElement?): Map<String, Int>? {
        val obj = element as? JsonObject ?: return null
        return obj.entries.mapNotNull { (key, value) -> obj.optInt(key)?.let { key to it } }.toMap()
    }
}
