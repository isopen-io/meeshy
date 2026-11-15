package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class HeaderCallEntryTest {

    private fun resolve(
        type: String = "direct",
        role: String? = "member",
        platform: String? = "USER",
        guest: Boolean = false,
        id: String = "conv-1",
        peer: String? = "peer-1",
    ) = HeaderCallEntry.resolve(
        conversationId = id,
        conversationType = type,
        viewerConversationRole = role,
        viewerPlatformRole = platform,
        viewerIsGuest = guest,
        directPeerUserId = peer,
    )

    @Test
    fun `a direct conversation with a known peer offers a call that can start`() {
        assertThat(resolve()).isEqualTo(HeaderCallEntry(callee = HeaderCallEntry.Callee.Peer("peer-1"), canStart = true))
    }

    @Test
    fun `a direct conversation without a known peer offers no call`() {
        assertThat(resolve(peer = null)).isNull()
        assertThat(resolve(peer = "")).isNull()
    }

    @Test
    fun `a guest never sees a call button`() {
        assertThat(resolve(guest = true)).isNull()
        assertThat(resolve(type = "group", guest = true)).isNull()
    }

    @Test
    fun `a global conversation never offers a call`() {
        assertThat(resolve(type = "global", role = "admin", platform = "BIGBOSS")).isNull()
    }

    @Test
    fun `a broadcast or unknown type offers no call`() {
        assertThat(resolve(type = "broadcast")).isNull()
        assertThat(resolve(type = "something")).isNull()
    }

    @Test
    fun `a group conversation calls the conversation`() {
        assertThat(resolve(type = "group", peer = null))
            .isEqualTo(HeaderCallEntry(callee = HeaderCallEntry.Callee.Conversation, canStart = true))
    }

    @Test
    fun `a plain member of a public conversation may only join, never start`() {
        assertThat(resolve(type = "public", role = "member", peer = null))
            .isEqualTo(HeaderCallEntry(callee = HeaderCallEntry.Callee.Conversation, canStart = false))
    }

    @Test
    fun `the creator or an admin of a public conversation may start a call`() {
        assertThat(resolve(type = "public", role = "CREATOR")?.canStart).isTrue()
        assertThat(resolve(type = "public", role = "admin")?.canStart).isTrue()
        assertThat(resolve(type = "public", role = "member", platform = "ADMIN")?.canStart).isTrue()
    }

    @Test
    fun `a conversation without id offers no call`() {
        assertThat(resolve(type = "group", id = "")).isNull()
    }
}
