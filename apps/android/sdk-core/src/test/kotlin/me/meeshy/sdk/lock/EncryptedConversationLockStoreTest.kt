package me.meeshy.sdk.lock

import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Proves the Keystore-backed implementation satisfies the same contract as
 * [InMemoryConversationLockStoreTest] — not a duplicate of every case there,
 * just enough to show the real persistence (`EncryptedSharedPreferences`,
 * same pattern as `EncryptedTokenStore`) and hashing round-trip correctly.
 */
@RunWith(RobolectricTestRunner::class)
class EncryptedConversationLockStoreTest {

    private fun store() = EncryptedConversationLockStore(ApplicationProvider.getApplicationContext())

    @Test
    fun `master PIN round-trips through encrypted storage`() {
        val sut = store()

        sut.setMasterPin("123456")

        assertThat(sut.hasMasterPin()).isTrue()
        assertThat(sut.verifyMasterPin("123456")).isTrue()
        assertThat(sut.verifyMasterPin("000000")).isFalse()
    }

    @Test
    fun `removeMasterPin is guarded by an existing lock, forceRemoveMasterPin is not`() {
        val sut = store()
        sut.setMasterPin("123456")
        sut.setLock("c1", "1111")

        sut.removeMasterPin()
        assertThat(sut.hasMasterPin()).isTrue()

        sut.forceRemoveMasterPin()
        assertThat(sut.hasMasterPin()).isFalse()
    }

    @Test
    fun `per-conversation lock round-trips and lockedConversationIds derives from stored keys`() {
        val sut = store()

        sut.setLock("c1", "1111")
        sut.setLock("c2", "2222")

        assertThat(sut.lockedConversationIds).containsExactly("c1", "c2")
        assertThat(sut.verifyLock("c1", "1111")).isTrue()
        assertThat(sut.verifyLock("c1", "2222")).isFalse()
    }

    @Test
    fun `removeLock and removeAllLocks update lockedConversationIds`() {
        val sut = store()
        sut.setLock("c1", "1111")
        sut.setLock("c2", "2222")

        sut.removeLock("c1")
        assertThat(sut.lockedConversationIds).containsExactly("c2")

        sut.removeAllLocks()
        assertThat(sut.lockedConversationIds).isEmpty()
    }

    @Test
    fun `resetForLogout wipes both the master PIN and every conversation lock`() {
        val sut = store()
        sut.setMasterPin("123456")
        sut.setLock("c1", "1111")

        sut.resetForLogout()

        assertThat(sut.hasMasterPin()).isFalse()
        assertThat(sut.lockedConversationIds).isEmpty()
    }

    @Test
    fun `state persists across a new store instance over the same context (survives process death)`() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        EncryptedConversationLockStore(context).apply {
            setMasterPin("123456")
            setLock("c1", "1111")
        }

        val reopened = EncryptedConversationLockStore(context)

        assertThat(reopened.verifyMasterPin("123456")).isTrue()
        assertThat(reopened.verifyLock("c1", "1111")).isTrue()
    }
}
