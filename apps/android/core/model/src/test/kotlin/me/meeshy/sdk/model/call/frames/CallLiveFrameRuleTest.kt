package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallLiveFrameRuleTest {
    @Test
    fun `la forme d'un identifiant est celle de la passerelle`() {
        assertThat(CallLiveFrameRule.isFrameId("elegant.classic.duo")).isTrue()
        assertThat(CallLiveFrameRule.isFrameId("a-b.c1")).isTrue()
        listOf("", "seul", "A.B", "a..b", "a.b.c.d.e", "a.b c", "x".repeat(97)).forEach {
            assertThat(CallLiveFrameRule.isFrameId(it)).isFalse()
        }
    }

    @Test
    fun `seuls les cadres en direct servant un duo se proposent`() {
        val frames = CallLiveFrameRule.frames()
        assertThat(frames).isNotEmpty()
        assertThat(frames.all { it.serves(2) && it.isOffered(CallFrameSurface.LIVE) }).isTrue()
        assertThat(CallFrameCatalogue.all.any { !it.isOffered(CallFrameSurface.LIVE) }).isTrue()
        assertThat(CallLiveFrameRule.moods()).isNotEmpty()
    }

    @Test
    fun `le cadre n'existe qu'en video a deux`() {
        assertThat(CallLiveFrameRule.mayOffer(participants = 2, showsVideo = true)).isTrue()
        assertThat(CallLiveFrameRule.mayOffer(participants = 3, showsVideo = true)).isFalse()
        assertThat(CallLiveFrameRule.mayOffer(participants = 2, showsVideo = false)).isFalse()
    }

    @Test
    fun `le cadre affiche est un cadre en direct du catalogue, en duo`() {
        val id = CallLiveFrameRule.frames().first().id
        assertThat(CallLiveFrameRule.displayed(id, participants = 2)?.id).isEqualTo(id)
        assertThat(CallLiveFrameRule.displayed(id, participants = 3)).isNull()
        assertThat(CallLiveFrameRule.displayed("inconnu.id", participants = 2)).isNull()
        assertThat(CallLiveFrameRule.displayed(null, participants = 2)).isNull()
        val captureOnly = CallFrameCatalogue.all.first { !it.isOffered(CallFrameSurface.LIVE) }
        assertThat(CallLiveFrameRule.displayed(captureOnly.id, participants = 2)).isNull()
    }

    @Test
    fun `le nom partage remplace celui de l'autre, jamais le mien`() {
        val me = CallFramePerson("me", "Ana", null, isSelf = true)
        val peer = CallFramePerson("p", "Robert", null, isSelf = false)
        assertThat(CallLiveFrameRule.people(listOf(me, peer), " Bob ").map { it.name }).containsExactly("Ana", "Bob").inOrder()
        assertThat(CallLiveFrameRule.people(listOf(me, peer), "  ")).containsExactly(me, peer).inOrder()
        assertThat(CallLiveFrameRule.people(listOf(me, peer), null)).containsExactly(me, peer).inOrder()
    }
}
