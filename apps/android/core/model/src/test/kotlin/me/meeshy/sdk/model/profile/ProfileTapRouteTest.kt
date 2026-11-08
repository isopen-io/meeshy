package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.PaginatedParticipant
import org.junit.Test

class ProfileTapRouteTest {
    private fun message(sender: ApiMessageSender?, senderId: String?) =
        ApiMessage(id = "m", conversationId = "c", senderId = senderId, sender = sender)

    @Test
    fun `a message from an account opens the account sheet`() {
        val user = ProfileSheetUser.from(message(ApiMessageSender(id = "p1", userId = "u1", username = "al"), "p1"))
        val route = ProfileTapRoute.of(user) as ProfileTapRoute.Account
        assertThat(route.user.userId).isEqualTo("u1")
    }

    @Test
    fun `an anonymous sender opens the participation sheet with its participant id and never an account`() {
        val user = ProfileSheetUser.from(message(ApiMessageSender(id = "p9", displayName = "Guest"), "p9"))
        val route = ProfileTapRoute.of(user)
        assertThat(route).isInstanceOf(ProfileTapRoute.Participation::class.java)
        assertThat((route as ProfileTapRoute.Participation).participantId).isEqualTo("p9")
        assertThat(route.user.userId).isNull()
    }

    @Test
    fun `an anonymous identity without participant id opens nothing`() {
        assertThat(ProfileTapRoute.of(ProfileSheetUser(username = "x", isAnonymous = true))).isEqualTo(ProfileTapRoute.None)
    }

    @Test
    fun `a member with an account opens the account sheet`() {
        val member = PaginatedParticipant(id = "part1", userId = "u2", username = "bob", displayName = "Bob")
        val route = ProfileTapRoute.of(ProfileSheetUser.from(member)) as ProfileTapRoute.Account
        assertThat(route.user.userId).isEqualTo("u2")
        assertThat(route.user.participantId).isEqualTo("part1")
    }

    @Test
    fun `a member without account opens the participation sheet`() {
        val member = PaginatedParticipant(id = "part7", displayName = "Visitor")
        val route = ProfileTapRoute.of(ProfileSheetUser.from(member)) as ProfileTapRoute.Participation
        assertThat(route.participantId).isEqualTo("part7")
        assertThat(route.user.userId).isNull()
        assertThat(route.user.username).isEqualTo("Visitor")
    }

    @Test
    fun `a direct header peer is an account`() {
        val route = ProfileTapRoute.of(ProfileSheetUser(userId = "64b7f0a1c2d3e4f5a6b7c8d9", username = "bob"))
        assertThat(route).isInstanceOf(ProfileTapRoute.Account::class.java)
    }
}
