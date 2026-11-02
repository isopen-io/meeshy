package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import me.meeshy.sdk.model.game.GameLawVectors.Case
import me.meeshy.sdk.model.game.GameLawVectors.cases
import org.junit.Test

/** Rejeu de `game.vectors.json` (TS fait foi) contre les lois de ligue et de duo : league-*, duo-*. */
class GameLeagueDuoVectorParityTest {

    private fun JsonElement?.i(): Int = this!!.jsonPrimitive.intOrNull!!
    private fun JsonElement?.s(): String = this!!.jsonPrimitive.content
    private fun JsonElement?.b(): Boolean = this!!.jsonPrimitive.booleanOrNull!!
    private fun JsonElement?.sOrNull(): String? = if (this == null || this is JsonNull) null else jsonPrimitive.contentOrNull
    private fun JsonElement?.iOrNull(): Int? = if (this == null || this is JsonNull) null else jsonPrimitive.intOrNull

    private fun check(c: Case, field: String, actual: Any?, expected: Any?) =
        assertWithMessage("${c.label} : $field").that(actual).isEqualTo(expected)

    private fun moment(o: JsonObject) = LeagueMoment(o["dayKey"].s(), o["minuteOfDay"].i())
    private fun Case.moment() = moment(input)
    private fun league(name: String) = LeagueKey.entries.first { GameLeague.wire(it) == name }
    private fun members(c: Case) = c.input["members"]!!.jsonArray.map { LeagueMemberPoints(it.jsonObject["userId"].s(), it.jsonObject["weekPoints"].i()) }
    private fun strings(c: Case, key: String) = (c.input[key] as? kotlinx.serialization.json.JsonArray)?.map { it.s() }.orEmpty()

    @Test
    fun `league-week rejoue la semaine et la fermeture`() = cases("league-week").forEach { c ->
        val m = c.moment()
        val week = GameLeague.weekKey(m.dayKey)
        val e = c.expected
        check(c, "weekday", GameLeague.weekdayIndex(m.dayKey), e["weekday"].i())
        check(c, "weekKey", week, e["weekKey"].s())
        check(c, "weekOfMoment", GameLeague.weekOfMoment(m), e["weekOfMoment"].s())
        check(c, "close", GameLeague.weekClose(week), moment(e["close"]!!.jsonObject))
        check(c, "closed", GameLeague.isWeekClosed(week, m), e["closed"].b())
    }

    @Test
    fun `league-next-close rejoue la prochaine fermeture`() = cases("league-next-close").forEach { c ->
        check(c, "close", GameLeague.nextWeekClose(c.moment()), moment(c.expected))
    }

    @Test
    fun `league-week-points rejoue les points de la semaine`() = cases("league-week-points").forEach { c ->
        val gains = c.input["gains"]!!.jsonArray.map { LeagueGain(moment(it.jsonObject), it.jsonObject["points"].i()) }
        check(c, "points", GameLeague.weekPoints(c.str("weekKey"), gains), c.expected["points"].i())
    }

    @Test
    fun `league-access rejoue l acces`() = cases("league-access").forEach { c ->
        val access = GameLeague.access(c.int("levelRecord"), c.input["adultVerified"].b(), c.input["consented"].b())
        val wire = when (access) {
            LeagueAccess.Locked -> "locked"
            LeagueAccess.Minor -> "minor"
            LeagueAccess.ConsentRequired -> "consent-required"
            LeagueAccess.Open -> "open"
        }
        check(c, "status", wire, c.expected["status"].s())
    }

    @Test
    fun `les pseudonymes rejoignent le serveur`() {
        cases("league-pseudonym").forEach { c -> check(c, "valid", GameLeague.isValidPseudonym(c.str("value")), c.expected["valid"].b()) }
        cases("league-pseudonym-draw").forEach { c -> check(c, "pseudonym", GameLeague.pseudonymFromDraw(c.input["draw"]?.jsonPrimitive?.longOrNull ?: 0L), c.expected["pseudonym"].s()) }
        cases("league-pseudonym-check").forEach { c ->
            val r = GameLeague.checkPseudonym(c.str("value"), strings(c, "forbidden"))
            check(c, "ok", r == LeaguePseudonymCheck.Ok, c.expected["ok"].b())
            if (r is LeaguePseudonymCheck.Refused) check(c, "reason", r.reason.wire, c.expected["reason"].s())
        }
    }

