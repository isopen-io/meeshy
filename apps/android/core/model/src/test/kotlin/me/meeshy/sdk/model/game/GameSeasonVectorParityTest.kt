package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.game.GameLawVectors.Case
import me.meeshy.sdk.model.game.GameLawVectors.array
import me.meeshy.sdk.model.game.GameLawVectors.boolValue
import me.meeshy.sdk.model.game.GameLawVectors.doubleValue
import me.meeshy.sdk.model.game.GameLawVectors.intValue
import me.meeshy.sdk.model.game.GameLawVectors.obj
import me.meeshy.sdk.model.game.GameLawVectors.text
import org.junit.Test

/** Rejeu de `game.vectors.json` (TS fait foi) : lois `season-*` et lecture du calendrier servi `season-schedule`. */
class GameSeasonVectorParityTest {

    private fun moment(c: Case) = SeasonMoment(c.str("dayKey"), c.int("minuteOfDay"))

    private fun check(c: Case, field: String, actual: Any?, expected: Any?) =
        assertWithMessage("${c.label} : $field").that(actual).isEqualTo(expected)

    private fun JsonElement?.textOrNull(): String? = if (this == null || this is JsonNull) null else text()

    private fun calendarOf(json: JsonElement?): SeasonCalendar? = (json as? JsonObject)?.let {
        SeasonCalendar(
            number = it["number"].intValue()!!,
            startDay = it["startDay"].text(),
            endDay = it["endDay"].text(),
            weekKeys = it["weekKeys"].array().map { w -> w.text() },
            themeKey = it["themeKey"].text(),
        )
    }

    private fun rewardOf(json: JsonElement?): SeasonRewardBlock? = (json as? JsonObject)?.let {
        SeasonRewardBlock(SeasonRewardKind.entries.first { k -> wire(k) == it["kind"].text() }, it["amount"].intValue()!!)
    }

    private fun wire(kind: SeasonRewardKind) = when (kind) {
        SeasonRewardKind.Points -> "points"
        SeasonRewardKind.Fragment -> "fragment"
        SeasonRewardKind.Freeze -> "freeze"
        SeasonRewardKind.SeasonCup -> "season-cup"
    }

    private fun sealOf(json: JsonElement?): SeasonSeal? = (json as? JsonObject)?.let { SeasonSeal(it["cosmeticKey"].text()) }

    private fun checkClaim(c: Case, claim: SeasonClaim, expected: JsonObject) {
        when (claim) {
            is SeasonClaim.Allowed -> {
                check(c, "allowed", true, expected["allowed"].boolValue())
                check(c, "reward", claim.reward, rewardOf(expected["reward"]))
                check(c, "seal", claim.seal, sealOf(expected["seal"]))
            }
            is SeasonClaim.Refused -> {
                check(c, "allowed", false, expected["allowed"].boolValue())
                check(c, "reason", claim.reason.wire, expected["reason"].text())
            }
        }
    }

    @Test
    fun `le calendrier d'une saison est celui du serveur`() = GameLawVectors.cases("season-calendar").forEach { c ->
        check(c, "calendar", GameSeason.calendar(c.int("season")), calendarOf(c.expected["calendar"]))
    }

    @Test
    fun `la saison d'un jour et d'un moment est celle du serveur`() = GameLawVectors.cases("season-at").forEach { c ->
        val at = moment(c)
        check(c, "season", GameSeason.season(at.dayKey), c.expected["season"].intValue())
        check(c, "week", GameSeason.week(at.dayKey), c.expected["week"].intValue())
        check(c, "seasonOfMoment", GameSeason.season(at), c.expected["seasonOfMoment"].intValue())
        check(c, "upcoming", GameSeason.upcoming(at)?.startDay, c.expected["upcoming"].textOrNull())
    }

    @Test
    fun `l'etat d'une saison et sa copie vivante sont ceux du serveur`() = GameLawVectors.cases("season-tense").forEach { c ->
        val served = GameArchiveStatus.entries.first { it.name.lowercase() == c.str("served") }
        check(c, "tense", GameSeason.tense(c.str("startDay"), c.str("endDay"), moment(c)).name.lowercase(), c.expected["tense"].text())
        val live = GameSeason.liveTense(served, c.str("startDay"), c.str("endDay"), moment(c))
        check(c, "live", live.name.lowercase(), c.expected["live"].text())
    }

