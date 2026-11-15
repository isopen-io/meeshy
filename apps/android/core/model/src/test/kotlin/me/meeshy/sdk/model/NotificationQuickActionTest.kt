package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationQuickActionTest {

    private fun notification(
        type: String,
        actorId: String? = "u1",
        axisKey: String? = null,
    ) = ApiNotification(
        id = "n1",
        type = type,
        actor = actorId?.let { NotificationActor(id = it, username = "ana") },
        metadata = axisKey?.let { NotificationMetadata(axisKey = it) },
    )

    private val connect = NotificationQuickAction.Connect("u1")
    private val write = NotificationQuickAction.Write("u1")

    @Test
    fun `contact rejoint propose se connecter puis ecrire quel que soit l'etat d'amitie`() {
        assertThat(notification("contact_joined").quickActions(isFriend = false)).containsExactly(connect, write).inOrder()
        assertThat(notification("contact_joined").quickActions(isFriend = true)).containsExactly(connect, write).inOrder()
    }

    @Test
    fun `badge invites venus deja ami n'ecrit que`() {
        assertThat(notification("badge_earned", axisKey = "social.invite_joined").quickActions(isFriend = true))
            .containsExactly(write)
    }

    @Test
    fun `badge invites venus non ami ecrit puis se connecte`() {
        assertThat(notification("badge_earned", axisKey = "social.invite_joined").quickActions(isFriend = false))
            .containsExactly(write, connect).inOrder()
    }

    @Test
    fun `les graphies invite_joined et inviteJoined sont tolerees`() {
        assertThat(notification("badge_earned", axisKey = "invite_joined").quickActions(isFriend = true)).containsExactly(write)
        assertThat(notification("badge_earned", axisKey = "inviteJoined").quickActions(isFriend = true)).containsExactly(write)
    }

    @Test
    fun `un badge d'un autre axe n'offre aucun geste`() {
        assertThat(notification("badge_earned", axisKey = "social.friendship").quickActions(isFriend = false)).isEmpty()
        assertThat(notification("badge_earned").quickActions(isFriend = false)).isEmpty()
    }

    @Test
    fun `sans acteur identifie aucun geste`() {
        assertThat(notification("contact_joined", actorId = null).quickActions(isFriend = false)).isEmpty()
        assertThat(notification("contact_joined", actorId = "").quickActions(isFriend = false)).isEmpty()
    }

    @Test
    fun `un autre type n'offre aucun geste`() {
        assertThat(notification("new_message").quickActions(isFriend = false)).isEmpty()
    }
}
