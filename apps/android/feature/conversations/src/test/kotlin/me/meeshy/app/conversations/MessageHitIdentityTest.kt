package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.search.MessageSearchHit
import org.junit.Test

/**
 * #12569 — la ligne d'un message trouvé se nomme et se montre par SA conversation, élue contre le
 * lecteur : le nom et la photo sont vrais ensemble ou faux ensemble (`displayTitle` / `displayedAvatar`).
 */
class MessageHitIdentityTest {

    private val reader = ApiParticipant(id = "p1", userId = "u-me", displayName = "Moi", avatar = "me.png")
    private val bob = ApiParticipant(id = "p2", userId = "u-bob", displayName = "Bob Martin", avatar = "2026/09/bob/photo.png")

    private fun hit(conversation: ApiConversation?, storedTitle: String = "") =
        MessageSearchHit(ApiMessage(id = "m1", conversationId = "c1"), storedTitle, conversation)

    @Test
    fun `un direct se nomme et se montre par son interlocuteur, jamais par un titre vide`() {
        val direct = ApiConversation(id = "c1", type = "direct", participants = listOf(reader, bob))

        assertThat(hit(direct).identity("u-me"))
            .isEqualTo(MessageHitIdentity(title = "Bob Martin", avatarUrl = "2026/09/bob/photo.png"))
    }

    @Test
    fun `un groupe garde son titre et sa photo`() {
        val group = ApiConversation(id = "c1", type = "group", title = "Les Amis", avatar = "2026/09/g.png", participants = listOf(reader, bob))

        assertThat(hit(group, storedTitle = "Les Amis").identity("u-me"))
            .isEqualTo(MessageHitIdentity(title = "Les Amis", avatarUrl = "2026/09/g.png"))
    }

    @Test
    fun `sans conversation connue la ligne garde le titre servi, sans photo`() {
        assertThat(hit(conversation = null, storedTitle = "Archive").identity("u-me"))
            .isEqualTo(MessageHitIdentity(title = "Archive", avatarUrl = null))
    }
}
