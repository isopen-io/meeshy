package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Test

/**
 * Un 401 ne déconnecte que s'il y a une session à perdre (#14058). La restauration d'une session sauvegardée
 * part SANS session locale : son refus ne doit pas lancer une déconnexion, qui purgerait l'appareil et pourrait
 * fermer le compte qu'on vient d'ouvrir à la main.
 */
class SessionRefresherExpiryTest {

    private val refreshProbe = Request.Builder().url("https://gate.meeshy.me/api/v1/auth/refresh").post(ByteArray(0).toRequestBody()).build()

    @Test
    fun `sans session locale un refus sans identite presentee n'annonce aucune expiration`() {
        val refresher = SessionRefresher(InMemoryTokenStore()) { null }

        assertThat(refresher.signalsExpiry(refreshProbe)).isFalse()
    }

    @Test
    fun `avec une session locale un refus sans identite presentee annonce l'expiration`() {
        val refresher = SessionRefresher(InMemoryTokenStore(jwt = "jwt", sessionToken = "s", userId = "u1")) { null }

        assertThat(refresher.signalsExpiry(refreshProbe)).isTrue()
    }

    @Test
    fun `une session que le renouvellement vient de demonter annonce encore son expiration`() = runTest {
        val store = InMemoryTokenStore(jwt = "jwt", sessionToken = "s", userId = "u1")
        val refresher = SessionRefresher(store, nowEpochSeconds = { Double.MAX_VALUE }) { null }

        refresher.renew("jwt", sentUnderGeneration = null)

        assertThat(store.isAuthenticated).isFalse()
        assertThat(refresher.signalsExpiry(refreshProbe)).isTrue()
    }
}
