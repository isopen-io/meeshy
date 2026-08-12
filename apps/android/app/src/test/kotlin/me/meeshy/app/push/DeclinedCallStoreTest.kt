package me.meeshy.app.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec du tampon des refus « socket froide » : un refus prononcé
 * depuis la notification pendant que la connexion n'est pas montée doit être
 * rejoué (`call:end`) à la prochaine connexion — sinon le correspondant sonne
 * 60 s dans le vide. Le drain est one-shot : un refus rejoué deux fois serait
 * inoffensif (idempotent serveur) mais du bruit.
 */
class DeclinedCallStoreTest {

    @Test
    fun `a declined call is drained exactly once`() {
        val store = DeclinedCallStore()
        store.markDeclined("call-1")

        assertThat(store.drain()).containsExactly("call-1")
        assertThat(store.drain()).isEmpty()
    }

    @Test
    fun `declines drain in FIFO order`() {
        val store = DeclinedCallStore()
        store.markDeclined("call-1")
        store.markDeclined("call-2")

        assertThat(store.drain()).containsExactly("call-1", "call-2").inOrder()
    }

    @Test
    fun `marking the same call twice keeps a single entry`() {
        val store = DeclinedCallStore()
        store.markDeclined("call-1")
        store.markDeclined("call-1")

        assertThat(store.drain()).containsExactly("call-1")
    }

    @Test
    fun `a blank call id is ignored`() {
        val store = DeclinedCallStore()
        store.markDeclined("")

        assertThat(store.drain()).isEmpty()
    }

    @Test
    fun `the buffer is bounded — oldest declines are dropped beyond the cap`() {
        val store = DeclinedCallStore()
        repeat(10) { store.markDeclined("call-$it") }

        val drained = store.drain()
        assertThat(drained).hasSize(8)
        assertThat(drained.first()).isEqualTo("call-2")
        assertThat(drained.last()).isEqualTo("call-9")
    }
}
