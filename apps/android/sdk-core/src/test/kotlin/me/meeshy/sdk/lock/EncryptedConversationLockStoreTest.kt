package me.meeshy.sdk.lock

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.security.InMemorySecureStore
import org.junit.Test

class EncryptedConversationLockStoreTest {

    private fun store(vault: InMemorySecureStore = InMemorySecureStore()) = EncryptedConversationLockStore(vault)

    @Test
    fun `PIN maitre pose verifie et retire`() {
        val sut = store()
        assertThat(sut.hasMasterPin()).isFalse()
        sut.setMasterPin("123456")
        assertThat(sut.hasMasterPin()).isTrue()
        assertThat(sut.verifyMasterPin("123456")).isTrue()
        assertThat(sut.verifyMasterPin("000000")).isFalse()
        sut.removeMasterPin()
        assertThat(sut.hasMasterPin()).isFalse()
    }

    @Test
    fun `removeMasterPin est sans effet tant qu'une conversation est verrouillee`() {
        val sut = store()
        sut.setMasterPin("123456")
        sut.setLock("c1", "1111")
        sut.removeMasterPin()
        assertThat(sut.hasMasterPin()).isTrue()
        sut.forceRemoveMasterPin()
        assertThat(sut.hasMasterPin()).isFalse()
    }

    @Test
    fun `verrous isoles par conversation et flux a jour`() {
        val sut = store()
        assertThat(sut.lockedConversationIdsFlow.value).isEmpty()
        sut.setLock("c1", "1111")
        sut.setLock("c2", "2222")
        assertThat(sut.verifyLock("c1", "2222")).isFalse()
        assertThat(sut.verifyLock("c1", "1111")).isTrue()
        assertThat(sut.lockedConversationIdsFlow.value).containsExactly("c1", "c2")
        sut.removeLock("c1")
        assertThat(sut.isLocked("c1")).isFalse()
        assertThat(sut.lockedConversationIdsFlow.value).containsExactly("c2")
        sut.removeAllLocks()
        assertThat(sut.lockedConversationIds).isEmpty()
        assertThat(sut.lockedConversationIdsFlow.value).isEmpty()
    }

    @Test
    fun `resetForLogout efface PIN maitre et verrous`() {
        val sut = store()
        sut.setMasterPin("123456")
        sut.setLock("c1", "1111")
        sut.resetForLogout()
        assertThat(sut.hasMasterPin()).isFalse()
        assertThat(sut.lockedConversationIds).isEmpty()
    }

    @Test
    fun `les PIN deja ranges sous les cles historiques restent valides`() {
        val vault = InMemorySecureStore()
        store(vault).apply {
            setMasterPin("123456")
            setLock("c1", "1111")
        }
        val reopened = store(vault)
        assertThat(reopened.verifyMasterPin("123456")).isTrue()
        assertThat(reopened.verifyLock("c1", "1111")).isTrue()
        assertThat(reopened.lockedConversationIdsFlow.value).containsExactly("c1")
        assertThat(vault.keys()).containsExactly("master_pin", "lock_c1")
    }

    @Test
    fun `un coffre illisible scelle le contenu poussé mais n'invente aucun verrou pour la porte du routeur`() {
        val sut = store(InMemorySecureStore(allUnreadable = true))

        assertThat(sut.sealsContentOf("c1")).isTrue()
        assertThat(sut.isLocked("c1")).isFalse()
    }

    @Test
    fun `un coffre lisible ne scelle que la conversation verrouillee`() {
        val sut = store().apply { setLock("c1", "1111") }

        assertThat(sut.sealsContentOf("c1")).isTrue()
        assertThat(sut.sealsContentOf("c2")).isFalse()
    }

    @Test
    fun `un coffre recree que l'app a reconnu perdu ne scelle plus`() {
        val sut = store(InMemorySecureStore(allUnreadable = true))

        sut.acknowledgeLostLocks()

        assertThat(sut.sealsContentOf("c1")).isFalse()
    }
}
