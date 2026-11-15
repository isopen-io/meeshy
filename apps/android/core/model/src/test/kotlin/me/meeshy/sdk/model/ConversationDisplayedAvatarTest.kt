package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #12569 (miroir d'iOS `isDirect ? participantAvatarURL : avatar`, `LentilleConversationRow`, et du
 * web `avatarOf`) — la photo d'une ligne de conversation : celle du PAIR en direct, celle de la
 * CONVERSATION en groupe. Jamais l'une à la place de l'autre.
 */
class ConversationDisplayedAvatarTest {

    private val reader = ApiParticipant(id = "p1", userId = "u-me", avatar = "me.png")
    private val peer = ApiParticipant(id = "p2", userId = "u-peer", avatar = "2026/09/peer/photo.png")

    @Test
    fun `un direct montre la photo du pair, pas celle du lecteur`() {
        val conversation = ApiConversation(id = "c", type = "direct", participants = listOf(reader, peer), avatar = "groupe.png")

        assertThat(conversation.displayedAvatar("u-me")).isEqualTo("2026/09/peer/photo.png")
    }

    @Test
    fun `un groupe montre la photo de la conversation, pas celle d'un membre`() {
        val conversation = ApiConversation(id = "c", type = "group", participants = listOf(reader, peer), avatar = "groupe.png")

        assertThat(conversation.displayedAvatar("u-me")).isEqualTo("groupe.png")
    }

    @Test
    fun `un groupe sans photo ne montre aucune photo`() {
        val conversation = ApiConversation(id = "c", type = "group", participants = listOf(reader, peer))

        assertThat(conversation.displayedAvatar("u-me")).isNull()
    }

    @Test
    fun `un direct dont le pair n'a pas de photo ne retombe pas sur celle de la conversation`() {
        val sansPhoto = peer.copy(avatar = null)
        val conversation = ApiConversation(id = "c", type = "direct", participants = listOf(reader, sansPhoto), avatar = "legacy.png")

        assertThat(conversation.displayedAvatar("u-me")).isNull()
    }

    @Test
    fun `un lecteur inconnu n'elit personne et ne montre donc pas la photo du lecteur`() {
        val conversation = ApiConversation(id = "c", type = "direct", participants = listOf(reader, peer))

        assertThat(conversation.displayedAvatar(null)).isNull()
        assertThat(conversation.displayedAvatar("")).isNull()
    }

    @Test
    fun `une photo blanche n'est pas une photo`() {
        val conversation = ApiConversation(id = "c", type = "group", avatar = "  ")

        assertThat(conversation.displayedAvatar("u-me")).isNull()
    }
}
