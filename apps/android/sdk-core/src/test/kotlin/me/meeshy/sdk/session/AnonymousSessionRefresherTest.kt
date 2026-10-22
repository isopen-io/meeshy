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
}
