package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GuestJoinErrorTest {

    @Test
    fun status404_isLinkNotFound() {
        assertThat(GuestJoinError.from(404, "nope")).isEqualTo(GuestJoinError.LinkNotFound)
    }

    @Test
    fun status409And410_carryTheServerMessage() {
        assertThat(GuestJoinError.from(409, "Déjà membre")).isEqualTo(GuestJoinError.ServerMessage("Déjà membre"))
        assertThat(GuestJoinError.from(410, "Lien expiré")).isEqualTo(GuestJoinError.ServerMessage("Lien expiré"))
    }

    @Test
    fun status429_isTooManyUsers() {
        assertThat(GuestJoinError.from(429, "slow down")).isEqualTo(GuestJoinError.TooManyUsers)
    }

    @Test
    fun status403_carriesTheReason() {
        assertThat(GuestJoinError.from(403, "Lien désactivé")).isEqualTo(GuestJoinError.ServerMessage("Lien désactivé"))
    }

    @Test
    fun status401_invitesToSignIn() {
        assertThat(GuestJoinError.from(401, "unauthorized")).isEqualTo(GuestJoinError.SignInRequired)
    }

    @Test
    fun serverErrors_areTheGenericConnectionError() {
        assertThat(GuestJoinError.from(500, "boom")).isEqualTo(GuestJoinError.ConnectionFailed)
        assertThat(GuestJoinError.from(503, null)).isEqualTo(GuestJoinError.ConnectionFailed)
    }

    @Test
    fun noStatusAndNoMessage_isTheGenericConnectionError() {
        assertThat(GuestJoinError.from(null, "  ")).isEqualTo(GuestJoinError.ConnectionFailed)
    }

    @Test
    fun noStatusWithAMessage_keepsTheMessage() {
        assertThat(GuestJoinError.from(null, "offline")).isEqualTo(GuestJoinError.ServerMessage("offline"))
    }
}
