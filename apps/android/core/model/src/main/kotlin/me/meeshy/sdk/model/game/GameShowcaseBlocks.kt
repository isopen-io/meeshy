@file:OptIn(ExperimentalSerializationApi::class)

package me.meeshy.sdk.model.game

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/*
 * Vitrine, Atlas, Prestige, visibilités et raretés du bloc `game` (vague 2,
 * #9387 à #9392, #9390, #9489) et le groupe [GameWave2] des extensions. MIROIR de
 * `GameWave2Models.swift` (iOS) et de `packages/shared/types/game-v2.ts`.
 *
 * Toutes les extensions sont OPTIONNELLES et TOLÉRANTES : un serveur antérieur ne
 * les sert pas, et une extension que ce client ne sait pas lire tombe SEULE
 * (`null`) — elle n'emporte jamais le bloc ni les autres extensions.
 */

@Serializable
public enum class ShowcaseVisibility {
    @SerialName("everyone") Everyone,
    @SerialName("friends") Friends,
    @SerialName("me") Me,
}

@Serializable
public data class GameTrophyItem(
    val key: String,
    /** ISO 8601. */
    val awardedAt: String,
)

@Serializable
public data class GameTrophiesBlock(
    val items: List<GameTrophyItem>,
    /** La vitrine, dans l'ordre : les clés RANGÉES d'abord, puis le reste du plus précieux au moins précieux. */
    val order: List<String>,
)

@Serializable
public data class AtlasStamp(val language: String, val stampedOn: String)

@Serializable
public data class AtlasPending(val language: String, val sent: Boolean, val received: Boolean)

@Serializable
public data class GameAtlasBlock(
    val stamped: Int,
    val total: Int,
    val stamps: List<AtlasStamp>,
    val pending: List<AtlasPending>,
)

@Serializable
public data class GamePrestigeBlock(
    /** Les étoiles posées, de 0 à 5. */
    val stars: Int,
    val max: Int,
    val canPrestige: Boolean,
    val gloryOnPass: Int,
)

@Serializable
public data class GameVisibility(
    val showcase: ShowcaseVisibility,
    val rank: ShowcaseVisibility,
    val treasury: ShowcaseVisibility,
    /** Privé par défaut : une langue peut révéler une origine ou une conviction. */
    val atlas: ShowcaseVisibility,
)

/** Les cinq raretés d'un succès, de la plus commune à la plus rare. */
@Serializable
public enum class AchievementRarity {
    @SerialName("common") Common,
    @SerialName("rare") Rare,
    @SerialName("epic") Epic,
    @SerialName("legendary") Legendary,
    @SerialName("mythic") Mythic,
}

/**
 * La rareté MESURÉE d'un succès (#9390, #9489) : [holders] titulaires sur
 * [population] comptes. Le client reste FAIL-CLOSED : une rareté ne se MONTRE
 * qu'avec assez de titulaires et de comptes ([visibleRarity]).
 */
@Serializable
public data class GameRarityEntry(
    val rarity: AchievementRarity,
    val holders: Int,
    val population: Int,
) {
    /** La rareté qu'on a le DROIT de montrer, `null` sous 20 titulaires ou 1 000 comptes. */
    val visibleRarity: AchievementRarity?
        get() = if (isShareDisplayable(holders, population)) rarity else null

    /** La part des comptes, de 0 à 100. */
    val sharePercent: Double get() = holders.toDouble() / maxOf(1, population) * 100

    public companion object {
        /** Population minimale d'une mesure. */
        public const val MIN_POPULATION: Int = 1000

        /** Titulaires minimaux avant d'afficher un pourcentage. */
        public const val MIN_DISPLAY_HOLDERS: Int = 20

        public fun isShareDisplayable(holders: Int, population: Int): Boolean =
            holders >= MIN_DISPLAY_HOLDERS && population >= MIN_POPULATION
    }
}

/** Les extensions du bloc `game`, groupées : un client sans elles les lit `null`. */
public data class GameWave2(
    val league: GameLeagueBlock? = null,
    val duo: GameDuoBlock? = null,
    val season: GameSeasonBlock? = null,
    val seasonUpcoming: GameUpcomingSeasonBlock? = null,
    val trophies: GameTrophiesBlock? = null,
    val atlas: GameAtlasBlock? = null,
    val prestige: GamePrestigeBlock? = null,
    val visibility: GameVisibility? = null,
    val achievementRarities: Map<String, GameRarityEntry>? = null,
) {
    /**
     * La saison est SERVIE dès qu'une autre extension de la vague 2 l'est, même nulle
     * (aucune saison ne court) : le décodage ne distingue pas absente et nulle.
     */
    val seasonServed: Boolean
        get() = season != null || league != null || duo != null || trophies != null ||
            atlas != null || prestige != null || visibility != null

    public companion object {
        public val EMPTY: GameWave2 = GameWave2()
    }
}

internal fun JsonElement.intStrict(key: String): Int =
    (this as? JsonPrimitive)?.takeUnless { it is JsonNull || it.isString }?.intOrNull
        ?: throw GameParseException(key)

internal fun parseTrophiesBlock(obj: JsonObject): GameTrophiesBlock = GameTrophiesBlock(
    items = obj.reqArray("items").map {
        val item = it as? JsonObject ?: throw GameParseException("items")
        GameTrophyItem(key = item.reqString("key"), awardedAt = item.reqString("awardedAt"))
    },
    order = obj.reqArray("order").strings("order"),
)

internal fun parseAtlasBlock(obj: JsonObject): GameAtlasBlock = GameAtlasBlock(
    stamped = obj.reqInt("stamped"),
    total = obj.reqInt("total"),
    stamps = obj.reqArray("stamps").map {
        val stamp = it as? JsonObject ?: throw GameParseException("stamps")
        AtlasStamp(language = stamp.reqString("language"), stampedOn = stamp.reqString("stampedOn"))
    },
    pending = obj.reqArray("pending").map {
        val pending = it as? JsonObject ?: throw GameParseException("pending")
        AtlasPending(
            language = pending.reqString("language"),
            sent = pending.reqBool("sent"),
            received = pending.reqBool("received"),
        )
    },
)

internal fun parsePrestigeBlock(obj: JsonObject): GamePrestigeBlock = GamePrestigeBlock(
    stars = obj.reqInt("stars"),
    max = obj.reqInt("max"),
    canPrestige = obj.reqBool("canPrestige"),
    gloryOnPass = obj.reqInt("gloryOnPass"),
)

internal fun parseVisibility(obj: JsonObject): GameVisibility = GameVisibility(
    showcase = obj.reqEnum("showcase"),
    rank = obj.reqEnum("rank"),
    treasury = obj.reqEnum("treasury"),
    atlas = obj.reqEnum("atlas"),
)

private fun parseRarityEntry(obj: JsonObject): GameRarityEntry = GameRarityEntry(
    rarity = obj.reqEnum("rarity"),
    holders = obj.reqInt("holders"),
    population = obj.reqInt("population"),
)

/** Une entrée illisible tombe SEULE ; la carte vide vaut `null`. */
internal fun parseRarities(obj: JsonObject): Map<String, GameRarityEntry>? {
    val raw = obj.optObject("achievementRarities") ?: return null
    val readable = raw.mapNotNull { (key, value) ->
        val entry = (value as? JsonObject)?.let {
            try {
                parseRarityEntry(it)
            } catch (_: IllegalArgumentException) {
                null
            }
        }
        entry?.let { key to it }
    }.toMap()
    return readable.ifEmpty { null }
}