    @Test
    fun `le parcours de saison est celui du serveur`() = GameLawVectors.cases("season-progress").forEach { c ->
        val p = GameSeason.progress(c.int("stars"))
        check(c, "stars", p.stars, c.expected["stars"].intValue())
        check(c, "steps", p.steps, c.expected["steps"].intValue())
        check(c, "starsToNext", p.starsToNext, c.expected["starsToNext"].intValue())
        check(c, "completed", p.completed, c.expected["completed"].boolValue())
        assertWithMessage("${c.label} : progress").that(p.progress).isWithin(1e-6).of(c.expected["progress"].doubleValue())
    }

    @Test
    fun `les recompenses et le Sceau d'une etape sont ceux du serveur`() = GameLawVectors.cases("season-reward").forEach { c ->
        check(c, "reward", GameSeason.stepReward(c.int("step")), rewardOf(c.expected["reward"]))
        check(c, "seal", GameSeason.sealReward(c.int("season"), c.int("step")), sealOf(c.expected["seal"]))
    }

    @Test
    fun `la reclamation d'une etape est celle du serveur`() = GameLawVectors.cases("season-claim").forEach { c ->
        val claim = GameSeason.claim(c.int("season"), c.int("step"), c.int("stepsReached"), c.ints("claimed"), c.input["sealOwned"].boolValue())
        checkClaim(c, claim, c.expected)
    }

    @Test
    fun `le reglement de saison est celui du serveur`() = GameLawVectors.cases("season-settlement").forEach { c ->
        val s = GameSeason.settlement(c.int("season"), c.int("stepsReached"))
        check(c, "completed", s.completed, c.expected["completed"].boolValue())
        check(c, "glory", s.glory, c.expected["glory"].intValue())
        check(c, "cup", s.cup, c.expected["cup"].boolValue())
        check(c, "badgeKey", s.badgeKey, c.expected["badgeKey"].textOrNull())
    }

    @Test
    fun `les etoiles par source sont celles du serveur`() = GameLawVectors.cases("season-stars").forEach { c ->
        val source = SeasonStarSource.entries.first { it.name.lowercase() == c.str("source") }
        check(c, "stars", GameSeason.stars(source), c.expected["stars"].intValue())
    }

    @Test
    fun `le refus d'achat du Sceau est celui du serveur`() = GameLawVectors.cases("season-seal").forEach { c ->
        val refusal = GameSeason.sealRefusal(c.int("balance"), c.input["owned"].boolValue())
        check(c, "allowed", refusal == null, c.expected["allowed"].boolValue())
        if (refusal != null) check(c, "reason", refusal.wire, c.expected["reason"].text())
    }

    @Test
    fun `le calendrier servi se lit comme sur le serveur`() = GameLawVectors.cases("season-schedule").forEach { c ->
        val schedule = SeasonSchedule.normalize(c.input["schedule"])
        val number = c.int("season")
        val at = moment(c)
        val e = c.expected
        check(c, "revision", schedule.revision, e["revision"].intValue())
        check(c, "kept", schedule.seasons.map { it.number }, e["kept"].array().map { it.intValue() })
        check(c, "calendar", schedule.calendar(number), calendarOf(e["calendar"]))
        check(c, "status", schedule.status(number).name.lowercase(), e["status"].text())
        val definition = schedule.definition(number)
        check(c, "stepPoints", definition?.stepPoints, e["stepPoints"].intValue())
        checkClaim(c, GameSeason.claim(number, 1, 1, emptyList(), false, definition?.stepPoints), e["claim"].obj())
        check(c, "season", schedule.season(at.dayKey), e["season"].intValue())
        check(c, "week", schedule.week(at.dayKey), e["week"].intValue())
        check(c, "seasonOfMoment", schedule.season(at), e["seasonOfMoment"].intValue())
        check(c, "upcoming", schedule.upcoming(at)?.number, e["upcoming"].intValue())
    }
}
