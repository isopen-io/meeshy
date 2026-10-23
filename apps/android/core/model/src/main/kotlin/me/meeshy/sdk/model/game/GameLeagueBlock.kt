@file:OptIn(ExperimentalSerializationApi::class)

package me.meeshy.sdk.model.game

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/*
 * L'extension `league` du bloc `game` (vague 2, #9384) et ses clés fermées.
 * MIROIR de `GameLeagueBlock` (iOS, `GameWave2Models.swift`) et de
 * `packages/shared/types/game-v2.ts`.
 *
 * Confidentialité par construction : la ligue PUBLIQUE ne sert aucun identifiant
 * de joueur (un pseudonyme, un rang, le total de la semaine — rien d'une heure
 * d'activité). La ligue AMIS, restreinte aux amis acceptés, sert des identifiants.
 */

/** Les huit ligues, de la plus basse à la plus haute. */
@Serializable
public enum class LeagueKey {
    @SerialName("quartz") Quartz,
    @SerialName("ambre") Ambre,
    @SerialName("jade") Jade,
    @SerialName("saphir") Saphir,
    @SerialName("rubis") Rubis,
    @SerialName("amethyste") Amethyste,
    @SerialName("diamant") Diamant,
    @SerialName("prisme") Prisme,
    ;

    /** De 0 (Quartz) à 7 (Prisme). */
    public val index: Int get() = ordinal

    /** La ligue au-dessus, `null` au Prisme. */
    public val next: LeagueKey? get() = entries.getOrNull(ordinal + 1)

    /** La ligue en dessous, `null` au Quartz. */
    public val previous: LeagueKey? get() = entries.getOrNull(ordinal - 1)
}

@Serializable
public enum class LeagueZone {
    @SerialName("promotion") Promotion,
    @SerialName("safe") Safe,
    @SerialName("relegation") Relegation,
}

@Serializable
public enum class LeagueCup {
    @SerialName("gold") Gold,
    @SerialName("silver") Silver,
    @SerialName("bronze") Bronze,
}

/**
 * Qui peut jouer la ligue PUBLIQUE. Le niveau record d'abord, puis la majorité
 * vérifiée (fail-closed), puis le consentement.
 */
@Serializable
public enum class LeagueAccess {
    @SerialName("locked") Locked,
    @SerialName("minor") Minor,
    @SerialName("consent-required") ConsentRequired,
    @SerialName("open") Open,
}

/** Le dimanche 20 h, heure locale : la fermeture de la semaine. */
@Serializable
public data class LeagueCloses(val dayKey: String, val minuteOfDay: Int)

/** Ma place dans le groupe de la ligue publique. */
@Serializable
public data class LeagueCurrent(
    val league: LeagueKey,
    val groupId: String,
    val groupSize: Int,
    val rank: Int,
    val weekPoints: Int,
    val zone: LeagueZone,
    @EncodeDefault val cup: LeagueCup? = null,
    /** `0` dans la zone de montée, `null` au sommet. */
    @EncodeDefault val pointsToPromotion: Int? = null,
)

/** La ligue Amis, toujours disponible. */
@Serializable
public data class LeagueFriends(val rank: Int, val size: Int, val weekPoints: Int)

@Serializable
public data class GameLeagueBlock(
    /** Niveau record de 10 atteint. */
    val unlocked: Boolean,
    val access: LeagueAccess,
    /** Le pseudonyme que les autres voient ; `null` tant que le joueur n'est pas dans la ligue publique. */
    @EncodeDefault val pseudonym: String? = null,
    val weekKey: String,
    val closes: LeagueCloses,
    /** `null` : pas (encore) placé dans un groupe de la ligue publique. */
    @EncodeDefault val current: LeagueCurrent? = null,
    val friends: LeagueFriends,
)

internal fun parseLeagueCloses(obj: JsonObject): LeagueCloses =
    LeagueCloses(dayKey = obj.reqString("dayKey"), minuteOfDay = obj.reqInt("minuteOfDay"))

internal fun parseLeagueCurrent(obj: JsonObject): LeagueCurrent = LeagueCurrent(
    league = obj.reqEnum("league"),
    groupId = obj.reqString("groupId"),
    groupSize = obj.reqInt("groupSize"),
    rank = obj.reqInt("rank"),
    weekPoints = obj.reqInt("weekPoints"),
    zone = obj.reqEnum("zone"),
    cup = obj.nullableEnum<LeagueCup>("cup"),
    pointsToPromotion = obj.nullableInt("pointsToPromotion"),
)

internal fun parseLeagueBlock(obj: JsonObject): GameLeagueBlock = GameLeagueBlock(
    unlocked = obj.reqBool("unlocked"),
    access = obj.reqEnum("access"),
    pseudonym = obj.nullableString("pseudonym"),
    weekKey = obj.reqString("weekKey"),
    closes = parseLeagueCloses(obj.reqObject("closes")),
    current = obj.nullableObject("current")?.let(::parseLeagueCurrent),
    friends = obj.reqObject("friends").let {
        LeagueFriends(rank = it.reqInt("rank"), size = it.reqInt("size"), weekPoints = it.reqInt("weekPoints"))
    },
)
