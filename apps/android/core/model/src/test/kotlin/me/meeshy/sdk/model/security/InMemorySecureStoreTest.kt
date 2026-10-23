package me.meeshy.sdk.model.security

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class InMemorySecureStoreTest {
    @Test
    fun `put puis get rend la valeur et remove l'efface`() {
        val store = InMemorySecureStore()
        assertThat(store.put("jwt", "a")).isTrue()
        assertThat(store.get("jwt")).isEqualTo("a")
        store.remove("jwt")
        assertThat(store.get("jwt")).isNull()
    }

    @Test
    fun `la valeur du compte A n'est jamais rendue pour le compte B`() {
        val store = InMemorySecureStore()
        store.put("jwt", "tokenA", "A")
        assertThat(store.get("jwt", "B")).isNull()
        assertThat(store.get("jwt", "A")).isEqualTo("tokenA")
    }

    @Test
    fun `un appel sans compte ne rend jamais une valeur namespacee`() {
        val store = InMemorySecureStore()
        store.put("jwt", "tokenA", "A")
        assertThat(store.get("jwt")).isNull()
        assertThat(store.keys()).isEmpty()
        assertThat(store.keys("A")).containsExactly("jwt")
    }

    @Test
    fun `clearAccount ne touche ni les autres comptes ni les cles nues`() {
        val store = InMemorySecureStore()
        store.put("jwt", "a", "A")
        store.put("jwt", "b", "B")
        store.put("user_id", "A")
        store.clearAccount("A")
        assertThat(store.get("jwt", "A")).isNull()
        assertThat(store.get("jwt", "B")).isEqualTo("b")
        assertThat(store.get("user_id")).isEqualTo("A")
    }

    @Test
    fun `clearAll vide tout`() {
        val store = InMemorySecureStore()
        store.put("jwt", "a", "A")
        store.put("user_id", "A")
        store.clearAll()
        assertThat(store.get("user_id")).isNull()
        assertThat(store.get("jwt", "A")).isNull()
    }

    @Test
    fun `les variantes suspend suivent le meme contrat`() = runTest {
        val store = InMemorySecureStore()
        assertThat(store.putSuspend("k", "v", "A")).isTrue()
        assertThat(store.getSuspend("k", "A")).isEqualTo("v")
        store.removeSuspend("k", "A")
        assertThat(store.getSuspend("k", "A")).isNull()
    }
}
