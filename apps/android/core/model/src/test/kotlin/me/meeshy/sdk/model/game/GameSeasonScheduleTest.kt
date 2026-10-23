package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameSeasonScheduleTest {

    private fun def(number: Int, start: String, status: String = "scheduled", points: Int = 100, extra: String = "") =
        """{"number":$number,"startDay":"$start","status":"$status","themeKey":"language:fr","stepPoints":$points$extra}"""

    private fun schedule(vararg defs: String, revision: Int = 1) =
        SeasonSchedule.normalize("""{"revision":$revision,"seasons":[${defs.joinToString(",")}]}""")

    private fun copyJson(title: String = "Saison un") = SeasonSchedule.COPY_LOCALES.joinToString(",", "{", "}") {
        """"$it":{"title":"$title","tagline":"Une saison","description":"Huit semaines"}"""
    }

    @Test
    fun `le calendrier par defaut n'est jamais vide et rend exactement la loi`() {
        val d = SeasonSchedule.default
        assertThat(d.calendar(1)).isEqualTo(GameSeason.calendar(1))
        assertThat(d.calendar(5)).isEqualTo(GameSeason.calendar(5))
        assertThat(d.definition(1)!!.startDay).isEqualTo("2026-12-21")
        assertThat(d.definition(1)!!.stepPoints).isEqualTo(100)
        assertThat(d.definition(0)).isNull()
    }

    @Test
    fun `un calendrier illisible retombe sur le defaut`() {
        assertThat(SeasonSchedule.normalize("pas un calendrier")).isEqualTo(SeasonSchedule.default)
        assertThat(SeasonSchedule.normalize(null)).isEqualTo(SeasonSchedule.default)
        assertThat(SeasonSchedule.normalize("""{"revision":-1,"seasons":[]}""")).isEqualTo(SeasonSchedule.default)
        assertThat(SeasonSchedule.normalize("""{"revision":true,"seasons":[]}""")).isEqualTo(SeasonSchedule.default)
    }

    @Test
    fun `une saison decalee pose une ancre que les suivantes prolongent`() {
        val s = schedule(def(1, "2026-12-21"), def(2, "2027-03-01"))
        assertThat(s.calendar(2)!!.startDay).isEqualTo("2027-03-01")
        assertThat(s.calendar(3)!!.startDay).isEqualTo("2027-04-26")
        assertThat(s.season("2027-02-20")).isNull()
        assertThat(s.upcoming(SeasonMoment("2027-02-20", 600))!!.number).isEqualTo(2)
    }

    @Test
    fun `une saison en pause n'a plus de dates ni celles qui la suivent`() {
        val s = schedule(def(1, "2026-12-21"), def(2, "2027-02-15", status = "paused"))
        assertThat(s.calendar(2)).isNull()
        assertThat(s.calendar(3)).isNull()
        assertThat(s.status(3)).isEqualTo(SeasonDefinitionStatus.Paused)
        assertThat(s.status(1)).isEqualTo(SeasonDefinitionStatus.Scheduled)
        assertThat(s.upcoming(SeasonMoment("2027-03-01", 0))).isNull()
    }

    @Test
    fun `une definition qui chevauche la precedente, hors lundi ou hors bornes est ignoree`() {
        assertThat(schedule(def(1, "2026-12-21"), def(2, "2027-02-01")).seasons.map { it.number }).containsExactly(1)
        assertThat(schedule(def(1, "2026-12-22")).seasons).isEmpty()
        assertThat(schedule(def(1, "2026-12-21", points = 500)).seasons).isEmpty()
        assertThat(schedule(def(1, "2026-12-21", points = 55)).seasons).isEmpty()
    }

    @Test
    fun `la saison courante se lit a l'horloge injectee`() {
        val s = SeasonSchedule.default
        assertThat(s.season(SeasonMoment("2026-12-20", 1199))).isNull()
        assertThat(s.season(SeasonMoment("2026-12-20", 1200))).isEqualTo(1)
        assertThat(s.week("2026-12-28")).isEqualTo(2)
        assertThat(s.season("2027-02-14")).isEqualTo(1)
        assertThat(s.season("pas un jour")).isNull()
    }

    @Test
    fun `les points d'etape de la definition servie gagnent sur la loi`() {
        val s = schedule(def(1, "2026-12-21", points = 150))
        assertThat(s.definition(1)!!.stepPoints).isEqualTo(150)
        assertThat(s.definition(2)!!.stepPoints).isEqualTo(100)
    }

    @Test
    fun `des textes illisibles ne retirent que les textes`() {
        val good = schedule(def(1, "2026-12-21", extra = ""","copy":${copyJson()}"""))
        assertThat(good.seasons.single().copy!!.keys).containsExactlyElementsIn(SeasonSchedule.COPY_LOCALES)
        for (bad in listOf("Voir meeshy.me", "Gagne 5 €", "Gagne 5 EUR", " espace", "a‮b", "x".repeat(31))) {
            val s = schedule(def(1, "2026-12-21", extra = ""","copy":${copyJson(bad)}"""))
            assertThat(s.seasons.single().copy).isNull()
            assertThat(s.seasons.single().startDay).isEqualTo("2026-12-21")
        }
    }

    @Test
    fun `l'etag suit la revision`() {
        assertThat(schedule(revision = 7).etag).isEqualTo("\"season-schedule-7\"")
    }
}
