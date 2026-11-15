package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AuthStorageKeysTest {
    @Test
    fun `key names are the ones of the iOS keychain`() {
        assertThat(AuthStorageKeys.token("u1")).isEqualTo("meeshy_token_u1")
        assertThat(AuthStorageKeys.user("u1")).isEqualTo("meeshy_user_u1")
        assertThat(AuthStorageKeys.sessionToken("u1")).isEqualTo("meeshy_session_token_u1")
        assertThat(AuthStorageKeys.tokenDate("u1")).isEqualTo("meeshy_token_date_u1")
    }

    @Test
    fun `two accounts never share a key`() {
        assertThat(AuthStorageKeys.user("a")).isNotEqualTo(AuthStorageKeys.user("b"))
    }
}
