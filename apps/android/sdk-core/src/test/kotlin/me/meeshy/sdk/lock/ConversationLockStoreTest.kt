package me.meeshy.sdk.lock

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.security.InMemorySecureStore
import org.junit.Test

/** Flux réactifs du coffre (PIN maître configuré, nombre de verrous) sur ses deux implémentations. */
class ConversationLockStoreTest {

    private val factories: List<() -> ConversationLockStore> = listOf(
        { InMemoryConversationLockStore() },
        { EncryptedConversationLockStore(InMemorySecureStore()) },
    )

    private fun eachStore(check: (ConversationLockStore) -> Unit) = factories.forEach { check(it()) }

    @Test
    fun `masterPinConfigured emet a setMasterPin`() = eachStore { sut ->
        assertThat(sut.masterPinConfigured.value).isFalse()
        sut.setMasterPin("123456")
        assertThat(sut.masterPinConfigured.value).isTrue()
    }

    @Test
    fun `masterPinConfigured emet au retrait garde quand rien n'est verrouille`() = eachStore { sut ->
        sut.setMasterPin("123456")
        sut.removeMasterPin()
        assertThat(sut.masterPinConfigured.value).isFalse()
    }

    @Test
    fun `masterPinConfigured reste vrai quand le retrait garde est refuse`() = eachStore { sut ->
        sut.setMasterPin("123456")
        sut.setLock("c1", "1111")
        sut.removeMasterPin()
        assertThat(sut.masterPinConfigured.value).isTrue()
    }

    @Test
    fun `masterPinConfigured emet a forceRemoveMasterPin`() = eachStore { sut ->
        sut.setMasterPin("123456")
        sut.setLock("c1", "1111")
        sut.forceRemoveMasterPin()
        assertThat(sut.masterPinConfigured.value).isFalse()
    }

    @Test
    fun `le nombre de verrous suit chaque mutation`() = eachStore { sut ->
        assertThat(sut.lockCount.value).isEqualTo(0)
        sut.setLock("c1", "1111")
        sut.setLock("c2", "2222")
        assertThat(sut.lockCount.value).isEqualTo(2)
        sut.removeLock("c1")
        assertThat(sut.lockCount.value).isEqualTo(1)
        sut.removeAllLocks()
        assertThat(sut.lockCount.value).isEqualTo(0)
    }

    @Test
    fun `resetForLogout remet les deux flux a zero`() = eachStore { sut ->
        sut.setMasterPin("123456")
        sut.setLock("c1", "1111")
        sut.resetForLogout()
        assertThat(sut.masterPinConfigured.value).isFalse()
        assertThat(sut.lockCount.value).isEqualTo(0)
    }

    @Test
    fun `le coffre chiffre amorce ses flux depuis l'etat persiste`() {
        val vault = InMemorySecureStore()
        EncryptedConversationLockStore(vault).apply { setMasterPin("123456"); setLock("c1", "1111") }
        val reopened = EncryptedConversationLockStore(vault)
        assertThat(reopened.masterPinConfigured.value).isTrue()
        assertThat(reopened.lockCount.value).isEqualTo(1)
    }
}
