package me.meeshy.sdk.model.socket

import com.google.common.truth.Truth.assertThat
import java.util.Base64
import org.junit.Test

class SocketConnectDecisionTest {

    private val now = 1_000_000.0

    private fun jwtExpiringAt(exp: Double): String {
        val enc = Base64.getUrlEncoder().withoutPadding()
        val payload = enc.encodeToString("""{"exp":$exp}""".toByteArray())
        return "h.$payload.s"
    }

    @Test
    fun `un jwt valide ouvre la connexion inscrite avec sa session`() {
        val jwt = jwtExpiringAt(now + 3600)
        assertThat(SocketConnectDecision.decide(jwt, "s", now))
            .isEqualTo(SocketConnectDecision.ConnectRegistered(jwt, "s"))
    }

    @Test
    fun `un jwt a 31 secondes de l'echeance est encore valide`() {
        val jwt = jwtExpiringAt(now + 31)
        assertThat(SocketConnectDecision.decide(jwt, null, now))
            .isEqualTo(SocketConnectDecision.ConnectRegistered(jwt, null))
    }

    @Test
    fun `un jwt a 29 secondes de l'echeance declenche d'abord le renouvellement`() {
        val jwt = jwtExpiringAt(now + 29)
        assertThat(SocketConnectDecision.decide(jwt, "s", now))
            .isEqualTo(SocketConnectDecision.RefreshFirst(jwt))
    }

    @Test
    fun `un jwt illisible est traite comme echu`() {
        assertThat(SocketConnectDecision.decide("garbage", null, now))
            .isEqualTo(SocketConnectDecision.RefreshFirst("garbage"))
    }

    @Test
    fun `sans jwt un invite se connecte par sa session`() {
        assertThat(SocketConnectDecision.decide(null, "anon", now))
            .isEqualTo(SocketConnectDecision.ConnectGuest("anon"))
    }

    @Test
    fun `sans aucun justificatif il n'y a rien a ouvrir`() {
        assertThat(SocketConnectDecision.decide(null, null, now))
            .isEqualTo(SocketConnectDecision.NoCredentials)
        assertThat(SocketConnectDecision.decide("", " ", now))
            .isEqualTo(SocketConnectDecision.NoCredentials)
    }
}