    @Test
    fun `league-snapshot rejoue l instantane`() = cases("league-snapshot").forEach { c ->
        check(c, "snapshotDay", GameLeague.snapshotDay(c.moment()), c.expected["snapshotDay"].s())
    }

    @Test
    fun `league-groups rejoue la repartition`() = cases("league-groups").forEach { c ->
        val entrants = c.input["entrants"]!!.jsonArray.map { LeagueEntrant(it.jsonObject["userId"].s(), it.jsonObject["activity"].i()) }
        val groups = GameLeague.partition(c.str("weekKey"), league(c.str("league")), entrants)
        val expected = c.expected["groups"]!!.jsonArray
        check(c, "count", groups.size, expected.size)
        groups.zip(expected).forEach { (g, e) ->
            val o = e.jsonObject
            check(c, "groupId", g.groupId, o["groupId"].s())
            check(c, "size", g.memberIds.size, o["size"].i())
            check(c, "first", g.memberIds.firstOrNull(), o["first"].sOrNull())
            check(c, "last", g.memberIds.lastOrNull(), o["last"].sOrNull())
            check(c, "digest", GameSeed.fnv1a(g.memberIds.joinToString(",")).toLong(), o["digest"]!!.jsonPrimitive.longOrNull)
        }
    }

    @Test
    fun `league-settle rejoue le reglement`() = cases("league-settle").forEach { c ->
        val lg = league(c.str("league"))
        val settled = GameLeague.settle(c.str("groupId"), lg, members(c))
        val userId = c.strOrNull("userId")
        val e = c.expected
        check(c, "order", settled.map { it.standing.userId }, e["order"]!!.jsonArray.map { it.s() })
        check(c, "promoted", settled.filter { it.outcome.promoted }.map { it.standing.userId }, e["promoted"]!!.jsonArray.map { it.s() })
        check(c, "relegated", settled.filter { it.outcome.relegated }.map { it.standing.userId }, e["relegated"]!!.jsonArray.map { it.s() })
        check(c, "cups", settled.mapNotNull { m -> m.standing.cup?.let { listOf(m.standing.userId, it.name.lowercase()) } },
            e["cups"]!!.jsonArray.map { p -> p.jsonArray.map { it.s() } })
        check(c, "gloryTotal", settled.sumOf { it.outcome.glory }, e["gloryTotal"].i())
        check(c, "pointsToPromotion", GameLeague.pointsToPromotion(lg, settled.map { it.standing }, userId.orEmpty()), e["pointsToPromotion"].iOrNull())
        val me = settled.firstOrNull { it.standing.userId == userId }
        val expectedMe = e["me"]
        if (expectedMe == null || expectedMe is JsonNull) check(c, "me", me, null) else {
            val o = expectedMe.jsonObject
            check(c, "me.rank", me!!.standing.rank, o["rank"].i())
            check(c, "me.weekPoints", me.standing.weekPoints, o["weekPoints"].i())
            check(c, "me.zone", me.standing.zone.name.lowercase(), o["zone"].s())
            check(c, "me.cup", me.standing.cup?.name?.lowercase(), o["cup"].sOrNull())
            val out = o["outcome"]!!.jsonObject
            check(c, "me.next", GameLeague.wire(me.outcome.nextLeague), out["nextLeague"].s())
            check(c, "me.glory", me.outcome.glory, out["glory"].i())
        }
    }

