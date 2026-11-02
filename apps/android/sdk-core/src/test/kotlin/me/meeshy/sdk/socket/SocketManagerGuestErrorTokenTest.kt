package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

/**
 * Une erreur serveur porte le jeton d'invite presente au handshake de LA socket qui l'a recue : pendant un appel la
 * coupure est differee, l'ancienne socket survit a la fin de sa session, et son refus ne doit jamais viser la session
 * ouverte depuis sur le meme appareil (#13464).
 */
class SocketManagerGuestErrorTokenTest {

    @Test
    fun `l erreur d une socket invitee porte le jeton de son handshake meme apres un nouveau jeton`() = runTest {
        val rig = SocketRig(jwt = null, session = "guest-A")
        rig.manager.connect()
        val socket = rig.factory.created.single()
        rig.store.sessionToken = "guest-B"

        rig.manager.serverErrors.test {
            socket.fire("error", """{"code":"GUEST_ACCESS_REVOKED"}""")
            val error = awaitItem()
            assertThat(error.payload).isEqualTo("""{"code":"GUEST_ACCESS_REVOKED"}""")
            assertThat(error.guestSessionToken).isEqualTo("guest-A")
        }
    }

    @Test
    fun `l erreur d une socket de compte ne nomme aucune session invitee`() = runTest {
        val rig = SocketRig(jwt = validJwt, session = "sess")
        rig.manager.connect()

        rig.manager.serverErrors.test {
            rig.factory.created.single().fire("error", "boom")
            assertThat(awaitItem().guestSessionToken).isNull()
        }
    }
}
