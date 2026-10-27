package me.meeshy.sdk.model.reading.summary

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LivingSummaryAgentGateTest {
    @Test fun `seul un inscrit hors chiffrement de bout en bout interroge l'agent`() {
        assertThat(LivingSummaryAgentGate.mayAsk(isGuest = false, isEndToEnd = false)).isTrue()
        assertThat(LivingSummaryAgentGate.mayAsk(isGuest = true, isEndToEnd = false)).isFalse()
        assertThat(LivingSummaryAgentGate.mayAsk(isGuest = false, isEndToEnd = true)).isFalse()
        assertThat(LivingSummaryAgentGate.mayAsk(isGuest = true, isEndToEnd = true)).isFalse()
    }
}
