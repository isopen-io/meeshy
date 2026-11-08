package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.profile.ProfileTapRoute
import me.meeshy.sdk.model.profile.from
import org.junit.Test

/** Où mène le toucher de l'auteur d'une bulle, d'un membre ou de l'en-tête d'un DM (#14748). */
class ChatAuthorTapTest {
    private fun message(sender: ApiMessageSender?, senderId: String?) =
        ApiMessage(id = "m1", conversationId = "c1", senderId = senderId, sender = sender)

    @Test
    fun `un message de compte ouvre la fiche du compte`() {
        val user = ProfileSheetUser.from(message(ApiMessageSender(id = "p1", userId = "u1", username = "alice"), "p1"))

        val route = ProfileTapRoute.of(user)

        assertThat(route).isInstanceOf(ProfileTapRoute.Account::class.java)
        assertThat(user.id).isEqualTo("u1")
    }

    @Test
    fun `un expediteur anonyme ouvre la fiche de participation et jamais un compte`() {
        val user = ProfileSheetUser.from(message(ApiMessageSender(id = "p9", displayName = "Invité"), "p9"))

        val route = ProfileTapRoute.of(user)

        assertThat(route).isInstanceOf(ProfileTapRoute.Participation::class.java)
        assertThat((route as ProfileTapRoute.Participation).participantId).isEqualTo("p9")
        assertThat(user.userId).isNull()
    }

    @Test
    fun `un membre sans compte ouvre sa participation`() {
        val route = ProfileTapRoute.of(ProfileSheetUser.from(PaginatedParticipant(id = "part3", displayName = "Visiteur")))

        assertThat(route).isInstanceOf(ProfileTapRoute.Participation::class.java)
    }

    @Test
    fun `l'en-tete d'un DM ouvre la fiche du pair`() {
        val peer = ProfileSheetUser(userId = "64b7f0a1c2d3e4f5a6b7c8d9", username = "bob", displayName = "Bob")

        assertThat(ProfileTapRoute.of(peer)).isEqualTo(ProfileTapRoute.Account(peer))
    }
}
