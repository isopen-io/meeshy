package me.meeshy.sdk.model.mention

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MentionContextTest {

    @Test
    fun `a direct conversation offers the interlocutor, a group its members`() {
        assertThat(MentionContext.conversation("c1", "direct")?.scope).isEqualTo(MentionableScope.INTERLOCUTOR)
        assertThat(MentionContext.conversation("c1", "GROUP")?.scope).isEqualTo(MentionableScope.MEMBERS)
        assertThat(MentionContext.conversation("c1", "group")?.membersOnly).isTrue()
    }

    @Test
    fun `a public, global or broadcast conversation opens to the directory`() {
        listOf("public", "global", "broadcast").forEach { type ->
            assertThat(MentionContext.conversation("c1", type)?.scope).isEqualTo(MentionableScope.DIRECTORY)
            assertThat(MentionContext.conversation("c1", type)?.membersOnly).isFalse()
        }
    }

    @Test
    fun `an unknown conversation type has no scope and asks nothing (#14071)`() {
        listOf(null, "mystery", "channel").forEach { type ->
            val context = MentionContext.conversation("c1", type)
            assertThat(context?.scope).isNull()
            assertThat(context?.searchesRemotely).isFalse()
        }
    }

    @Test
    fun `a conversation context speaks the wire type conversation`() {
        val context = MentionContext.conversation("c1", "group")
        assertThat(context?.id).isEqualTo("c1")
        assertThat(context?.type?.wire).isEqualTo("conversation")
        assertThat(context?.searchesRemotely).isTrue()
    }

    @Test
    fun `a post context covers story, reel and mood ids and is never members-only`() {
        val context = MentionContext.post(" p1 ")
        assertThat(context?.id).isEqualTo("p1")
        assertThat(context?.type?.wire).isEqualTo("post")
        assertThat(context?.membersOnly).isFalse()
    }

    @Test
    fun `a reply into the author's DM offers the author alone and asks the network nothing (#14071)`() {
        val context = MentionContext.interlocutor(" author ")
        assertThat(context?.id).isEqualTo("author")
        assertThat(context?.scope).isEqualTo(MentionableScope.INTERLOCUTOR)
        assertThat(context?.searchesRemotely).isFalse()
    }

    @Test
    fun `a blank id is no context at all`() {
        assertThat(MentionContext.post("")).isNull()
        assertThat(MentionContext.post(null)).isNull()
        assertThat(MentionContext.conversation("  ", "group")).isNull()
        assertThat(MentionContext.interlocutor(" ")).isNull()
    }
}
