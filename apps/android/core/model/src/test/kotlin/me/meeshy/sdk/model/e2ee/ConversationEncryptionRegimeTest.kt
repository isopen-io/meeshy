package me.meeshy.sdk.model.e2ee

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Même lecture que `DeviceTranslationEligibility.serverReadsMessage` : un mode inconnu se lit comme le bout en bout. */
class ConversationEncryptionRegimeTest {

    @Test
    fun `no mode is clear, server and hybrid are readable by the server`() {
        assertThat(ConversationEncryptionRegime.of(null)).isEqualTo(ConversationEncryptionRegime.NONE)
        assertThat(ConversationEncryptionRegime.of("   ")).isEqualTo(ConversationEncryptionRegime.NONE)
        assertThat(ConversationEncryptionRegime.of("Server")).isEqualTo(ConversationEncryptionRegime.SERVER)
        assertThat(ConversationEncryptionRegime.of(" HYBRID ")).isEqualTo(ConversationEncryptionRegime.HYBRID)
        assertThat(ConversationEncryptionRegime.SERVER.serverReads).isTrue()
        assertThat(ConversationEncryptionRegime.HYBRID.serverReads).isTrue()
        assertThat(ConversationEncryptionRegime.NONE.serverReads).isTrue()
    }

    @Test
    fun `e2ee and any unknown mode are read as end to end, which the server cannot read`() {
        assertThat(ConversationEncryptionRegime.of("e2ee")).isEqualTo(ConversationEncryptionRegime.END_TO_END)
        assertThat(ConversationEncryptionRegime.of("signal-v9")).isEqualTo(ConversationEncryptionRegime.END_TO_END)
        assertThat(ConversationEncryptionRegime.END_TO_END.serverReads).isFalse()
    }
}
