package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SessionRevocationTest {
    @Test
    fun `chaque motif du fil est decode`() {
        val expected = mapOf(
            "admin_revoke" to SessionRevocationReason.ADMIN_REVOKE,
            "user_revoke" to SessionRevocationReason.USER_REVOKE,
            "password_changed" to SessionRevocationReason.PASSWORD_CHANGED,
            "logout" to SessionRevocationReason.LOGOUT,
            "logout_all_devices" to SessionRevocationReason.LOGOUT_ALL_DEVICES,
            "session_expired" to SessionRevocationReason.SESSION_EXPIRED,
            "activation_required" to SessionRevocationReason.ACTIVATION_REQUIRED,
        )
        expected.forEach { (wire, reason) ->
            assertThat(SessionRevocationReason.fromSocketPayload("""{"code":"X","reason":"$wire"}""")).isEqualTo(reason)
        }
    }

    @Test
    fun `un motif inconnu d'un ancien binaire devient inconnu sans erreur`() {
        assertThat(SessionRevocationReason.fromSocketPayload("""{"reason":"quarantine_v9"}""")).isEqualTo(SessionRevocationReason.UNKNOWN)
    }

    @Test
    fun `une charge sans motif, vide ou illisible est une fermeture generique`() {
        assertThat(SessionRevocationReason.fromSocketPayload("""{"code":"SESSION_REVOKED"}""")).isEqualTo(SessionRevocationReason.UNKNOWN)
        assertThat(SessionRevocationReason.fromSocketPayload("")).isEqualTo(SessionRevocationReason.UNKNOWN)
        assertThat(SessionRevocationReason.fromSocketPayload(null)).isEqualTo(SessionRevocationReason.UNKNOWN)
        assertThat(SessionRevocationReason.fromSocketPayload("pas du json")).isEqualTo(SessionRevocationReason.UNKNOWN)
        assertThat(SessionRevocationReason.fromSocketPayload("""{"reason":42}""")).isEqualTo(SessionRevocationReason.UNKNOWN)
    }

    @Test
    fun `le contact support n'est offert que pour la fermeture admin et le mot de passe change`() {
        val offering = SessionRevocationReason.entries.filter { it.offersContact }
        assertThat(offering).containsExactly(SessionRevocationReason.ADMIN_REVOKE, SessionRevocationReason.PASSWORD_CHANGED)
    }

    @Test
    fun `fromWire null ne correspond pas a inconnu par son fil`() {
        assertThat(SessionRevocationReason.fromWire(null)).isEqualTo(SessionRevocationReason.UNKNOWN)
        assertThat(SessionRevocationReason.fromWire("unknown")).isEqualTo(SessionRevocationReason.UNKNOWN)
    }
}
