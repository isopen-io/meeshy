package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AnonymousParticipant
import me.meeshy.sdk.model.AnonymousSessionContext
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.JoinedConversation
import me.meeshy.sdk.model.ParticipantPermissions
import me.meeshy.sdk.model.auth.AnonymousRefreshData
import me.meeshy.sdk.model.auth.AnonymousRefreshRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AnonymousApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import java.io.IOException

/**
 * `POST /anonymous/refresh` renouvelle la session d'un INVITE. Le cas d'usage n'a pas
 * meme la dependance du porte-jetons : il ne peut pas toucher au compte inscrit.
 */
class AnonymousSessionRefresherTest {

    private fun context(canSendFiles: Boolean = false) = AnonymousSessionContext(
        sessionToken = "guest-token",
        participantId = "p1",
        permissions = ParticipantPermissions.anonymous(canSendMessages = true, canSendFiles = canSendFiles, canSendImages = true),
        linkId = "l1",
        conversationId = "c1",
    )

    @Test
    fun `sans session d'invite il n'y a rien a renouveler et rien ne part`() = runTest {
        val api = mockk<AnonymousApi>()

        val result = AnonymousSessionRefresher(api, InMemoryAnonymousSessionStore()).refresh()

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo(AnonymousSessionRefresher.NO_SESSION_CODE)
        coVerify(exactly = 0) { api.refresh(any()) }
    }

    @Test
    fun `le jeton de l'invite part, lui seul`() = runTest {
        val api = mockk<AnonymousApi>()
        coEvery { api.refresh(any()) } returns ApiResponse(success = true, data = AnonymousRefreshData())

        AnonymousSessionRefresher(api, InMemoryAnonymousSessionStore(context())).refresh()

        coVerify { api.refresh(AnonymousRefreshRequest("guest-token")) }
    }

    @Test
    fun `les droits rendus sont durcis et re-persistes`() = runTest {
        val api = mockk<AnonymousApi>()
        coEvery { api.refresh(any()) } returns ApiResponse(
            success = true,
            data = AnonymousRefreshData(
                participant = AnonymousParticipant(id = "p1", canSendMessages = true, canSendFiles = true, canSendImages = false),
                conversation = JoinedConversation(id = "c2"),
            ),
        )
        val store = InMemoryAnonymousSessionStore(context())

        val result = AnonymousSessionRefresher(api, store).refresh()

        val refreshed = (result as NetworkResult.Success).data
        assertThat(refreshed.permissions.canSendFiles).isTrue()
        assertThat(refreshed.permissions.canSendImages).isFalse()
        assertThat(refreshed.permissions.canSendVideos).isFalse()
        assertThat(refreshed.permissions.canSendLinks).isFalse()
        assertThat(refreshed.conversationId).isEqualTo("c2")
        assertThat(refreshed.sessionToken).isEqualTo("guest-token")
        assertThat(store.load()).isEqualTo(refreshed)
    }

    @Test
    fun `une charge sans participant garde la session telle quelle`() = runTest {
        val api = mockk<AnonymousApi>()
        coEvery { api.refresh(any()) } returns ApiResponse(success = true, data = AnonymousRefreshData())
        val store = InMemoryAnonymousSessionStore(context())

        val result = AnonymousSessionRefresher(api, store).refresh()

        assertThat((result as NetworkResult.Success).data).isEqualTo(context())
        assertThat(store.load()).isEqualTo(context())
    }

    @Test
    fun `un refus remonte tel quel et ne detruit pas la session`() = runTest {
        val api = mockk<AnonymousApi>()
        coEvery { api.refresh(any()) } returns ApiResponse(success = false, error = "Lien expire", code = "LINK_EXPIRED")
        val store = InMemoryAnonymousSessionStore(context())

        val result = AnonymousSessionRefresher(api, store).refresh()

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo("LINK_EXPIRED")
        assertThat(store.load()).isEqualTo(context())
    }

    @Test
    fun `hors ligne la session de l'invite reste en place`() = runTest {
        val api = mockk<AnonymousApi>()
        coEvery { api.refresh(any()) } throws IOException("offline")
        val store = InMemoryAnonymousSessionStore(context())

        val result = AnonymousSessionRefresher(api, store).refresh()

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo("NETWORK")
        assertThat(store.load()).isEqualTo(context())
    }