    @Test
    fun `league-friends rejoue la ligue amis`() = cases("league-friends").forEach { c ->
        val points = (c.input["weekPoints"] as JsonObject).mapValues { it.value.i() }
        val entries = GameLeague.friendsRanking(c.str("weekKey"), c.str("viewerId"), strings(c, "friendIds"), points)
        val expected = c.expected["entries"]!!.jsonArray.map { it.jsonObject }
        check(c, "ids", entries.map { it.userId }, expected.map { it["userId"].s() })
        check(c, "ranks", entries.map { it.rank }, expected.map { it["rank"].i() })
        check(c, "points", entries.map { it.weekPoints }, expected.map { it["weekPoints"].i() })
        check(c, "isMe", entries.map { it.isMe }, expected.map { it["isMe"].b() })
    }

    @Test
    fun `league-visibility rejoue la visibilite`() = cases("league-visibility").forEach { c ->
        val board = if (c.str("board") == "public") LeagueBoard.Public else LeagueBoard.Friends
        val v = GameLeague.visibility(board, c.input["viewerIsMember"].b())
        check(c, "pseudonym", v.pseudonym, c.expected["pseudonym"].b())
        check(c, "realIdentity", v.realIdentity, c.expected["realIdentity"].b())
        check(c, "presence", v.presence, c.expected["presence"].b())
    }

    @Test
    fun `duo-draw rejoue le tirage`() = cases("duo-draw").forEach { c ->
        val m = GameDuo.draw(c.str("userA"), c.str("userB"), c.str("weekKey"), c.int("levelA"), c.int("levelB"), strings(c, "unavailableSignals"))
        val e = c.expected["mission"]
        if (e == null || e is JsonNull) return@forEach check(c, "mission", m, null)
        val o = e.jsonObject
        check(c, "templateKey", m!!.templateKey, o["templateKey"].s())
        check(c, "signal", m.signal, o["signal"].s())
        check(c, "prism", m.prism, o["prism"].b())
        check(c, "partTarget", m.partTarget, o["partTarget"].i())
        check(c, "commonTarget", m.commonTarget, o["commonTarget"].i())
        check(c, "basePoints", m.basePoints, o["basePoints"].i())
        check(c, "weekKey", m.weekKey, o["weekKey"].s())
    }

    @Test
    fun `duo-progress duo-reward duo-invite rejouent`() {
        cases("duo-progress").forEach { c ->
            val p = GameDuo.progress(c.int("partTarget"), c.int("mine"), c.int("partner"))
            val e = c.expected
            check(c, "line", listOf(p.mine, p.partner, p.common, p.commonTarget), listOf("mine", "partner", "common", "commonTarget").map { e[it].i() })
            check(c, "done", listOf(p.mineDone, p.partnerDone, p.bothDone), listOf("mineDone", "partnerDone", "bothDone").map { e[it].b() })
        }
        cases("duo-reward").forEach { c ->
            val r = GameDuo.reward(c.int("level"), c.int("flameDays"), c.input["mineDone"].b(), c.input["partnerDone"].b())
            check(c, "points", r.points, c.expected["points"].i())
            check(c, "doubled", r.doubled, c.expected["doubled"].b())
        }
        cases("duo-invite").forEach { c ->
            val i = c.input
            val d = GameDuo.canInvite(c.int("inviterLevelRecord"), c.int("inviteeLevelRecord"), i["areFriends"].b(), i["inviterHasDuo"].b(), i["inviteeHasDuo"].b(), i["self"].b())
            check(c, "allowed", d == DuoInviteDecision.Allowed, c.expected["allowed"].b())
            if (d is DuoInviteDecision.Refused) check(c, "reason", d.reason.wire, c.expected["reason"].s())
        }
    }

    @Test
    fun `duo-transition rejoue les statuts`() = cases("duo-transition").forEach { c ->
        val action = DuoAction.entries.first { it.wire == c.str("action") }
        val actor = if (c.str("actor") == "inviter") DuoActor.Inviter else DuoActor.Invitee
        val next = GameDuo.transition(DuoStatus.fromWire(c.str("status"))!!, action, actor)
        check(c, "next", next?.wire, c.expected["next"].sOrNull())
    }
}
