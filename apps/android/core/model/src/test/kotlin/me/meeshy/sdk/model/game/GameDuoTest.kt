package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameDuoTest {

    private fun next(status: DuoStatus, action: DuoAction, actor: DuoActor = DuoActor.Invitee) =
        GameDuo.transition(status, action, actor)

    @Test
    fun `seul l invite accepte une invitation`() {
        assertThat(next(DuoStatus.Invited, DuoAction.Accept)).isEqualTo(DuoStatus.Active)
        assertThat(next(DuoStatus.Invited, DuoAction.Accept, DuoActor.Inviter)).isNull()
    }

    @Test
    fun `un duo ouvert s abandonne ou expire et un actif se complete`() {
        listOf(DuoStatus.Invited, DuoStatus.Active).forEach {
            assertThat(next(it, DuoAction.Abandon)).isEqualTo(DuoStatus.Abandoned)
            assertThat(next(it, DuoAction.Expire)).isEqualTo(DuoStatus.Expired)
        }
        assertThat(next(DuoStatus.Active, DuoAction.Complete)).isEqualTo(DuoStatus.Completed)
        assertThat(next(DuoStatus.Invited, DuoAction.Complete)).isNull()
    }

    @Test
    fun `un duo termine n accepte plus aucun geste`() {
        listOf(DuoStatus.Completed, DuoStatus.Abandoned, DuoStatus.Expired).forEach { status ->
            DuoAction.entries.forEach { assertThat(next(status, it)).isNull() }
        }
    }

    @Test
    fun `la recompense est doublee seulement quand les deux ont fini`() {
        assertThat(GameDuo.reward(30, 10, mineDone = false, partnerDone = true)).isEqualTo(DuoReward(0, false))
        val solo = GameDuo.reward(30, 10, mineDone = true, partnerDone = false)
        assertThat(solo.doubled).isFalse()
        assertThat(GameDuo.reward(30, 10, mineDone = true, partnerDone = true)).isEqualTo(DuoReward(solo.points * 2, true))
    }

    @Test
    fun `l excedent de l un ne finit pas la part de l autre`() {
        val p = GameDuo.progress(partTarget = 20, mine = 25, partner = 8)
        assertThat(p.mine).isEqualTo(20)
        assertThat(p.common).isEqualTo(28)
        assertThat(p.bothDone).isFalse()
    }

    @Test
    fun `le tirage est le meme quel que soit celui qui regarde`() {
        val ab = GameDuo.draw("alice", "bob", "2026-10-05", 30, 30, emptyList())
        assertThat(GameDuo.draw("bob", "alice", "2026-10-05", 30, 30, emptyList())).isEqualTo(ab)
    }

    @Test
    fun `la part se mesure sur le niveau le plus bas et un signal impossible est ecarte`() {
        val low = GameDuo.draw("alice", "bob", "2026-10-05", 5, 90, emptyList())!!
        val high = GameDuo.draw("alice", "bob", "2026-10-05", 90, 90, emptyList())!!
        assertThat(low.partTarget).isLessThan(high.partTarget)
        val blocked = GameDuo.draw("alice", "bob", "2026-10-05", 30, 30, listOf(low.signal))!!
        assertThat(blocked.signal).isNotEqualTo(low.signal)
        assertThat(GameDuo.draw("a", "b", "2026-10-05", 30, 30, GameDuo.templates.map { it.signal })).isNull()
    }

    @Test
    fun `l invitation exige le niveau 20 des deux cotes puis l amitie puis un duo libre`() {
        fun invite(me: Int = 20, other: Int = 20, friends: Boolean = true, myDuo: Boolean = false, hisDuo: Boolean = false, self: Boolean = false) =
            GameDuo.canInvite(me, other, friends, myDuo, hisDuo, self)
        assertThat(invite()).isEqualTo(DuoInviteDecision.Allowed)
        assertThat(invite(self = true)).isEqualTo(DuoInviteDecision.Refused(DuoInviteRefusal.Self))
        assertThat(invite(me = 19)).isEqualTo(DuoInviteDecision.Refused(DuoInviteRefusal.Locked))
        assertThat(invite(other = 19)).isEqualTo(DuoInviteDecision.Refused(DuoInviteRefusal.InviteeLocked))
        assertThat(invite(friends = false)).isEqualTo(DuoInviteDecision.Refused(DuoInviteRefusal.NotFriends))
        assertThat(invite(myDuo = true)).isEqualTo(DuoInviteDecision.Refused(DuoInviteRefusal.AlreadyInDuo))
        assertThat(invite(hisDuo = true)).isEqualTo(DuoInviteDecision.Refused(DuoInviteRefusal.InviteeInDuo))
    }
}
