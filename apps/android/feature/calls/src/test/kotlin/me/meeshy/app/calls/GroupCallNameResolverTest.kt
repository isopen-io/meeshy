package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.call.ActiveCallRepository
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.ParticipantCacheRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.MemberRoster
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.model.call.ActiveCallParticipant
import me.meeshy.sdk.model.call.ActiveCallParticipantUser
import me.meeshy.sdk.model.call.ActiveCallSession
import org.junit.Test

/**
 * Les noms d'un appel de groupe, cache d'abord (#13754) : la conversation et son trombinoscope en cache nomment
 * tout de suite, l'appel actif lu ensuite complète et dit qui est présent ; un échec garde ce que le cache savait.
 */
class GroupCallNameResolverTest {

    private val conversations: ConversationRepository = mockk()
    private val participants: ParticipantCacheRepository = mockk()
    private val activeCalls: ActiveCallRepository = mockk()
    private val resolver = GroupCallNameResolver(conversations, participants, activeCalls)

    private fun cached(type: String, title: String?) {
        coEvery { conversations.cachedById("conv") } returns ApiConversation(id = "conv", type = type, title = title)
        every { participants.observe("conv") } returns flowOf(
            MemberRoster(members = listOf(PaginatedParticipant(id = "p1", userId = "ada", displayName = "Ada"))),
        )
    }

    @Test
    fun `the cache names at once, then the active call completes it`() = runTest {
        cached(type = "group", title = "Famille")
        coEvery { activeCalls.activeCallFor("conv") } returns ActiveCallSession(
            id = "call-1",
            conversationId = "conv",
            mode = "p2p",
            status = "active",
            participants = listOf(ActiveCallParticipant("bruno", ActiveCallParticipantUser("bruno", "bruno", "Bruno"))),
        )

        val directories = resolver.directoryFor("conv", "call-1").toList()

        assertThat(directories).hasSize(2)
        assertThat(directories[0].groupTitle).isEqualTo("Famille")
        assertThat(directories[0].names.keys).containsExactly("ada")
        assertThat(directories[1].names.mapValues { it.value.displayName }).containsExactly("ada", "Ada", "bruno", "Bruno")
        assertThat(directories[1].presentIds).containsExactly("bruno")
        coVerify(exactly = 0) { conversations.getById(any()) }
    }

    @Test
    fun `a direct conversation lends no group title, and an unreachable active call keeps the cache`() = runTest {
        cached(type = "direct", title = "Ada")
        coEvery { activeCalls.activeCallFor("conv") } throws IllegalStateException("offline")

        val directories = resolver.directoryFor("conv", "call-1").toList()

        assertThat(directories.single().groupTitle).isNull()
        assertThat(directories.single().names.keys).containsExactly("ada")
    }

    @Test
    fun `no conversation, nothing read`() = runTest {
        assertThat(resolver.directoryFor("", "call-1").toList()).isEmpty()
    }
}
