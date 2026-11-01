package me.meeshy.sdk.model.mention

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import org.junit.Test

class MentionContextTest {

    @Test
    fun `a direct conversation offers the interlocutor, a group its members`() {
        assertThat(MentionContext.conversation("c1", "direct", isMember = true)?.scope).isEqualTo(MentionableScope.INTERLOCUTOR)
        assertThat(MentionContext.conversation("c1", "group", isMember = true)?.scope).isEqualTo(MentionableScope.MEMBERS)
        assertThat(MentionContext.conversation("c1", "group", isMember = true)?.membersOnly).isTrue()
    }

    @Test
    fun `a public, global or broadcast conversation opens to the directory`() {
        listOf("public", "global", "broadcast").forEach { type ->
            assertThat(MentionContext.conversation("c1", type, isMember = true)?.scope).isEqualTo(MentionableScope.DIRECTORY)
            assertThat(MentionContext.conversation("c1", type, isMember = true)?.membersOnly).isFalse()
        }
    }

    @Test
    fun `an unknown conversation type has no scope and asks nothing (#14071)`() {
        listOf(null, "mystery", "channel").forEach { type ->
            val context = MentionContext.conversation("c1", type, isMember = true)
            assertThat(context?.scope).isNull()
            assertThat(context?.searchesRemotely).isFalse()
        }
    }

    @Test
    fun `a conversation context speaks the wire type conversation`() {
        val context = MentionContext.conversation("c1", "group", isMember = true)
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
    fun `a non-member cites nobody, whatever the conversation type (#14066)`() {
        listOf("public", "global", "broadcast", "group", "direct").forEach { type ->
            val context = MentionContext.conversation("c1", type, isMember = false)
            assertThat(context?.scope).isNull()
            assertThat(context?.searchesRemotely).isFalse()
        }
    }

    @Test
    fun `membership is read from the served role, then from the roster, and unknown fails closed (#14066)`() {
        val public = ApiConversation(id = "c1", type = "public")
        assertThat(MentionContext.of(public, "me")?.scope).isNull()
        assertThat(MentionContext.of(public.copy(currentUserRole = "member"), "me")?.scope)
            .isEqualTo(MentionableScope.DIRECTORY)
        assertThat(MentionContext.of(public.copy(participants = listOf(ApiParticipant(id = "p1", userId = "me"))), "me")?.scope)
            .isEqualTo(MentionableScope.DIRECTORY)
        assertThat(MentionContext.of(public.copy(participants = listOf(ApiParticipant(id = "p1", userId = "other"))), "me")?.scope)
            .isNull()
    }

    @Test
    fun `a share-link guest is a member by its session and never asks the network (#14183)`() {
        val group = ApiConversation(id = "c1", type = "group")
        val context = MentionContext.of(group, currentUserId = "p-guest", isGuest = true)
        assertThat(context?.scope).isEqualTo(MentionableScope.MEMBERS)
        assertThat(context?.searchesRemotely).isFalse()
        assertThat(MentionContext.of(group.copy(currentUserRole = "member"), "me")?.searchesRemotely).isTrue()
    }

    @Test
    fun `a blank id is no context at all`() {
        assertThat(MentionContext.post("")).isNull()
        assertThat(MentionContext.post(null)).isNull()
        assertThat(MentionContext.conversation("  ", "group", isMember = true)).isNull()
        assertThat(MentionContext.interlocutor(" ")).isNull()
    }
}
