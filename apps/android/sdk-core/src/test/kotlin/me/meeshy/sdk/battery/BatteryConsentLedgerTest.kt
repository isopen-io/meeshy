package me.meeshy.sdk.battery

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** La proposition de partage à un Proche ne se fait qu'une fois, par compte et par personne (#14147). */
class BatteryConsentLedgerTest {
    private class MemoryStorage : BatteryConsentStorage {
        val keys = mutableSetOf<String>()
        override fun contains(key: String): Boolean = key in keys
        override fun put(key: String) {
            keys += key
        }
    }

    @Test
    fun `une proposition faite ne revient pas, un autre compte la voit encore`() {
        var viewer: String? = "me"
        val ledger = StoredBatteryConsentLedger(MemoryStorage()) { viewer }
        assertThat(ledger.wasOffered("u2")).isFalse()
        ledger.markOffered("u2")
        assertThat(ledger.wasOffered("u2")).isTrue()
        viewer = "other"
        assertThat(ledger.wasOffered("u2")).isFalse()
    }

    @Test
    fun `sans session rien ne s'offre`() {
        val ledger = StoredBatteryConsentLedger(MemoryStorage()) { null }
        assertThat(ledger.wasOffered("u2")).isTrue()
    }

    @Test
    fun `une annonce de push ne passe que si une pastille ecoute`() {
        assertThat(BatteryForegroundNotices().offer(BatteryForegroundNotice("n1", "Alice · 5 %"))).isFalse()
    }
}
