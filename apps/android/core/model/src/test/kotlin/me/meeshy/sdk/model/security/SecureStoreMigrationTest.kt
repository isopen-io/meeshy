package me.meeshy.sdk.model.security

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SecureStoreMigrationTest {
    private val keys = listOf("jwt", "session_token")

    @Test
    fun `copie vers le compte quand le slot est vide puis supprime l'original`() {
        val store = InMemorySecureStore()
        store.put("jwt", "old")
        val outcome = SecureStoreMigration.adoptBareKeys(store, "A", keys)
        assertThat(store.get("jwt", "A")).isEqualTo("old")
        assertThat(store.get("jwt")).isNull()
        assertThat(outcome.copied).containsExactly("jwt")
    }

    @Test
    fun `n'ecrase jamais un slot deja occupe mais supprime quand meme l'original`() {
        val store = InMemorySecureStore()
        store.put("jwt", "fresh", "A")
        store.put("jwt", "stale")
        SecureStoreMigration.adoptBareKeys(store, "A", keys)
        assertThat(store.get("jwt", "A")).isEqualTo("fresh")
        assertThat(store.get("jwt")).isNull()
    }

    @Test
    fun `une copie qui echoue supprime l'original et journalise la perte`() {
        val seeded = InMemorySecureStore()
        seeded.put("jwt", "old")
        val failing = object : SecureStore by seeded {
            override fun put(key: String, value: String, account: String?) = false
        }
        val lost = mutableListOf<String>()
        val outcome = SecureStoreMigration.adoptBareKeys(failing, "A", keys) { lost += it }
        assertThat(seeded.get("jwt")).isNull()
        assertThat(lost).containsExactly("jwt")
        assertThat(outcome.lost).containsExactly("jwt")
    }

    @Test
    fun `rejouer la migration ne change rien`() {
        val store = InMemorySecureStore()
        store.put("jwt", "old")
        SecureStoreMigration.adoptBareKeys(store, "A", keys)
        val again = SecureStoreMigration.adoptBareKeys(store, "A", keys)
        assertThat(again.copied).isEmpty()
        assertThat(store.get("jwt", "A")).isEqualTo("old")
    }

    @Test
    fun `sans compte rien ne bouge`() {
        val store = InMemorySecureStore()
        store.put("jwt", "old")
        SecureStoreMigration.adoptBareKeys(store, " ", keys)
        assertThat(store.get("jwt")).isEqualTo("old")
    }
}
