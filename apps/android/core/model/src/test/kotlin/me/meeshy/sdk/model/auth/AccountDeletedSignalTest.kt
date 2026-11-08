package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import java.util.Base64
import org.junit.Test

class AccountDeletedSignalTest {
    private fun jwt(userId: String?): String {
        val enc = Base64.getUrlEncoder().withoutPadding()
        val claims = if (userId == null) """{"exp":1}""" else """{"userId":"$userId","exp":1}"""
        return "${enc.encodeToString("""{"alg":"HS256"}""".toByteArray())}.${enc.encodeToString(claims.toByteArray())}.sig"
    }

    @Test
    fun `un 401 ACCOUNT_DELETED nomme le compte`() {
        assertThat(AccountDeletedSignal.namedAccount(401, """{"success":false,"code":"ACCOUNT_DELETED","accountId":"65a1b2c3d4e5f60718293a4b"}"""))
            .isEqualTo("65a1b2c3d4e5f60718293a4b")
    }

    @Test
    fun `ni un autre statut ni un autre code ni un 401 sans code ne nomment un compte`() {
        assertThat(AccountDeletedSignal.namedAccount(403, """{"code":"ACCOUNT_DELETED","accountId":"a1"}""")).isNull()
        assertThat(AccountDeletedSignal.namedAccount(401, """{"code":"SESSION_REVOKED","accountId":"a1"}""")).isNull()
        assertThat(AccountDeletedSignal.namedAccount(401, """{"code":"AUTH_FAILED"}""")).isNull()
        assertThat(AccountDeletedSignal.namedAccount(401, """{"error":"Unauthorized"}""")).isNull()
        assertThat(AccountDeletedSignal.namedAccount(401, "pas du json")).isNull()
        assertThat(AccountDeletedSignal.namedAccount(401, null)).isNull()
    }

    @Test
    fun `un identifiant qui n a pas la forme d un compte ne nomme personne`() {
        assertThat(AccountDeletedSignal.namedAccount(401, """{"code":"ACCOUNT_DELETED","accountId":"../etc"}""")).isNull()
        assertThat(AccountDeletedSignal.namedAccount(401, """{"code":"ACCOUNT_DELETED","accountId":""}""")).isNull()
        assertThat(AccountDeletedSignal.namedAccount(401, """{"code":"ACCOUNT_DELETED","accountId":"${"a".repeat(129)}"}""")).isNull()
        assertThat(AccountDeletedSignal.isAccountId("abc-DEF_123")).isTrue()
    }

    @Test
    fun `l evenement socket error lit le meme signal`() {
        assertThat(AccountDeletedSignal.namedAccountInPayload("""{"message":"x","code":"ACCOUNT_DELETED","accountId":"u1"}""")).isEqualTo("u1")
        assertThat(AccountDeletedSignal.namedAccountInPayload("""{"code":"SHARE_LINK_EXPIRED"}""")).isNull()
    }

    @Test
    fun `auth session-revoked nomme le compte purge par deletedAccountId seulement`() {
        assertThat(AccountDeletedSignal.namedAccountInSessionRevoked("""{"reason":"x","deletedAccountId":"u1"}""")).isEqualTo("u1")
        assertThat(AccountDeletedSignal.namedAccountInSessionRevoked("""{"reason":"password_changed"}""")).isNull()
        assertThat(AccountDeletedSignal.namedAccountInSessionRevoked(null)).isNull()
    }

    @Test
    fun `le proprietaire d un JWT est son claim userId`() {
        assertThat(AccountDeletedSignal.ownerOfJwt(jwt("u1"))).isEqualTo("u1")
        assertThat(AccountDeletedSignal.ownerOfJwt("Bearer ${jwt("u1")}")).isEqualTo("u1")
        assertThat(AccountDeletedSignal.ownerOfJwt(jwt(null))).isNull()
        assertThat(AccountDeletedSignal.ownerOfJwt("a.b")).isNull()
        assertThat(AccountDeletedSignal.ownerOfJwt(null)).isNull()
    }

    @Test
    fun `le proprietaire presente est celui de l en-tete et du corps de auth refresh, jamais deux differents`() {
        assertThat(AccountDeletedSignal.presentedOwner("Bearer ${jwt("u1")}", null)).isEqualTo("u1")
        assertThat(AccountDeletedSignal.presentedOwner(null, """{"token":"${jwt("u1")}"}""")).isEqualTo("u1")
        assertThat(AccountDeletedSignal.presentedOwner("Bearer ${jwt("u1")}", """{"token":"${jwt("u1")}"}""")).isEqualTo("u1")
        assertThat(AccountDeletedSignal.presentedOwner("Bearer ${jwt("u1")}", """{"token":"${jwt("u2")}"}""")).isNull()
        assertThat(AccountDeletedSignal.presentedOwner(null, null)).isNull()
    }

    @Test
    fun `le compte nomme n est retenu que s il est le proprietaire`() {
        assertThat(AccountDeletedSignal.owned("u1", "u1")).isEqualTo("u1")
        assertThat(AccountDeletedSignal.owned("u1", "u2")).isNull()
        assertThat(AccountDeletedSignal.owned("u1", null)).isNull()
        assertThat(AccountDeletedSignal.owned(null, "u1")).isNull()
    }
}
