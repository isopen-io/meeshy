@file:OptIn(ExperimentalSerializationApi::class)

package me.meeshy.sdk.model.game

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

/*
 * Flamme, boosts, trésor et frappe du bloc `game` de `GET /me/engagement`.
 * MIROIR de `gameFlameSchema` / `gameBoostsSchema` / `gameTreasurySchema` /
 * `mintPreviewSchema` (`packages/shared/types/game.ts`) et de
 * `GameBlockModels.swift` / `GameTreasury.swift` / `GameMint.swift` (iOS).
 */

@Serializable
public data class GameFlame(
    val days: Int,
    @EncodeDefault val form: FlameFormKey? = null,
    val bonusPercent: Int,
    val freezes: Int,
    val maxFreezes: Int,
    val freezePrice: Int,
    val relightPrice: Int,
    val status: FlameStatus,
    val canRelight: Boolean,
)

/** L'Heure du Prisme : [début, fin[ en minutes de la journée locale. */
@Serializable
public data class PrismHour(val startMinute: Int, val endMinute: Int, val multiplier: Double) {
    public fun contains(minuteOfDay: Int): Boolean = minuteOfDay in startMinute until endMinute
}

@Serializable
public data class GameBoosts(
    /** `1` ou `1,25`. */
    val tailwind: Double,
    @EncodeDefault val prismHour: PrismHour? = null,
)

/** Le rang de Gloire qu'une réserve exige : division héritée (1–3) ET à cinq crans (V = 5 … I = 1). */
@Serializable
public data class RankRequirement(val rank: GloryRank, val division: Int, val division5: Int)

@Serializable
public data class TreasuryNext(val key: TreasuryTierKey, val minHeld: Int, val missing: Int)

/** L'état d'une réserve pour CE compte : fermée ou ouverte par son rang (#10848). */
@Serializable
public data class TreasuryAccess(
    val key: TreasuryTierKey,
    val minHeld: Int,
    val locked: Boolean,
    /** `null` : ouverte à tous. */
    @EncodeDefault val requires: RankRequirement? = null,
)

@Serializable
public data class TreasuryStanding(
    val held: Int,
    /** `null` sans Meesh gardée. */
    @EncodeDefault val tier: TreasuryTierKey? = null,
    @EncodeDefault val next: TreasuryNext? = null,
    /** `null` devant un serveur antérieur ; une réserve inconnue est sautée, jamais la liste entière. */
    @EncodeDefault val access: List<TreasuryAccess>? = null,
)

@Serializable
public data class GameMintLadder(val levelBefore: Int, val levelAfter: Int, val levelsLost: Int)

/** La réserve du trésor que le rang n'ouvre pas encore et qui barre la frappe (#10848). */
@Serializable
public data class GameMintLock(val tier: TreasuryTierKey, val minHeld: Int, val requires: RankRequirement)

/**
 * Ce que la frappe coûterait et rapporterait, avant confirmation. [edition] est
 * `null` quand le serveur en sert une que ce client ne connaît pas : la frappe
 * reste lisible, la pièce est seulement montrée sans habillage d'édition.
 */
@Serializable
public data class GameMintPreview(
    val number: Int,
    val price: Int,
    @EncodeDefault val edition: MeeshEdition? = null,
    val canMint: Boolean,
    val missingPoints: Long,
    val levelBefore: Int,
    val levelAfter: Int,
    val levelsLost: Int,
    val gloryGained: Int,
    @EncodeDefault val ladder: GameMintLadder? = null,
    @EncodeDefault val basePrice: Int? = null,
    @EncodeDefault val costFactor: Double? = null,
    @EncodeDefault val costLevel: Int? = null,
    @EncodeDefault val locked: GameMintLock? = null,
    @EncodeDefault val sparksDebt: Long? = null,
    @EncodeDefault val blockedBy: MintBlock? = null,
) {
    /** Ce qui empêche la frappe, dans l'ordre où l'écran doit le dire : la dette, la réserve fermée, les étincelles. */
    public sealed interface Blocker {
        public data class SparksDebt(val amount: Long) : Blocker
        public data class TreasuryLocked(val lock: GameMintLock) : Blocker
        public data class MissingSparks(val amount: Long) : Blocker
    }

    val blocker: Blocker?
        get() = when {
            blockedBy == MintBlock.Debt || (sparksDebt ?: 0L) > 0L -> Blocker.SparksDebt(sparksDebt ?: 0L)
            locked != null -> Blocker.TreasuryLocked(locked)
            missingPoints > 0L -> Blocker.MissingSparks(missingPoints)
            else -> null
        }

    /** Les niveaux que l'écran montre : la lecture ouverte par le rang, ou ceux d'hier. */
    val shownLevels: GameMintLadder
        get() = ladder ?: GameMintLadder(levelBefore, levelAfter, levelsLost)
}

