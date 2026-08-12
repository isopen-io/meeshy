package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AnonymousJoinRequest
import me.meeshy.sdk.model.AnonymousJoinResponse
import me.meeshy.sdk.model.AnonymousParticipant
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.JoinedConversation
import me.meeshy.sdk.model.LeaveAnonymousRequest
import me.meeshy.sdk.model.ShareLinkInfo
import me.meeshy.sdk.model.toSessionContext
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ShareLinkApi
import org.junit.Test

/**
 * Behavioural spec for [AnonymousSessionRepository] — the guest join / restore /
 * leave use cases. Asserted through the public API and observable side effects
 * (the persisted [AnonymousSessionStore] and the [InMemoryTokenStore] session
 * token), never through the repository's internals.
 *
 * Parity source: iOS `ShareLinkService.joinAnonymously` / `leaveAnonymousSession`
 * plus the persisted `AnonymousSessionContext`. SOTA note: the leave path always
 * drops the local session even when the network call fails, and a malformed join
 * response persists nothing — neither guarantee exists on iOS.
 */
class AnonymousSessionRepositoryTest {

    private class FakeShareLinkApi(
        var joinResponse: ApiResponse<AnonymousJoinResponse> = ApiResponse(success = false),
        var leaveResponse: ApiResponse<Unit> = ApiResponse(success = true, data = Unit),
        var linkInfoResponse: ApiResponse<ShareLinkInfo> = ApiResponse(success = false),
        val joinCalls: MutableList<Pair<String, AnonymousJoinRequest>> = mutableListOf(),
        val leaveCalls: MutableList<LeaveAnonymousRequest> = mutableListOf(),
        val linkInfoCalls: MutableList<String> = mutableListOf(),
    ) : ShareLinkApi {
        override suspend fun getLinkInfo(identifier: String): ApiResponse<ShareLinkInfo> {
            linkInfoCalls += identifier
            return linkInfoResponse
        }

        override suspend fun joinAnonymously(
            linkId: String,
            body: AnonymousJoinRequest,
        ): ApiResponse<AnonymousJoinResponse> {
            joinCalls += linkId to body
            return joinResponse
        }

        override suspend fun leaveAnonymously(body: LeaveAnonymousRequest): ApiResponse<Unit> {
            leaveCalls += body
            return leaveResponse
        }
    }

    private fun joinResponse(
        token: String = "sess-tok",
        participant: AnonymousParticipant? = AnonymousParticipant(
            id = "p1",
            canSendMessages = true,
            canSendFiles = false,
            canSendImages = true,
        ),
        conversation: JoinedConversation? = JoinedConversation(id = "c1"),
        linkId: String = "l1",
    ) = AnonymousJoinResponse(
        sessionToken = token,
        participant = participant,
        conversation = conversation,
        linkId = linkId,
    )

    private fun request() = AnonymousJoinRequest(firstName = "Guest", lastName = "One")

    private fun repository(
        api: ShareLinkApi,
        store: AnonymousSessionStore = InMemoryAnonymousSessionStore(),
        tokenStore: InMemoryTokenStore = InMemoryTokenStore(),
    ): Triple<AnonymousSessionRepository, AnonymousSessionStore, InMemoryTokenStore> =
        Triple(AnonymousSessionRepository(api, store, tokenStore), store, tokenStore)

    // ---- preview ----

    @Test
    fun preview_success_returnsLinkInfoAndTouchesNoSession() = runTest {
        val info = ShareLinkInfo(id = "l1", name = "Design chat", requireNickname = true)
        val api = FakeShareLinkApi(linkInfoResponse = ApiResponse(success = true, data = info))
        val (repo, store, tokenStore) = repository(api)

        val result = repo.preview("design-chat")

        assertThat(api.linkInfoCalls).containsExactly("design-chat")
        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(result.getOrNull()).isEqualTo(info)
        // a preview is a pure read — it must never authenticate or persist anything
        assertThat(store.load()).isNull()
        assertThat(tokenStore.sessionToken).isNull()
    }

    @Test
    fun preview_networkFailure_propagatesAndTouchesNoSession() = runTest {
        val api = FakeShareLinkApi(linkInfoResponse = ApiResponse(success = false, error = "not found"))
        val (repo, store, tokenStore) = repository(api)

        val result = repo.preview("missing")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(store.load()).isNull()
        assertThat(tokenStore.sessionToken).isNull()
    }

    // ---- join ----

