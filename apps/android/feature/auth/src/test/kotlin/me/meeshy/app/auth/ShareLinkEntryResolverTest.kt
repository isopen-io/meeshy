package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AnonymousSessionContext
import me.meeshy.sdk.model.ParticipantPermissions
import me.meeshy.sdk.model.ShareLinkConversation
import me.meeshy.sdk.model.ShareLinkEntryIntent
import me.meeshy.sdk.model.ShareLinkInfo
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.InMemoryAnonymousSessionStore
import org.junit.Test

/**
 * Behavioural spec for [ShareLinkEntryResolver] — the app-side fact-assembly that
 * turns a share-link identifier into a routing [ShareLinkEntryIntent]. It drives
 * the resolver through its public `resolve`, injecting a recording preview seam
 * and an in-memory guest-session store; the pure decision itself is exhaustively
 * covered by `ShareLinkEntryPolicyTest`, so these tests assert only the resolver's
 * own contribution: the network read, the fact wiring, and the null degradations.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ShareLinkEntryResolverTest {

    private class RecordingPreview(
        var result: NetworkResult<ShareLinkInfo>,
        val requested: MutableList<String> = mutableListOf(),
    ) : ShareLinkPreviewProviding {
        override suspend fun preview(identifier: String): NetworkResult<ShareLinkInfo> {
            requested += identifier
            return result
        }
    }

    private fun info(
        conversation: ShareLinkConversation? = ShareLinkConversation(id = "c1", title = "Design chat"),
        requireAccount: Boolean = false,
    ): ShareLinkInfo = ShareLinkInfo(
        id = "link-1",
        requireAccount = requireAccount,
        conversation = conversation,
    )

    private fun storedSession(linkId: String) = AnonymousSessionContext(
        sessionToken = "sess",
        participantId = "p1",
        permissions = ParticipantPermissions.anonymous(
            canSendMessages = true,
            canSendFiles = false,
            canSendImages = false,
        ),
        linkId = linkId,
        conversationId = "c1",
    )

    private fun resolver(
        preview: RecordingPreview,
        store: InMemoryAnonymousSessionStore = InMemoryAnonymousSessionStore(),
    ) = ShareLinkEntryResolver(previewProvider = preview, sessionStore = store)

    @Test
    fun `blank identifier is inert and never touches the network`() = runTest {
        val preview = RecordingPreview(NetworkResult.Success(info()))

        val resolution = resolver(preview).resolve(
            identifier = "   ",
            isAuthenticated = true,
            knownConversationIds = emptySet(),
        )

        assertThat(resolution).isNull()
        assertThat(preview.requested).isEmpty()
    }

    @Test
    fun `preview failure resolves to null`() = runTest {
        val preview = RecordingPreview(
            NetworkResult.Failure(ApiError(message = "boom", code = "NET")),
        )

        val resolution = resolver(preview).resolve(
            identifier = "design-chat",
            isAuthenticated = true,
            knownConversationIds = emptySet(),
        )

        assertThat(resolution).isNull()
    }

    @Test
    fun `preview without a conversation resolves to null`() = runTest {
        val preview = RecordingPreview(NetworkResult.Success(info(conversation = null)))

        val resolution = resolver(preview).resolve(
            identifier = "design-chat",
            isAuthenticated = false,
            knownConversationIds = emptySet(),
        )

        assertThat(resolution).isNull()
    }

    @Test
    fun `preview with a blank conversation id resolves to null`() = runTest {
        val preview = RecordingPreview(
            NetworkResult.Success(info(conversation = ShareLinkConversation(id = "   "))),
        )

        val resolution = resolver(preview).resolve(
            identifier = "design-chat",
            isAuthenticated = false,
            knownConversationIds = emptySet(),
        )

        assertThat(resolution).isNull()
    }

    @Test
    fun `unauthenticated open link with no stored session joins anonymously`() = runTest {
        val preview = RecordingPreview(NetworkResult.Success(info(requireAccount = false)))

        val resolution = resolver(preview).resolve(
            identifier = "design-chat",
            isAuthenticated = false,
            knownConversationIds = emptySet(),
        )

        assertThat(resolution?.intent).isEqualTo(ShareLinkEntryIntent.JoinAnonymously)
        assertThat(preview.requested).containsExactly("design-chat")
    }

    @Test
    fun `unauthenticated with a stored session for this link resumes it`() = runTest {
        val preview = RecordingPreview(NetworkResult.Success(info()))
        val store = InMemoryAnonymousSessionStore(storedSession(linkId = "design-chat"))

        val resolution = resolver(preview, store).resolve(
            identifier = "design-chat",
            isAuthenticated = false,
            knownConversationIds = emptySet(),
        )

        assertThat(resolution?.intent).isEqualTo(ShareLinkEntryIntent.ResumeGuestSession)
    }

    @Test
    fun `a stored session for a different link does not count as stored for this one`() = runTest {
        val preview = RecordingPreview(NetworkResult.Success(info(requireAccount = false)))
        val store = InMemoryAnonymousSessionStore(storedSession(linkId = "other-link"))

        val resolution = resolver(preview, store).resolve(
            identifier = "design-chat",
            isAuthenticated = false,
            knownConversationIds = emptySet(),
        )

        assertThat(resolution?.intent).isEqualTo(ShareLinkEntryIntent.JoinAnonymously)
    }

    @Test
    fun `authenticated member opens the resolved conversation`() = runTest {
        val preview = RecordingPreview(
            NetworkResult.Success(info(conversation = ShareLinkConversation(id = "c1", title = "Design chat"))),
        )

        val resolution = resolver(preview).resolve(
            identifier = "design-chat",
            isAuthenticated = true,
            knownConversationIds = setOf("c1"),
        )

        assertThat(resolution?.intent)
            .isEqualTo(ShareLinkEntryIntent.OpenConversation(conversationId = "c1"))
    }

    @Test
    fun `authenticated non-member on an account-only link joins with the account`() = runTest {
        val preview = RecordingPreview(NetworkResult.Success(info(requireAccount = true)))

        val resolution = resolver(preview).resolve(
            identifier = "design-chat",
            isAuthenticated = true,
            knownConversationIds = emptySet(),
        )

        assertThat(resolution?.intent)
            .isEqualTo(ShareLinkEntryIntent.JoinWithAccount(conversationId = "c1"))
    }

    @Test
    fun `authenticated non-member on an open link is asked to choose an identity`() = runTest {
        val preview = RecordingPreview(NetworkResult.Success(info(requireAccount = false)))

        val resolution = resolver(preview).resolve(
            identifier = "design-chat",
            isAuthenticated = true,
            knownConversationIds = emptySet(),
        )

        assertThat(resolution?.intent)
            .isEqualTo(ShareLinkEntryIntent.ChooseIdentity(conversationId = "c1"))
    }

    @Test
    fun `the conversation title is threaded through the resolution`() = runTest {
        val preview = RecordingPreview(
            NetworkResult.Success(info(conversation = ShareLinkConversation(id = "c1", title = "Weekend trip"))),
        )

        val resolution = resolver(preview).resolve(
            identifier = "design-chat",
            isAuthenticated = false,
            knownConversationIds = emptySet(),
        )

        assertThat(resolution?.conversationTitle).isEqualTo("Weekend trip")
    }

    @Test
    fun `a missing conversation title resolves to a null title, not a crash`() = runTest {
        val preview = RecordingPreview(
            NetworkResult.Success(info(conversation = ShareLinkConversation(id = "c1", title = null))),
        )

        val resolution = resolver(preview).resolve(
            identifier = "design-chat",
            isAuthenticated = false,
            knownConversationIds = emptySet(),
        )

        assertThat(resolution).isNotNull()
        assertThat(resolution?.conversationTitle).isNull()
    }

    @Test
    fun `the identifier is trimmed before the preview and the stored-session compare`() = runTest {
        val preview = RecordingPreview(NetworkResult.Success(info()))
        val store = InMemoryAnonymousSessionStore(storedSession(linkId = "design-chat"))

        val resolution = resolver(preview, store).resolve(
            identifier = "  design-chat  ",
            isAuthenticated = false,
            knownConversationIds = emptySet(),
        )

        assertThat(preview.requested).containsExactly("design-chat")
        assertThat(resolution?.intent).isEqualTo(ShareLinkEntryIntent.ResumeGuestSession)
    }

    @Test
    fun `a padded conversation id is trimmed for membership and threading`() = runTest {
        val preview = RecordingPreview(
            NetworkResult.Success(info(conversation = ShareLinkConversation(id = "  c1  ", title = "t"))),
        )

        val resolution = resolver(preview).resolve(
            identifier = "design-chat",
            isAuthenticated = true,
            knownConversationIds = setOf("c1"),
        )

        assertThat(resolution?.intent)
            .isEqualTo(ShareLinkEntryIntent.OpenConversation(conversationId = "c1"))
    }
}
