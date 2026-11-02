package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Miroir de `ConversationListViewModel.memberCountAfterMembershipEvent` (iOS) et de `applyMemberCount` (web). */
class MemberCountResolutionTest {

    @Test
    fun `l'effectif absolu du serveur se pose et ne s'incremente pas`() {
        val r = MemberCountResolution.after(current = 3, currentCapped = false, absolute = 9, absoluteCapped = null, delta = +1)

        assertThat(r).isEqualTo(MemberCountResolution(count = 9, capped = false))
    }

    @Test
    fun `l'absolu arrive avec son plafond et les deux se posent ensemble`() {
        val r = MemberCountResolution.after(current = 3, currentCapped = false, absolute = 199, absoluteCapped = true, delta = +1)

        assertThat(r).isEqualTo(MemberCountResolution(count = 199, capped = true))
    }

    @Test
    fun `sans absolu le delta de repli joue`() {
        val r = MemberCountResolution.after(current = 3, currentCapped = false, absolute = null, absoluteCapped = null, delta = +1)

        assertThat(r).isEqualTo(MemberCountResolution(count = 4, capped = false))
    }

    @Test
    fun `sans absolu un compteur plafonne reste gele`() {
        val r = MemberCountResolution.after(current = 199, currentCapped = true, absolute = null, absoluteCapped = null, delta = +1)

        assertThat(r).isEqualTo(MemberCountResolution(count = 199, capped = true))
    }

    @Test
    fun `le plancher a zero vaut pour les deux branches`() {
        assertThat(MemberCountResolution.after(0, false, null, null, -1).count).isEqualTo(0)
        assertThat(MemberCountResolution.after(5, false, -4, null, +1).count).isEqualTo(0)
    }

    @Test
    fun `la conversation porte l'effectif resolu`() {
        val conversation = ApiConversation(id = "c1", serverMemberCount = 3)

        val next = conversation.withMemberCount(MemberCountResolution(count = 4, capped = true))

        assertThat(next.memberCount).isEqualTo(4)
        assertThat(next.memberCountCapped).isTrue()
    }
}
