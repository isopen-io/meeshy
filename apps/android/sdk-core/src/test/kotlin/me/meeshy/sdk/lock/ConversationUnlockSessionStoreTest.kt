package me.meeshy.sdk.lock

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class ConversationUnlockSessionStoreTest {

    @Test
    fun `un code accepte vaut pour la session`() {
        val sut = ConversationUnlockSessionStore()
        assertThat(sut.admits("c1", isLocked = true)).isFalse()
        sut.unlock("c1")
        assertThat(sut.admits("c1", isLocked = true)).isTrue()
    }

    @Test
    fun `la deconnexion efface les ouvertures`() = runTest {
        val sut = ConversationUnlockSessionStore()
        sut.unlock("c1")
        sut.clear()
        assertThat(sut.admits("c1", isLocked = true)).isFalse()
    }

    @Test
    fun `un verrou repose redemande son code`() {
        val sut = ConversationUnlockSessionStore()
        sut.unlock("c1")
        sut.revoke("c1")
        assertThat(sut.admits("c1", isLocked = true)).isFalse()
    }
}
