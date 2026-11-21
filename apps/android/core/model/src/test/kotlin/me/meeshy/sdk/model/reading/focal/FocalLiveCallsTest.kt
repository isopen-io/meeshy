package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FocalLiveCallsTest {

    @Test fun `une carte en cours que l'appel actif ne confirme pas demande une relecture`() {
        assertThat(FocalLiveCalls.unconfirmed(listOf("c1"), activeCallId = null)).containsExactly("c1")
        assertThat(FocalLiveCalls.unconfirmed(listOf("c1", "c2"), activeCallId = "c2")).containsExactly("c1")
    }

    @Test fun `une carte confirmee ou un fil sans appel en cours ne demande rien`() {
        assertThat(FocalLiveCalls.unconfirmed(listOf("c1"), activeCallId = "c1")).isEmpty()
        assertThat(FocalLiveCalls.unconfirmed(emptyList(), activeCallId = null)).isEmpty()
        assertThat(FocalLiveCalls.unconfirmed(listOf(""), activeCallId = null)).isEmpty()
    }
}
