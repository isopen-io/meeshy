package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.game.GameBlockFixtures.json
import org.junit.Test

class GameArchiveModelsTest {

    private val pastSeason = """
    {"number":1,"status":"past","themeKey":"language:fr","startDay":"2026-12-21","endDay":"2027-02-14",
     "weekKeys":["2026-12-21","2026-12-28","2027-01-04","2027-01-11","2027-01-18","2027-01-25","2027-02-01","2027-02-08"],
     "progress":{"stars":160,"steps":40,"claimedSteps":[1,2,3],"sealOwned":true,"completed":true,"settled":true}}
    """

    private val upcomingSeason = """
    {"number":2,"status":"upcoming","themeKey":"language:es","startDay":"2027-02-15","endDay":"2027-04-11",
     "weekKeys":["2027-02-15","2027-02-22","2027-03-01","2027-03-08","2027-03-15","2027-03-22","2027-03-29","2027-04-05"],
     "progress":null}
    """

    private val pastWeek = """
    {"weekKey":"2026-10-12","status":"past","season":null,"retention":"kept",
     "result":{"league":"jade","finalRank":3,"finalPoints":410,"zone":"promotion","cup":"bronze","settled":true}}
    """

    private val purgedWeek = """{"weekKey":"2026-10-12","status":"past","season":null,"retention":"purged","result":null}"""

    @Test
    fun `une saison passee se lit avec MA progression`() {
        val season = GameArchiveParser.season(pastSeason)!!

        assertThat(season.status).isEqualTo(GameArchiveStatus.Past)
        assertThat(season.weekKeys).hasSize(8)
        assertThat(season.progress?.steps).isEqualTo(40)
        assertThat(season.progress?.completed).isTrue()
        assertThat(season.progress?.claimedSteps).containsExactly(1, 2, 3).inOrder()
    }

    @Test
    fun `une saison future se lit sans progression`() {
        val season = GameArchiveParser.season(upcomingSeason)!!

        assertThat(season.status).isEqualTo(GameArchiveStatus.Upcoming)
        assertThat(season.themeKey).isEqualTo("language:es")
        assertThat(season.progress).isNull()
    }

    @Test
    fun `une semaine passee se lit avec mon resultat grave et une semaine purgee le dit`() {
        val week = GameArchiveParser.leagueWeek(pastWeek)!!
        assertThat(week.retention).isEqualTo(GameArchiveRetention.Kept)
        assertThat(week.season).isNull()
        assertThat(week.result).isEqualTo(GameLeagueWeekResult(LeagueKey.Jade, 3, 410, LeagueZone.Promotion, LeagueCup.Bronze, true))

        val purged = GameArchiveParser.leagueWeek(purgedWeek)!!
        assertThat(purged.retention).isEqualTo(GameArchiveRetention.Purged)
        assertThat(purged.result).isNull()
    }

    @Test
    fun `un etat inconnu d'un serveur plus recent n'est pas lu de travers`() {
        assertThat(GameArchiveParser.season(upcomingSeason.replace("\"upcoming\"", "\"someday\""))).isNull()
        assertThat(GameArchiveParser.leagueWeek(purgedWeek.replace("\"purged\"", "\"archived\""))).isNull()
    }

    @Test
    fun `les cles optionnelles s'encodent en null et la copie disque est relue a l'identique`() {
        val season = GameArchiveParser.season(upcomingSeason)!!
        val purged = GameArchiveParser.leagueWeek(purgedWeek)!!
        val partial = GameArchiveParser.leagueWeek(
            """{"weekKey":"2026-10-12","status":"past","season":2,"retention":"kept","result":{"league":"quartz","finalRank":null,"finalPoints":null,"zone":null,"cup":null,"settled":false}}""",
        )!!

        val seasonTree = json.parseToJsonElement(json.encodeToString(season)) as JsonObject
        val weekTree = json.parseToJsonElement(json.encodeToString(purged)) as JsonObject
        val resultTree = (json.parseToJsonElement(json.encodeToString(partial)) as JsonObject)["result"] as JsonObject

        assertThat(seasonTree["progress"]).isEqualTo(JsonNull)
        assertThat(weekTree["season"]).isEqualTo(JsonNull)
        assertThat(weekTree["result"]).isEqualTo(JsonNull)
        assertThat(resultTree.keys).containsExactly("league", "finalRank", "finalPoints", "zone", "cup", "settled")
        assertThat(resultTree["cup"]).isEqualTo(JsonNull)
        assertThat(GameArchiveParser.season(json.encodeToString(season))).isEqualTo(season)
        assertThat(GameArchiveParser.leagueWeek(json.encodeToString(purged))).isEqualTo(purged)
        assertThat(GameArchiveParser.leagueWeek(json.encodeToString(partial))).isEqualTo(partial)
        assertThat(GameArchiveParser.season(json.encodeToString(GameArchiveParser.season(pastSeason)!!)))
            .isEqualTo(GameArchiveParser.season(pastSeason))
    }

    @Test
    fun `les statuts et retentions ont les noms du contrat`() {
        assertThat(GameArchiveStatus.entries.map { json.encodeToString(it) })
            .containsExactly("\"past\"", "\"current\"", "\"upcoming\"").inOrder()
        assertThat(GameArchiveRetention.entries.map { json.encodeToString(it) })
            .containsExactly("\"kept\"", "\"purged\"").inOrder()
    }
}
