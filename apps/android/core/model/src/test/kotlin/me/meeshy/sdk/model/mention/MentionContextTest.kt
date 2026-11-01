package me.meeshy.sdk.model.mention

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MentionContextTest {

    @Test
    fun `a direct or group conversation only offers its members`() {
        assertThat(MentionContext.conversation("c1", "direct")?.membersOnly).isTrue()
        assertThat(MentionContext.conversation("c1", "GROUP")?.membersOnly).isTrue()
    }

    @Test
    fun `a public, global or broadcast conversation opens to the directory`() {
        listOf("public", "global", "broadcast").forEach { type ->
            assertThat(MentionContext.conversation("c1", type)?.membersOnly).isFalse()
        }
    }

    @Test
    fun `an unknown conversation type fails closed to its members`() {
        assertThat(MentionContext.conversation("c1", null)?.membersOnly).isTrue()
        assertThat(MentionContext.conversation("c1", "mystery")?.membersOnly).isTrue()
    }

    @Test
    fun `a conversation context speaks the wire type conversation`() {
        val context = MentionContext.conversation("c1", "group")
        assertThat(context?.id).isEqualTo("c1")
        assertThat(context?.type?.wire).isEqualTo("conversation")
    }

    @Test
    fun `a post context covers story, reel and mood ids and is never members-only`() {
        val context = MentionContext.post(" p1 ")
        assertThat(context?.id).isEqualTo("p1")
        assertThat(context?.type?.wire).isEqualTo("post")
        assertThat(context?.membersOnly).isFalse()
    }

    @Test
    fun `a blank id is no context at all`() {
        assertThat(MentionContext.post("")).isNull()
        assertThat(MentionContext.post(null)).isNull()
        assertThat(MentionContext.conversation("  ", "group")).isNull()
    }
}
