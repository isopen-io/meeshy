package me.meeshy.core.crypto.session

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.crypto.primitives.CanonicalBase64
import me.meeshy.sdk.model.security.InMemorySecureStore
import org.junit.Test

class SessionKeyStoreTest {
    private val vault = InMemorySecureStore()
    private val store = SessionKeyStore(vault)
    private fun session(fill: Int) = E2eeSession(ByteArray(32) { fill.toByte() }, SessionKeyDerivation.VERSION)

    @Test
    fun `la session vit sous l'espace du compte et se relit`() {
        assertThat(store.save("u1", "p1", session(7))).isTrue()

        assertThat(store.load("u1", "p1")!!.key).isEqualTo(session(7).key)
        assertThat(vault.get("me.meeshy.e2ee.session.p1", "u1")).isNotNull()
        assertThat(vault.get("u1.me.meeshy.e2ee.session.p1")).isNotNull()
        assertThat(store.load("u2", "p1")).isNull()
    }

    @Test
    fun `le registre knownPeers inscrit chaque pair une seule fois`() {
        store.save("u1", "p1", session(1))
        store.save("u1", "p1", session(2))
        store.save("u1", "p2", session(3))

        assertThat(store.knownPeers("u1")).containsExactly("p1", "p2").inOrder()
    }

    @Test
    fun `clear efface les sessions du compte et son registre sans toucher a un autre compte`() {
        store.save("u1", "p1", session(1))
        store.save("u2", "p1", session(2))

        store.clear("u1")

        assertThat(store.load("u1", "p1")).isNull()
        assertThat(store.knownPeers("u1")).isEmpty()
        assertThat(store.load("u2", "p1")).isNotNull()
    }

    @Test
    fun `une valeur d'une autre version ou illisible se lit absente`() {
        vault.put("me.meeshy.e2ee.session.p1", CanonicalBase64.encode(ByteArray(32)), "u1")
        vault.put("me.meeshy.e2ee.session.p2", "9:" + CanonicalBase64.encode(ByteArray(32)), "u1")
        vault.put("me.meeshy.e2ee.session.p3", "2:pas-du-base64!", "u1")

        assertThat(listOf("p1", "p2", "p3").map { store.load("u1", it) }).containsExactly(null, null, null)
    }

    @Test
    fun `la migration d'espace de noms deplace les cles nues du registre une fois par userId`() {
        vault.put("me.meeshy.e2ee.session.p1", "2:" + CanonicalBase64.encode(ByteArray(32) { 5 }))
        vault.put("me.meeshy.e2ee.knownPeers", "p1")

        assertThat(store.migrateLegacyIfNeeded("u1")).isTrue()

        assertThat(store.load("u1", "p1")).isNotNull()
        assertThat(store.knownPeers("u1")).containsExactly("p1")
        assertThat(vault.get("me.meeshy.e2ee.session.p1")).isNull()
        assertThat(store.knownPeers(null)).isEmpty()
    }

    @Test
    fun `la migration est idempotente et ne rejoue pas pour un meme userId`() {
        assertThat(store.migrateLegacyIfNeeded("u1")).isTrue()
        vault.put("me.meeshy.e2ee.session.p9", "2:" + CanonicalBase64.encode(ByteArray(32)))
        vault.put("me.meeshy.e2ee.knownPeers", "p9")

        assertThat(store.migrateLegacyIfNeeded("u1")).isFalse()
        assertThat(store.load("u1", "p9")).isNull()
        assertThat(store.migrateLegacyIfNeeded("u2")).isTrue()
    }

    @Test
    fun `la migration ne remplace pas une session deja namespacee`() {
        store.save("u1", "p1", session(1))
        vault.put("me.meeshy.e2ee.session.p1", "2:" + CanonicalBase64.encode(ByteArray(32) { 9 }))
        vault.put("me.meeshy.e2ee.knownPeers", "p1")

        store.migrateLegacyIfNeeded("u1")

        assertThat(store.load("u1", "p1")!!.key).isEqualTo(session(1).key)
    }
}
