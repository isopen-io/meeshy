package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AgentAuthoredStyleTest {

    @Test
    fun `drapeau actif et message d'agent rendent l'anneau et l'étincelle`() {
        assertThat(AgentAuthoredStyle.resolve(isAgentAuthored = true, isAgentGrammarEnabled = true))
            .isEqualTo(AgentAuthoredStyle.Descriptor(showsDashedRing = true, showsSpark = true))
    }

    @Test
    fun `drapeau désactivé, le message d'agent reste humain`() {
        assertThat(AgentAuthoredStyle.resolve(isAgentAuthored = true, isAgentGrammarEnabled = false))
            .isEqualTo(AgentAuthoredStyle.Descriptor.Human)
    }

    @Test
    fun `message humain reste humain même drapeau actif`() {
        assertThat(AgentAuthoredStyle.resolve(isAgentAuthored = false, isAgentGrammarEnabled = true))
            .isEqualTo(AgentAuthoredStyle.Descriptor.Human)
    }
}
