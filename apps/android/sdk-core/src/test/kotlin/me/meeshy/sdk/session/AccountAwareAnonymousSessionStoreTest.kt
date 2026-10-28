package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AnonymousSessionContext
import me.meeshy.sdk.model.ParticipantPermissions
import me.meeshy.sdk.net.InMemoryTokenStore
import org.junit.Test

class AccountAwareAnonymousSessionStoreTest {
    private val guest = AnonymousSessionContext("g1", "p", ParticipantPermissions.anonymous(true, false, false), "l", "c")

    @Test
    fun `sans compte la session invitee se relit`() = runTest {
        val store = AccountAwareAnonymousSessionStore(InMemoryAnonymousSessionStore(guest), InMemoryTokenStore(sessionToken = "g1"))
        assertThat(store.load()).isEqualTo(guest)
    }

    @Test
    fun `un compte connecte n'herite jamais d'une session invitee restee sur l'appareil, et elle est effacee`() = runTest {
        val inner = InMemoryAnonymousSessionStore(guest)
        val store = AccountAwareAnonymousSessionStore(inner, InMemoryTokenStore(jwt = "J", sessionToken = "g1"))
        assertThat(store.load()).isNull()
        assertThat(inner.load()).isNull()
    }
}
