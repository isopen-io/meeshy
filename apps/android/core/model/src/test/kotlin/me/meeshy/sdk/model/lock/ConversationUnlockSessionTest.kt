package me.meeshy.sdk.model.lock

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationUnlockSessionTest {

    @Test
    fun `une conversation non verrouillee est toujours admise`() {
        assertThat(ConversationUnlockSession().admits("c1", isLocked = false)).isTrue()
    }

    @Test
    fun `une conversation verrouillee n'est pas admise avant son code`() {
        assertThat(ConversationUnlockSession().admits("c1", isLocked = true)).isFalse()
    }

    @Test
    fun `un code accepte ouvre la conversation pour la session sans ouvrir les autres`() {
        val session = ConversationUnlockSession().unlock("c1")

        assertThat(session.admits("c1", isLocked = true)).isTrue()
        assertThat(session.admits("c2", isLocked = true)).isFalse()
    }

    @Test
    fun `un verrou repose exige de nouveau son code`() {
        val session = ConversationUnlockSession().unlock("c1").revoke("c1")

        assertThat(session.admits("c1", isLocked = true)).isFalse()
    }

    @Test
    fun `la deconnexion efface toutes les ouvertures`() {
        val session = ConversationUnlockSession().unlock("c1").unlock("c2").cleared()

        assertThat(session.unlockedIds).isEmpty()
        assertThat(session.admits("c1", isLocked = true)).isFalse()
    }
}
