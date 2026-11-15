package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ProfileCallRequestTest {
    private fun shared(id: String, direct: Boolean = true, peer: String? = null) =
        ProfileSharedConversation(id, direct, peer)

    private fun request(userId: String?, conversations: List<ProfileSharedConversation>) =
        ProfileCallRequest.of(userId, "Al", true, conversations)

    @Test
    fun `blank or null user id yields no request`() {
        assertThat(request(null, emptyList())).isNull()
        assertThat(request("", emptyList())).isNull()
        assertThat(request("   ", emptyList())).isNull()
    }

    @Test
    fun `picks the first direct conversation with a null or matching peer`() {
        val conversations = listOf(
            shared("g", direct = false),
            shared("d-other", peer = "other"),
            shared("d-null", peer = null),
            shared("d-peer", peer = "u"),
        )
        assertThat(request(" u ", conversations)?.conversationId).isEqualTo("d-null")
        assertThat(request("u", conversations)?.userId).isEqualTo("u")
    }

    @Test
    fun `no common direct conversation leaves conversationId null`() {
        assertThat(request("u", listOf(shared("g", direct = false)))?.conversationId).isNull()
    }
}