internal fun parseFlame(obj: JsonObject): GameFlame = GameFlame(
    days = obj.reqInt("days"),
    form = obj.nullableEnum("form"),
    bonusPercent = obj.reqInt("bonusPercent"),
    freezes = obj.reqInt("freezes"),
    maxFreezes = obj.reqInt("maxFreezes"),
    freezePrice = obj.reqInt("freezePrice"),
    relightPrice = obj.reqInt("relightPrice"),
    status = obj.reqEnum("status"),
    canRelight = obj.reqBool("canRelight"),
)

private fun parsePrismHour(obj: JsonObject): PrismHour = PrismHour(
    startMinute = obj.reqInt("startMinute"),
    endMinute = obj.reqInt("endMinute"),
    multiplier = obj.reqDouble("multiplier"),
)

internal fun parseBoosts(obj: JsonObject): GameBoosts = GameBoosts(
    tailwind = obj.reqDouble("tailwind"),
    prismHour = obj.nullableObject("prismHour")?.let(::parsePrismHour),
)

internal fun parseRankRequirement(obj: JsonObject): RankRequirement = RankRequirement(
    rank = obj.reqEnum("rank"),
    division = obj.reqInt("division"),
    division5 = obj.reqInt("division5"),
)

private fun parseTreasuryAccess(obj: JsonObject): TreasuryAccess = TreasuryAccess(
    key = obj.reqEnum("key"),
    minHeld = obj.reqInt("minHeld"),
    locked = obj.reqBool("locked"),
    requires = obj.nullableObject("requires")?.let(::parseRankRequirement),
)

private fun parseTreasuryNext(obj: JsonObject): TreasuryNext = TreasuryNext(
    key = obj.reqEnum("key"),
    minHeld = obj.reqInt("minHeld"),
    missing = obj.reqInt("missing"),
)

private fun parseAccessList(array: JsonArray): List<TreasuryAccess> = array.mapNotNull { element ->
    try {
        parseTreasuryAccess(element as? JsonObject ?: return@mapNotNull null)
    } catch (_: GameParseException) {
        null
    }
}

internal fun parseTreasury(obj: JsonObject): TreasuryStanding = TreasuryStanding(
    held = obj.reqInt("held"),
    tier = obj.nullableEnum("tier"),
    next = obj.nullableObject("next")?.let(::parseTreasuryNext),
    access = (obj["access"] as? JsonArray)?.let(::parseAccessList),
)

private fun parseMintLadder(obj: JsonObject): GameMintLadder = GameMintLadder(
    levelBefore = obj.reqInt("levelBefore"),
    levelAfter = obj.reqInt("levelAfter"),
    levelsLost = obj.reqInt("levelsLost"),
)

private fun parseMintLock(obj: JsonObject): GameMintLock = GameMintLock(
    tier = obj.reqEnum("tier"),
    minHeld = obj.reqInt("minHeld"),
    requires = parseRankRequirement(obj.reqObject("requires")),
)

internal fun parseMintPreview(obj: JsonObject): GameMintPreview = GameMintPreview(
    number = obj.reqInt("number"),
    price = obj.reqInt("price"),
    edition = enumFromWire<MeeshEdition>(obj.optString("edition")),
    canMint = obj.reqBool("canMint"),
    missingPoints = obj.reqLong("missingPoints"),
    levelBefore = obj.reqInt("levelBefore"),
    levelAfter = obj.reqInt("levelAfter"),
    levelsLost = obj.reqInt("levelsLost"),
    gloryGained = obj.reqInt("gloryGained"),
    ladder = obj.lenient("ladder", ::parseMintLadder),
    basePrice = obj.optCount("basePrice"),
    costFactor = obj.optDouble("costFactor"),
    costLevel = obj.optCount("costLevel"),
    locked = obj.lenient("locked", ::parseMintLock),
    sparksDebt = obj.optCountLong("sparksDebt"),
    blockedBy = enumFromWire<MintBlock>(obj.optString("blockedBy")),
)
