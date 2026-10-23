@file:OptIn(ExperimentalSerializationApi::class)

package me.meeshy.sdk.model.game

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/*
 * L'extension `duo` du bloc `game` (vague 2, #9385). MIROIR de `GameDuoBlock`
 * (iOS, `GameWave2Models.swift`) et de `packages/shared/types/game-v2.ts`.
 */

/** Les statuts d'un duo, `none` compris : aucun duo cette semaine. */
@Serializable
public enum class DuoBlockStatus {
    @SerialName("none") None,
    @SerialName("invited") Invited,
    @SerialName("active") Active,
    @SerialName("completed") Completed,
    @SerialName("abandoned") Abandoned,
    @SerialName("expired") Expired,
}

@Serializable
public enum class DuoActor {
    @SerialName("inviter") Inviter,
    @SerialName("invitee") Invitee,
}

@Serializable
public data class DuoPartner(val userId: String, val displayName: String)

@Serializable
public data class DuoMissionBlock(
    val templateKey: String,
    val signal: String,
    val prism: Boolean,
    /** Ce que CHACUN doit faire. */
    val partTarget: Int,
    val commonTarget: Int,
)

@Serializable
public data class DuoProgress(
    val mine: Int,
    val partner: Int,
    val common: Int,
    val mineDone: Boolean,
    val partnerDone: Boolean,
    val bothDone: Boolean,
)

@Serializable
public data class DuoReward(val points: Int, val doubled: Boolean)

@Serializable
public data class GameDuoBlock(
    /** Niveau record de 20 atteint. */
    val unlocked: Boolean,
    val status: DuoBlockStatus,
    @EncodeDefault val duoId: String? = null,
    val weekKey: String,
    @EncodeDefault val role: DuoActor? = null,
    @EncodeDefault val partner: DuoPartner? = null,
    @EncodeDefault val mission: DuoMissionBlock? = null,
    @EncodeDefault val progress: DuoProgress? = null,
    /** Ce que MA part vaut au total : doublé quand les deux ont fini. */
    @EncodeDefault val reward: DuoReward? = null,
)

internal fun parseDuoBlock(obj: JsonObject): GameDuoBlock = GameDuoBlock(
    unlocked = obj.reqBool("unlocked"),
    status = obj.reqEnum("status"),
    duoId = obj.nullableString("duoId"),
    weekKey = obj.reqString("weekKey"),
    role = obj.nullableEnum<DuoActor>("role"),
    partner = obj.nullableObject("partner")?.let {
        DuoPartner(userId = it.reqString("userId"), displayName = it.reqString("displayName"))
    },
    mission = obj.nullableObject("mission")?.let {
        DuoMissionBlock(
            templateKey = it.reqString("templateKey"),
            signal = it.reqString("signal"),
            prism = it.reqBool("prism"),
            partTarget = it.reqInt("partTarget"),
            commonTarget = it.reqInt("commonTarget"),
        )
    },
    progress = obj.nullableObject("progress")?.let {
        DuoProgress(
            mine = it.reqInt("mine"),
            partner = it.reqInt("partner"),
            common = it.reqInt("common"),
            mineDone = it.reqBool("mineDone"),
            partnerDone = it.reqBool("partnerDone"),
            bothDone = it.reqBool("bothDone"),
        )
    },
    reward = obj.nullableObject("reward")?.let { DuoReward(points = it.reqInt("points"), doubled = it.reqBool("doubled")) },
)
