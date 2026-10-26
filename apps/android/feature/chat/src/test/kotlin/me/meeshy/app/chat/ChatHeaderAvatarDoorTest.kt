package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import org.junit.Test

class ChatHeaderAvatarDoorTest {

    @Test
    fun `un direct avec pair ouvre le profil et propose le menu d'appui long`() {
        val door = ChatHeaderAvatarDoor.resolve(isDirect = true, isGuest = false, peerUserId = "u2", hasConversation = true)
        assertThat(door).isEqualTo(ChatHeaderAvatarDoor.PROFILE)
        assertThat(door.hasLongPressMenu).isTrue()
    }

    @Test
    fun `un direct sans pair connu ouvre les details`() {
        assertThat(ChatHeaderAvatarDoor.resolve(true, false, null, true)).isEqualTo(ChatHeaderAvatarDoor.DETAILS)
        assertThat(ChatHeaderAvatarDoor.resolve(true, false, "", true)).isEqualTo(ChatHeaderAvatarDoor.DETAILS)
    }

    @Test
    fun `un groupe ouvre les details sans menu d'appui long`() {
        val door = ChatHeaderAvatarDoor.resolve(isDirect = false, isGuest = false, peerUserId = null, hasConversation = true)
        assertThat(door).isEqualTo(ChatHeaderAvatarDoor.DETAILS)
        assertThat(door.hasLongPressMenu).isFalse()
    }

    @Test
    fun `un invite ou une conversation pas encore chargee garde la bascule`() {
        assertThat(ChatHeaderAvatarDoor.resolve(true, true, "u2", true)).isEqualTo(ChatHeaderAvatarDoor.TOGGLE)
        assertThat(ChatHeaderAvatarDoor.resolve(false, false, null, false)).isEqualTo(ChatHeaderAvatarDoor.TOGGLE)
    }

    @Test
    fun `les non-lus du retour excluent la conversation ouverte et ne sont jamais negatifs`() {
        val direct = ApiConversation(
            id = "c1",
            type = "direct",
            avatar = "conv.png",
            unreadCount = 3,
            participants = listOf(
                ApiParticipant(id = "p1", userId = "me", username = "moi"),
                ApiParticipant(id = "p2", userId = "u2", username = "fatima", displayName = "Fatima", avatar = "fatima.png"),
            ),
        )
        val state = ChatHeaderController.headerStateOf(direct, totalUnread = 10, readerId = "me")
        assertThat(state.otherConversationsUnread).isEqualTo(7)
        assertThat(state.avatarUrl).isEqualTo("fatima.png")
        assertThat(state.peerUsername).isEqualTo("fatima")
        assertThat(state.peerDisplayName).isEqualTo("Fatima")
        assertThat(ChatHeaderController.headerStateOf(direct, totalUnread = 1, readerId = "me").otherConversationsUnread)
            .isEqualTo(0)
    }

    @Test
    fun `un groupe montre la photo de la conversation et aucun pair`() {
        val group = ApiConversation(id = "g", type = "group", avatar = "g.png")
        val state = ChatHeaderController.headerStateOf(group, totalUnread = 4, readerId = "me")
        assertThat(state.avatarUrl).isEqualTo("g.png")
        assertThat(state.peerUsername).isNull()
        assertThat(state.otherConversationsUnread).isEqualTo(4)
    }
}
