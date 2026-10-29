package me.meeshy.sdk.model.call.group

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallRules
import org.junit.Test

class GroupCallRosterTest {

    private fun roster(vararg ids: String) =
        ids.fold(GroupCallRoster(localUserId = "me")) { acc, id -> acc.admitting(GroupCallArrival(id)) }

    @Test
    fun `members keep their arrival order`() {
        assertThat(roster("b", "a", "c").members.map { it.userId }).containsExactly("b", "a", "c").inOrder()
    }

    @Test
    fun `I am never a member, nor is a blank id`() {
        val admitted = roster("me", "", "a")
        assertThat(admitted.members.map { it.userId }).containsExactly("a")
    }

    @Test
    fun `the capacity is the gateway's, me included`() {
        val full = roster("a", "b", "c", "d", "e")
        assertThat(full.capacity).isEqualTo(CallRules.MAX_PARTICIPANTS)
        assertThat(full.participantCount).isEqualTo(6)
        assertThat(full.isFull).isTrue()
        assertThat(full.admitting(GroupCallArrival("f")).members).hasSize(5)
    }

    @Test
    fun `an arrival already present is enriched, never duplicated`() {
        val enriched = roster("a")
            .admitting(GroupCallArrival("a", displayName = "Ada", isAudioEnabled = false, isVideoEnabled = true), isPrimary = true)
        val ada = enriched.member("a")!!
        assertThat(enriched.members).hasSize(1)
        assertThat(ada.displayName).isEqualTo("Ada")
        assertThat(ada.isMicMuted).isTrue()
        assertThat(ada.isCameraOn).isTrue()
        assertThat(ada.isPrimary).isTrue()
    }

    @Test
    fun `a blank name never erases a known one`() {
        val named = roster("a").admitting(GroupCallArrival("a", displayName = "Ada"))
        assertThat(named.admitting(GroupCallArrival("a", displayName = " ")).member("a")!!.displayName).isEqualTo("Ada")
    }

    @Test
    fun `a media toggle reaches only its member`() {
        val toggled = roster("a", "b")
            .applying(GroupCallMediaKind.Video, enabled = true, userId = "b")
            .applying(GroupCallMediaKind.Audio, enabled = false, userId = "b")
            .applying(GroupCallMediaKind.Screen, enabled = true, userId = "z")
        assertThat(toggled.member("a")!!.isCameraOn).isFalse()
        assertThat(toggled.member("b")!!.isCameraOn).isTrue()
        assertThat(toggled.member("b")!!.isMicMuted).isTrue()
        assertThat(toggled.members).hasSize(2)
    }

    @Test
    fun `a link state and a departure update the roster`() {
        val updated = roster("a", "b").updatingLink(GroupCallLinkState.Connected, "a").removing("b")
        assertThat(updated.members.map { it.userId to it.link }).containsExactly("a" to GroupCallLinkState.Connected)
    }

    @Test
    fun `the media kind reads the wire value`() {
        assertThat(GroupCallMediaKind.fromWire("screen")).isEqualTo(GroupCallMediaKind.Screen)
        assertThat(GroupCallMediaKind.fromWire("hologram")).isNull()
    }
}
