@file:OptIn(ExperimentalSerializationApi::class)

package me.meeshy.sdk.model.game

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/*
 * Les extensions `season` et `seasonUpcoming` du bloc `game` (vague 2, #9386,
 * #10014). MIROIR de `GameSeasonBlock` / `GameUpcomingSeasonBlock` (iOS,
 * `GameWave2Models.swift`) et de `packages/shared/types/game-v2.ts`.
 */

@Serializable
public enum class SeasonRewardKind {
    @SerialName("points") Points,
    @SerialName("fragment") Fragment,
    @SerialName("freeze") Freeze,
    @SerialName("season-cup") SeasonCup,
}

@Serializable
public data class SeasonRewardBlock(val kind: SeasonRewardKind, val amount: Int)

@Serializable
public data class SeasonNextReward(val step: Int, val reward: SeasonRewardBlock)

@Serializable
public data class GameSeasonBlock(
    val number: Int,
    /** Ouverte : le catalogue des thèmes est une donnée de produit, il grandit sans casser un client. */
    val themeKey: String,
    val startDay: String,
    val endDay: String,
    /** De 1 à 8. */
    val week: Int,
    val stars: Int,
    val steps: Int,
    val stepsTotal: Int,
    val starsToNext: Int,
    val progress: Double,
    val completed: Boolean,
    /** Les étapes déjà réclamées. */
    val claimedSteps: List<Int>,
    /** La prochaine récompense gratuite à réclamer, `null` quand tout est réclamé. */
    @EncodeDefault val nextReward: SeasonNextReward? = null,
    val sealOwned: Boolean,
    val sealPrice: Int,
    /** Les points d'une étape ordinaire de CETTE saison (calendrier servi, #10232) ; absent d'un serveur antérieur. */
    @EncodeDefault val stepPoints: Int? = null,
) {
    /** Les points d'une étape ordinaire tels que l'écran les montre : ceux de la saison, sinon la loi (100). */
    val servedStepPoints: Int get() = stepPoints?.takeIf { it > 0 } ?: LAW_STEP_POINTS

    public companion object {
        /** Les points d'une étape ordinaire selon la loi. */
        public const val LAW_STEP_POINTS: Int = 100
    }
}

/**
 * La saison À VENIR (#10014) : servie tant qu'aucune saison n'est ouverte. Une
 * donnée de calendrier, la même pour tous.
 */
@Serializable
public data class GameUpcomingSeasonBlock(
    val number: Int,
    val themeKey: String,
    /** Le lundi d'ouverture (`AAAA-MM-JJ`). */
    val startDay: String,
    /** Le dernier dimanche de la saison. */
    val endDay: String,
)

internal fun parseSeasonReward(obj: JsonObject): SeasonRewardBlock =
    SeasonRewardBlock(kind = obj.reqEnum("kind"), amount = obj.reqInt("amount"))

internal fun parseSeasonBlock(obj: JsonObject): GameSeasonBlock = GameSeasonBlock(
    number = obj.reqInt("number"),
    themeKey = obj.reqString("themeKey"),
    startDay = obj.reqString("startDay"),
    endDay = obj.reqString("endDay"),
    week = obj.reqInt("week"),
    stars = obj.reqInt("stars"),
    steps = obj.reqInt("steps"),
    stepsTotal = obj.reqInt("stepsTotal"),
    starsToNext = obj.reqInt("starsToNext"),
    progress = obj.reqDouble("progress"),
    completed = obj.reqBool("completed"),
    claimedSteps = obj.reqArray("claimedSteps").map { it.intStrict("claimedSteps") },
    nextReward = obj.nullableObject("nextReward")?.let {
        SeasonNextReward(step = it.reqInt("step"), reward = parseSeasonReward(it.reqObject("reward")))
    },
    sealOwned = obj.reqBool("sealOwned"),
    sealPrice = obj.reqInt("sealPrice"),
    stepPoints = obj.optInt("stepPoints"),
)

internal fun parseUpcomingSeasonBlock(obj: JsonObject): GameUpcomingSeasonBlock = GameUpcomingSeasonBlock(
    number = obj.reqInt("number"),
    themeKey = obj.reqString("themeKey"),
    startDay = obj.reqString("startDay"),
    endDay = obj.reqString("endDay"),
)
