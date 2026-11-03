package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.security.InMemorySecureStore
import org.junit.Test

class EncryptedTokenStoreTest {

    @Test
    fun `jetons ecrits avant le userId sont adoptes a la pose du userId`() {
        val vault = InMemorySecureStore()
        val store = EncryptedTokenStore(vault)
        store.jwt = "j"
        store.sessionToken = "s"
        store.userId = "A"
        assertThat(vault.get("jwt")).isNull()
        assertThat(vault.get("jwt", "A")).isEqualTo("j")
        assertThat(vault.get("session_token", "A")).isEqualTo("s")
        assertThat(store.jwt).isEqualTo("j")
        assertThat(store.isAuthenticated).isTrue()
    }

    @Test
    fun `une installation existante reste connectee`() {
        val vault = InMemorySecureStore()
        vault.put("jwt", "legacy")
        vault.put("user_id", "A")
        val store = EncryptedTokenStore(vault)
        assertThat(store.jwt).isEqualTo("legacy")
        assertThat(vault.get("jwt")).isNull()
        assertThat(vault.get("jwt", "A")).isEqualTo("legacy")
        assertThat(store.userId).isEqualTo("A")
    }

    @Test
    fun `avec un userId les ecritures vont dans son espace`() {
        val vault = InMemorySecureStore()
        val store = EncryptedTokenStore(vault)
        store.userId = "A"
        store.jwt = "j2"
        assertThat(vault.get("jwt", "A")).isEqualTo("j2")
        assertThat(vault.get("jwt")).isNull()
    }

    @Test
    fun `changer de compte actif ne melange pas les jeux de jetons`() {
        val vault = InMemorySecureStore()
        val store = EncryptedTokenStore(vault)
        store.userId = "A"
        store.jwt = "ja"
        store.userId = "B"
        assertThat(store.jwt).isNull()
        store.jwt = "jb"
        assertThat(vault.get("jwt", "A")).isEqualTo("ja")
        store.userId = "A"
        assertThat(store.jwt).isEqualTo("ja")
    }

    @Test
    fun `clear deconnecte le compte actif et laisse les comptes endormis`() {
        val vault = InMemorySecureStore()
        vault.put("jwt", "jb", "B")
        val store = EncryptedTokenStore(vault)
        store.userId = "A"
        store.jwt = "ja"
        store.clear()
        assertThat(store.isAuthenticated).isFalse()
        assertThat(store.userId).isNull()
        assertThat(vault.get("jwt", "A")).isNull()
        assertThat(vault.get("jwt", "B")).isEqualTo("jb")
    }

    @Test
    fun `sans rien le magasin n'est pas authentifie`() {
        val store = EncryptedTokenStore(InMemorySecureStore())
        assertThat(store.jwt).isNull()
        assertThat(store.isAuthenticated).isFalse()
    }

    @Test
    fun `chaque jeton recu date le jeton`() {
        var now = 1_000L
        val vault = InMemorySecureStore()
        val store = EncryptedTokenStore(vault, nowMillis = { now })
        store.userId = "A"
        assertThat(store.tokenDateMillis).isNull()
        store.jwt = "j1"
        assertThat(store.tokenDateMillis).isEqualTo(1_000L)
        now = 5_000L
        store.jwt = "j2"
        assertThat(store.tokenDateMillis).isEqualTo(5_000L)
    }

    @Test
    fun `la date d'un jeton recu avant le userId suit le compte`() {
        val vault = InMemorySecureStore()
        val store = EncryptedTokenStore(vault, nowMillis = { 42L })
        store.jwt = "j"
        store.userId = "A"
        assertThat(vault.get("token_date", "A")).isEqualTo("42")
        assertThat(store.tokenDateMillis).isEqualTo(42L)
    }

    @Test
    fun `clear efface le profil dans le coffre du profil, distinct de celui des jetons, et celui du compte actif seulement`() {
        val tokenVault = InMemorySecureStore()
        val profileVault = InMemorySecureStore()
        profileVault.put("meeshy_user_B", "{}", "B")
        val store = EncryptedTokenStore(tokenVault, profileVault)
        store.userId = "A"
        store.jwt = "ja"
        profileVault.put("meeshy_user_A", "{}", "A")

        store.clear()

        assertThat(profileVault.get("meeshy_user_A", "A")).isNull()
        assertThat(profileVault.get("meeshy_user_B", "B")).isEqualTo("{}")
        assertThat(tokenVault.get("token_date", "A")).isNull()
        assertThat(store.userId).isNull()
    }

    @Test
    fun `sans coffre de profil, clear n'invente rien et efface les jetons`() {
        val tokenVault = InMemorySecureStore()
        val store = EncryptedTokenStore(tokenVault)
        store.userId = "A"
        store.jwt = "ja"
        store.clear()
        assertThat(tokenVault.get("jwt", "A")).isNull()
    }
}