    @Test
    fun join_success_persistsHardenedContextAndInstallsSessionToken() = runTest {
        val api = FakeShareLinkApi(ApiResponse(success = true, data = joinResponse(token = "sess-99")))
        val (repo, store, tokenStore) = repository(api)

        val result = repo.join("link-42", request())

        assertThat(api.joinCalls).containsExactly("link-42" to request())
        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        val ctx = result.getOrNull()!!
        assertThat(ctx.sessionToken).isEqualTo("sess-99")
        assertThat(ctx.conversationId).isEqualTo("c1")
        // hardened: server never sent videos/audios/links, and they stay denied
        assertThat(ctx.permissions.canSendMessages).isTrue()
        assertThat(ctx.permissions.canSendFiles).isFalse()
        assertThat(ctx.permissions.canSendVideos).isFalse()
        // side effects: the store holds it and the X-Session-Token is installed
        assertThat(store.load()).isEqualTo(ctx)
        assertThat(tokenStore.sessionToken).isEqualTo("sess-99")
    }

    @Test
    fun join_malformedResponse_returnsFailureAndPersistsNothing() = runTest {
        // a 2xx body that cannot form a real session (no participant)
        val api = FakeShareLinkApi(ApiResponse(success = true, data = joinResponse(participant = null)))
        val (repo, store, tokenStore) = repository(api)

        val result = repo.join("link-1", request())

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat((result as NetworkResult.Failure).error.code).isEqualTo("PARSE")
        assertThat(store.load()).isNull()
        assertThat(tokenStore.sessionToken).isNull()
    }

    @Test
    fun join_blankToken_returnsFailureAndPersistsNothing() = runTest {
        val api = FakeShareLinkApi(ApiResponse(success = true, data = joinResponse(token = "   ")))
        val (repo, store, tokenStore) = repository(api)

        val result = repo.join("link-1", request())

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(store.load()).isNull()
        assertThat(tokenStore.sessionToken).isNull()
    }

    @Test
    fun join_networkFailure_propagatesAndPersistsNothing() = runTest {
        val api = FakeShareLinkApi(ApiResponse(success = false, error = "offline"))
        val (repo, store, tokenStore) = repository(api)

        val result = repo.join("link-1", request())

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(store.load()).isNull()
        assertThat(tokenStore.sessionToken).isNull()
    }

    // ---- restore ----

    @Test
    fun restore_withPersistedSession_reInstallsTheSessionToken() = runTest {
        val stored = joinResponse(token = "sess-restore").toContext()
        val store = InMemoryAnonymousSessionStore(stored)
        val (repo, _, tokenStore) = repository(FakeShareLinkApi(), store)

        val restored = repo.restore()

        assertThat(restored).isEqualTo(stored)
        assertThat(tokenStore.sessionToken).isEqualTo("sess-restore")
    }

    @Test
    fun restore_withNoPersistedSession_returnsNullAndTouchesNothing() = runTest {
        val tokenStore = InMemoryTokenStore(sessionToken = null)
        val (repo, _, ts) = repository(FakeShareLinkApi(), tokenStore = tokenStore)

        val restored = repo.restore()

        assertThat(restored).isNull()
        assertThat(ts.sessionToken).isNull()
    }

    // ---- leave ----

    @Test
    fun leave_withStoredSession_callsServerThenClearsLocalStateAndToken() = runTest {
        val stored = joinResponse(token = "sess-leave").toContext()
        val store = InMemoryAnonymousSessionStore(stored)
        val api = FakeShareLinkApi()
        val (repo, s, tokenStore) = repository(api, store, InMemoryTokenStore(sessionToken = "sess-leave"))

        val result = repo.leave()

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(api.leaveCalls).containsExactly(LeaveAnonymousRequest("sess-leave"))
        assertThat(s.load()).isNull()
        assertThat(tokenStore.sessionToken).isNull()
    }

    @Test
    fun leave_serverFailure_stillClearsLocalStateAndToken() = runTest {
        val stored = joinResponse(token = "sess-x").toContext()
        val store = InMemoryAnonymousSessionStore(stored)
        val api = FakeShareLinkApi(leaveResponse = ApiResponse(success = false, error = "boom"))
        val (repo, s, tokenStore) = repository(api, store, InMemoryTokenStore(sessionToken = "sess-x"))

        val result = repo.leave()

        // the network verdict is surfaced, but the guest is always logged out locally
        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(s.load()).isNull()
        assertThat(tokenStore.sessionToken).isNull()
    }

    @Test
    fun leave_withNoKnownToken_isALocalNoOpThatReportsSuccess() = runTest {
        val api = FakeShareLinkApi()
        val (repo, s, tokenStore) = repository(api)

        val result = repo.leave()

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(api.leaveCalls).isEmpty()
        assertThat(s.load()).isNull()
        assertThat(tokenStore.sessionToken).isNull()
    }

    private fun AnonymousJoinResponse.toContext() = toSessionContext()!!
}
