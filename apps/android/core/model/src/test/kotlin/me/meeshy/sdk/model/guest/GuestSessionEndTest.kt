package me.meeshy.sdk.model.guest

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GuestSessionEndTest {
    @Test
    fun `un lien echu est un 403 SHARE_LINK_EXPIRED`() {
        assertThat(GuestSessionEnd.from(403, code = "SHARE_LINK_EXPIRED", error = null)).isEqualTo(GuestSessionEnd.LINK_EXPIRED)
    }

    @Test
    fun `un acces retire est un 410 GUEST_ACCESS_REVOKED lu dans code ou dans error`() {
        assertThat(GuestSessionEnd.from(410, code = "GUEST_ACCESS_REVOKED", error = null)).isEqualTo(GuestSessionEnd.ACCESS_REVOKED)
        assertThat(GuestSessionEnd.from(410, code = null, error = "GUEST_ACCESS_REVOKED")).isEqualTo(GuestSessionEnd.ACCESS_REVOKED)
    }

    @Test
    fun `un code egare sous un autre statut ne termine rien`() {
        assertThat(GuestSessionEnd.from(401, code = "GUEST_ACCESS_REVOKED", error = null)).isNull()
        assertThat(GuestSessionEnd.from(410, code = "SHARE_LINK_EXPIRED", error = null)).isNull()
        assertThat(GuestSessionEnd.from(403, code = "FORBIDDEN", error = null)).isNull()
    }

    @Test
    fun `le socket dit le code sans statut`() {
        assertThat(GuestSessionEnd.fromCode("SHARE_LINK_EXPIRED")).isEqualTo(GuestSessionEnd.LINK_EXPIRED)
        assertThat(GuestSessionEnd.fromCode("GUEST_ACCESS_REVOKED")).isEqualTo(GuestSessionEnd.ACCESS_REVOKED)
        assertThat(GuestSessionEnd.fromCode("x")).isNull()
    }

    @Test
    fun `la fin vise la session refusee et jamais une session ouverte depuis`() {
        assertThat(GuestSessionEnd.targets(currentToken = "a", refusedToken = "a")).isTrue()
        assertThat(GuestSessionEnd.targets(currentToken = "b", refusedToken = "a")).isFalse()
        assertThat(GuestSessionEnd.targets(currentToken = "a", refusedToken = null)).isFalse()
        assertThat(GuestSessionEnd.targets(currentToken = null, refusedToken = null)).isFalse()
    }

    @Test
    fun `l evenement socket error porte le code dans sa charge JSON`() {
        assertThat(GuestSessionEnd.fromSocketPayload("""{"message":"This share link has expired","code":"SHARE_LINK_EXPIRED"}""")).isEqualTo(GuestSessionEnd.LINK_EXPIRED)
        assertThat(GuestSessionEnd.fromSocketPayload("""{"code":"GUEST_ACCESS_REVOKED"}""")).isEqualTo(GuestSessionEnd.ACCESS_REVOKED)
        assertThat(GuestSessionEnd.fromSocketPayload("""{"code":"RATE_LIMIT"}""")).isNull()
        assertThat(GuestSessionEnd.fromSocketPayload("boom")).isNull()
        assertThat(GuestSessionEnd.fromSocketPayload("")).isNull()
    }

    @Test
    fun `la reponse du rafraichissement de la session detenue lit les quatre 410 qui la terminent`() {
        assertThat(GuestSessionEnd.fromRefresh(410, "GUEST_ACCESS_REVOKED")).isEqualTo(GuestSessionEnd.ACCESS_REVOKED)
        assertThat(GuestSessionEnd.fromRefresh(410, "LINK_EXPIRED")).isEqualTo(GuestSessionEnd.LINK_EXPIRED)
        assertThat(GuestSessionEnd.fromRefresh(410, "LINK_DEACTIVATED")).isEqualTo(GuestSessionEnd.LINK_EXPIRED)
        assertThat(GuestSessionEnd.fromRefresh(410, "CONVERSATION_CLOSED")).isEqualTo(GuestSessionEnd.LINK_EXPIRED)
    }

    @Test
    fun `le rafraichissement ne lit ni un autre statut ni un autre code`() {
        assertThat(GuestSessionEnd.fromRefresh(401, "LINK_EXPIRED")).isNull()
        assertThat(GuestSessionEnd.fromRefresh(403, "LINK_EXPIRED")).isNull()
        assertThat(GuestSessionEnd.fromRefresh(410, "SOMETHING_ELSE")).isNull()
        assertThat(GuestSessionEnd.fromRefresh(null, "LINK_EXPIRED")).isNull()
    }

    @Test
    fun `la lecture globale ne lit JAMAIS ces codes - la jonction d un autre lien les rend aussi`() {
        listOf("LINK_EXPIRED", "LINK_DEACTIVATED", "CONVERSATION_CLOSED").forEach {
            assertThat(GuestSessionEnd.from(410, code = it, error = null)).isNull()
            assertThat(GuestSessionEnd.fromCode(it)).isNull()
        }
    }
}
