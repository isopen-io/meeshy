@file:OptIn(ExperimentalSerializationApi::class)

package me.meeshy.sdk.model.game

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/*
 * Missions du jour, mission personnelle et coffre du bloc `game` de
 * `GET /me/engagement`. MIROIR de `gameMissionsSchema` / `gameChestSchema`
 * (`packages/shared/types/game.ts`) et de `GameBlockModels.swift` /
 * `GamePersonalMission.swift` / `GameChest.swift` (iOS).
 *
 * Les clés optionnelles s'encodent en `null` (`@EncodeDefault`) : la copie de
 * cache relue hors ligne est la réponse serveur clé pour clé.
 */

@Serializable
public data class GameMission(
    val id: String,
    val templateKey: String,
    val difficulty: MissionDifficulty,
    /** Chaîne OUVERTE : un signal ajouté au serveur ne casse jamais l'écran. */
    val signal: String,
    val prism: Boolean,
    val target: Int,
    val progress: Int,
    val reward: Int,
    val glory: Int,
    /** ISO 8601, `null` tant que la mission n'est pas finie. */
    @EncodeDefault val completedAt: String? = null,
) {
    val isCompleted: Boolean get() = completedAt != null
}

/**
 * La mission personnelle du jour (#9539) : une mission de plus, servie à CÔTÉ des
 * trois (`missions.personal`), avec sa plage et son état. Ses champs sont à PLAT
 * sur le fil, comme ceux d'une mission.
 */
@Serializable
public data class GamePersonalMission(
    val id: String,
    val templateKey: String,
    val difficulty: MissionDifficulty,
    val signal: String,
    val prism: Boolean,
    val target: Int,
    val progress: Int,
    val reward: Int,
    val glory: Int,
    @EncodeDefault val completedAt: String? = null,
    val startsAt: String,
    val endsAt: String,
    val state: PersonalMissionState,
) {
    val mission: GameMission
        get() = GameMission(id, templateKey, difficulty, signal, prism, target, progress, reward, glory, completedAt)
}

@Serializable
public data class GameMissions(
    val dayKey: String,
    val prismDay: Boolean,
    /** Niveau 5 atteint. */
    val unlocked: Boolean,
    val items: List<GameMission>,
    val rerollAvailable: Boolean,
    /** `null` d'un ancien serveur ou si illisible : elle tombe SEULE. */
    @EncodeDefault val personal: GamePersonalMission? = null,
)

/** Ce que le coffre peut contenir — affiché avant l'ouverture. */
@Serializable
public data class ChestOdds(
    val minPoints: Int,
    val maxPoints: Int,
    val fragment: Double,
    val freeze: Double,
    @EncodeDefault val minGlory: Int? = null,
    @EncodeDefault val maxGlory: Int? = null,
    @EncodeDefault val bonusWhole: Double? = null,
    @EncodeDefault val bonusFifth: Double? = null,
)

/** Le contenu du coffre ouvert. `points` est le TOTAL crédité, prime comprise. */
@Serializable
public data class DailyChest(
    val points: Int,
    val fragment: Boolean,
    val freeze: Boolean,
    @EncodeDefault val glory: Int = 0,
    @EncodeDefault val bonus: ChestBonus? = null,
    @EncodeDefault val bonusPoints: Int = 0,
)

/** Le contenu CERTAIN du coffre du jour et ses deux primes possibles, dits avant l'ouverture. */
@Serializable
public data class ChestContent(
    val points: Int,
    val glory: Int,
    @EncodeDefault val bonusWhole: Int? = null,
    @EncodeDefault val bonusFifth: Int? = null,
)

/** Les fragments d'étoile collectés à vie — le serveur seul les compte. */
@Serializable
public data class StarFragmentsTotal(val collected: Int)

@Serializable
public data class GameChest(
    val status: ChestStatus,
    val odds: ChestOdds,
    /** Révélé une fois ouvert ; `null` avant. */
    @EncodeDefault val reward: DailyChest? = null,
    /** `null` d'un serveur antérieur, avant le tirage des missions, ou si illisible : il tombe SEUL. */
    @EncodeDefault val today: ChestContent? = null,
)

internal fun parseMission(obj: JsonObject): GameMission = GameMission(
    id = obj.reqString("id").also { if (it.isEmpty()) throw GameParseException("id") },
    templateKey = obj.reqString("templateKey"),
    difficulty = obj.reqEnum("difficulty"),
    signal = obj.reqString("signal"),
    prism = obj.reqBool("prism"),
    target = obj.reqInt("target"),
    progress = obj.reqInt("progress"),
    reward = obj.reqInt("reward"),
    glory = obj.reqInt("glory"),
    completedAt = obj.nullableString("completedAt"),
)

internal fun parsePersonalMission(obj: JsonObject): GamePersonalMission {
    val base = parseMission(obj)
    return GamePersonalMission(
        id = base.id,
        templateKey = base.templateKey,
        difficulty = base.difficulty,
        signal = base.signal,
        prism = base.prism,
        target = base.target,
        progress = base.progress,
        reward = base.reward,
        glory = base.glory,
        completedAt = base.completedAt,
        startsAt = obj.reqString("startsAt"),
        endsAt = obj.reqString("endsAt"),
        state = obj.reqEnum("state"),
    )
}

internal fun parseMissions(obj: JsonObject): GameMissions = GameMissions(
    dayKey = obj.reqString("dayKey"),
    prismDay = obj.reqBool("prismDay"),
    unlocked = obj.reqBool("unlocked"),
    items = obj.reqArray("items").map { parseMission(it as? JsonObject ?: throw GameParseException("items")) },
    rerollAvailable = obj.reqBool("rerollAvailable"),
    personal = obj.lenient("personal", ::parsePersonalMission),
)

internal fun parseChestOdds(obj: JsonObject): ChestOdds = ChestOdds(
    minPoints = obj.reqInt("minPoints"),
    maxPoints = obj.reqInt("maxPoints"),
    fragment = obj.reqDouble("fragment"),
    freeze = obj.reqDouble("freeze"),
    minGlory = obj.optCount("minGlory"),
    maxGlory = obj.optCount("maxGlory"),
    bonusWhole = obj.optDouble("bonusWhole"),
    bonusFifth = obj.optDouble("bonusFifth"),
)

/** Tolérant sur la prime : une prime inconnue d'un serveur plus récent se lit `null`, le coffre reste lu. */
internal fun parseDailyChest(obj: JsonObject): DailyChest = DailyChest(
    points = obj.reqInt("points"),
    fragment = obj.reqBool("fragment"),
    freeze = obj.reqBool("freeze"),
    glory = obj.optCount("glory") ?: 0,
    bonus = enumFromWire<ChestBonus>(obj.optString("bonus")),
    bonusPoints = obj.optCount("bonusPoints") ?: 0,
)

internal fun parseChestContent(obj: JsonObject): ChestContent = ChestContent(
    points = obj.reqInt("points"),
    glory = obj.reqInt("glory"),
    bonusWhole = obj.optCount("bonusWhole"),
    bonusFifth = obj.optCount("bonusFifth"),
)

internal fun parseStarFragments(obj: JsonObject): StarFragmentsTotal = StarFragmentsTotal(obj.reqInt("collected"))

internal fun parseChest(obj: JsonObject): GameChest = GameChest(
    status = obj.reqEnum("status"),
    odds = parseChestOdds(obj.reqObject("odds")),
    reward = obj.nullableObject("reward")?.let(::parseDailyChest),
    today = obj.lenient("today", ::parseChestContent),
)
