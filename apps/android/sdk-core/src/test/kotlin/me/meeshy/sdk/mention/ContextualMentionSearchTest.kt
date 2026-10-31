package me.meeshy.sdk.mention

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.mention.MentionContext
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MentionSuggestionDto
import me.meeshy.sdk.net.api.MentionsApi
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.user.UserRepository
import org.junit.Test
import java.io.IOException

class ContextualMentionSearchTest {

    private val api = mockk<MentionsApi>()
    private val users = mockk<UserRepository>()
    private val names = UserDisplayNameCache()
    private val search = ContextualMentionSearch(api, DirectoryMentionSearch(users, names), names)

    @Test
    fun `a post context asks the gateway suggestions and keeps their order`() = runTest {
        coEvery { api.suggestions("p1", "post", "ann") } returns ApiResponse(
            success = true,
            data = listOf(
                MentionSuggestionDto(id = "u2", username = "annie", displayName = "Annie", group = "known"),
                MentionSuggestionDto(id = "u3", username = " ", displayName = "Nameless"),
                MentionSuggestionDto(id = "u1", username = "anna", displayName = null, group = "context"),
            ),
        )

        val found = search.suggest("ann", MentionContext.post("p1"))

        assertThat(found.map { it.username }).containsExactly("annie", "anna").inOrder()
        assertThat(found.last().displayName).isEqualTo("anna")
        assertThat(names.displayName("annie")).isEqualTo("Annie")
    }

    @Test
    fun `a conversation context speaks contextType conversation`() = runTest {
        coEvery { api.suggestions(any(), any(), any()) } returns ApiResponse(success = true, data = emptyList())

        search.suggest("bob", MentionContext.conversation("c1", "group"))

        coVerify(exactly = 1) { api.suggestions("c1", "conversation", "bob") }
    }

    @Test
    fun `without a context the directory answers`() = runTest {
        coEvery { users.searchUsers("zo", any(), any()) } returns
            NetworkResult.Success(listOf(UserSearchResult(id = "u9", username = "zoe")))

        val found = search.suggest("zo", null)

        assertThat(found.map { it.username }).containsExactly("zoe")
        coVerify(exactly = 0) { api.suggestions(any(), any(), any()) }
    }

    @Test
    fun `a failed contextual lookup is empty and never falls back to the directory`() = runTest {
        coEvery { api.suggestions(any(), any(), any()) } throws IOException("offline")
        coEvery { users.searchUsers(any(), any(), any()) } returns NetworkResult.Failure(ApiError("unused"))

        val found = search.suggest("bob", MentionContext.conversation("c1", "group"))

        assertThat(found).isEmpty()
        coVerify(exactly = 0) { users.searchUsers(any(), any(), any()) }
    }
}
