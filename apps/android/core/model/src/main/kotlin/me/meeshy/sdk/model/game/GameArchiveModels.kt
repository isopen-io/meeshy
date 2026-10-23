@file:OptIn(ExperimentalSerializationApi::class)

package me.meeshy.sdk.model.game

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/*
 * Ce qu'un lien du Jeu ouvre : une saison n, une semaine de ligue (#9947, #10018).
 * MIROIR de `GameArchive.swift` (iOS) et de `packages/shared/types/game-archive.ts`.
 *
 * Rien de la présence d'autrui : une saison sert son CALENDRIER (le même pour tous)
 * et MA progression ; une semaine sert MON résultat gravé — ni pseudonyme, ni total,
 * ni rang d'un autre.
 *
 * Les clés optionnelles s'ENCODENT en `null` (jamais omises) : la copie disque relue
 * hors ligne est la réponse du serveur, clé pour clé. Un état inconnu d'un serveur
 * plus récent n'est pas lu de travers : la lecture rend `null`.
 */

/** Par rapport à MON moment (mon fuseau, la fermeture du dimanche 20 h comprise). */
@Serializable
public enum class GameArchiveStatus {
    @SerialName("past") Past,
    @SerialName("current") Current,
    @SerialName("upcoming") Upcoming,
}

/** Une semaine purgée (`LEAGUE_RETENTION_DAYS` après la fin de sa saison) le dit. */
@Serializable
public enum class GameArchiveRetention {
    @SerialName("kept") Kept,
    @SerialName("purged") Purged,
}

/** MA progression dans une saison : ce que le palmarès d'une saison passée montre. */
@Serializable
public data class GameSeasonProgressArchive(
    val stars: Int,
    val steps: Int,
    val claimedSteps: List<Int>,
    val sealOwned: Boolean,
    /** Le parcours terminé : la coupe de saison et le badge daté. */
    val completed: Boolean,
    val settled: Boolean,
)

/** Une saison par son numéro (`GET /me/game/seasons/:number`). */
@Serializable
public data class GameSeasonArchive(
    val number: Int,
    val status: GameArchiveStatus,
    val themeKey: String,
    /** Le lundi d'ouverture (`AAAA-MM-JJ`). */
    val startDay: String,
    /** Le dernier dimanche. */
    val endDay: String,
    val weekKeys: List<String>,
    /** `null` : je n'y ai pas joué (ou elle n'a pas commencé). */
    @EncodeDefault val progress: GameSeasonProgressArchive? = null,
)

/** MON résultat gravé d'une semaine de ligue. */
@Serializable
public data class GameLeagueWeekResult(
    val league: LeagueKey,
    @EncodeDefault val finalRank: Int? = null,
    @EncodeDefault val finalPoints: Int? = null,
    @EncodeDefault val zone: LeagueZone? = null,
    @EncodeDefault val cup: LeagueCup? = null,
    val settled: Boolean,
)

/** Une semaine de ligue par sa clé, le lundi (`GET /me/game/league/weeks/:weekKey`). */
@Serializable
public data class GameLeagueWeekArchive(
    val weekKey: String,
    val status: GameArchiveStatus,
    /** La saison qui contient la semaine, `null` hors saison. */
    @EncodeDefault val season: Int? = null,
    val retention: GameArchiveRetention,
    /** `null` : pas de place cette semaine-là, ou plus de trace (purge). */
    @EncodeDefault val result: GameLeagueWeekResult? = null,
)

/** Lecture des archives : un état ou une rétention inconnus rendent `null`, jamais une valeur de travers. */
public object GameArchiveParser {

    public fun season(text: String?): GameSeasonArchive? = readGamePayload(text) { obj ->
        GameSeasonArchive(
            number = obj.reqInt("number"),
            status = obj.reqEnum("status"),
            themeKey = obj.reqString("themeKey"),
            startDay = obj.reqString("startDay"),
            endDay = obj.reqString("endDay"),
            weekKeys = obj.reqArray("weekKeys").strings("weekKeys"),
            progress = obj.nullableObject("progress")?.let(::progress),
        )
    }

    public fun leagueWeek(text: String?): GameLeagueWeekArchive? = readGamePayload(text) { obj ->
        GameLeagueWeekArchive(
            weekKey = obj.reqString("weekKey"),
            status = obj.reqEnum("status"),
            season = obj.nullableInt("season"),
            retention = obj.reqEnum("retention"),
            result = obj.nullableObject("result")?.let(::result),
        )
    }

    private fun progress(obj: JsonObject): GameSeasonProgressArchive = GameSeasonProgressArchive(
        stars = obj.reqInt("stars"),
        steps = obj.reqInt("steps"),
        claimedSteps = obj.reqArray("claimedSteps").map { it.intStrict("claimedSteps") },
        sealOwned = obj.reqBool("sealOwned"),
        completed = obj.reqBool("completed"),
        settled = obj.reqBool("settled"),
    )

    private fun result(obj: JsonObject): GameLeagueWeekResult = GameLeagueWeekResult(
        league = obj.reqEnum("league"),
        finalRank = obj.nullableInt("finalRank"),
        finalPoints = obj.nullableInt("finalPoints"),
        zone = obj.nullableEnum<LeagueZone>("zone"),
        cup = obj.nullableEnum<LeagueCup>("cup"),
        settled = obj.reqBool("settled"),
    )
}