    private suspend fun endOf(status: Int, code: String): me.meeshy.sdk.net.GuestSessionEndSignal? {
        val api = mockk<AnonymousApi>()
        coEvery { api.refresh(any()) } throws retrofit2.HttpException(
            retrofit2.Response.error<Any>(
                status,
                """{"success":false,"code":"$code","error":"$code"}""".toResponseBody("application/json".toMediaType()),
            ),
        )
        return AnonymousSessionRefresher(api, InMemoryAnonymousSessionStore(context())).heldSessionEnd()
    }

    @Test
    fun `un 410 de la session detenue la termine sous le jeton detenu`() = runTest {
        assertThat(endOf(410, "GUEST_ACCESS_REVOKED"))
            .isEqualTo(me.meeshy.sdk.net.GuestSessionEndSignal(me.meeshy.sdk.model.guest.GuestSessionEnd.ACCESS_REVOKED, "guest-token"))
        assertThat(endOf(410, "LINK_EXPIRED")?.end).isEqualTo(me.meeshy.sdk.model.guest.GuestSessionEnd.LINK_EXPIRED)
        assertThat(endOf(410, "LINK_DEACTIVATED")?.refusedToken).isEqualTo("guest-token")
        assertThat(endOf(410, "CONVERSATION_CLOSED")?.refusedToken).isEqualTo("guest-token")
    }

    @Test
    fun `un refus ordinaire du rafraichissement ne termine rien`() = runTest {
        assertThat(endOf(401, "SESSION_INVALID")).isNull()
        assertThat(endOf(500, "INTERNAL")).isNull()
    }

    @Test
    fun `un rafraichissement reussi ou une session absente ne terminent rien`() = runTest {
        val api = mockk<AnonymousApi>()
        coEvery { api.refresh(any()) } returns ApiResponse(success = true, data = AnonymousRefreshData())
        assertThat(AnonymousSessionRefresher(api, InMemoryAnonymousSessionStore(context())).heldSessionEnd()).isNull()
        assertThat(AnonymousSessionRefresher(mockk(), InMemoryAnonymousSessionStore()).heldSessionEnd()).isNull()
    }

    private suspend fun endOfGatewayBody(status: Int, body: String): me.meeshy.sdk.net.GuestSessionEndSignal? {
        val api = mockk<AnonymousApi>()
        coEvery { api.refresh(any()) } throws retrofit2.HttpException(
            retrofit2.Response.error<Any>(status, body.toResponseBody("application/json".toMediaType())),
        )
        return AnonymousSessionRefresher(api, InMemoryAnonymousSessionStore(context())).heldSessionEnd()
    }

    /** Le corps EXACT de `sendError(reply, 410, 'LINK_EXPIRED', { message })` (routes/anonymous.ts) : aucune clé `code`, le motif est dans `error`. */
    @Test
    fun `le 410 tel que la passerelle l ecrit - motif dans error, sans code - termine la session detenue`() = runTest {
        fun gateway(error: String) = """{"success":false,"error":"$error","message":"Le lien a expire"}"""
        assertThat(endOfGatewayBody(410, gateway("GUEST_ACCESS_REVOKED"))?.end).isEqualTo(me.meeshy.sdk.model.guest.GuestSessionEnd.ACCESS_REVOKED)
        assertThat(endOfGatewayBody(410, gateway("LINK_EXPIRED"))?.end).isEqualTo(me.meeshy.sdk.model.guest.GuestSessionEnd.LINK_EXPIRED)
        assertThat(endOfGatewayBody(410, gateway("LINK_DEACTIVATED"))?.refusedToken).isEqualTo("guest-token")
        assertThat(endOfGatewayBody(410, gateway("CONVERSATION_CLOSED"))?.refusedToken).isEqualTo("guest-token")
        assertThat(endOfGatewayBody(401, """{"success":false,"error":"Session invalide ou expiree","code":"SESSION_INVALID"}""")).isNull()
        assertThat(endOfGatewayBody(503, "<html>bad gateway</html>")).isNull()
    }
}
