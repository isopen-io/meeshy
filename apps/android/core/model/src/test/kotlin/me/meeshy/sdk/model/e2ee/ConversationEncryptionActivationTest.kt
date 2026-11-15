package me.meeshy.sdk.model.e2ee

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationEncryptionActivationTest {

    @Test
    fun `this phone is an encrypted device and offers end to end beside the server modes`() {
        assertThat(ConversationEncryptionModeChoice.offeredOnThisPhone)
            .containsExactly(ConversationEncryptionModeChoice.E2EE, ConversationEncryptionModeChoice.SERVER, ConversationEncryptionModeChoice.HYBRID)
            .inOrder()
        assertThat(ConversationEncryptionModeChoice.E2EE.isOfferedOnThisPhone).isTrue()
    }

    @Test
    fun `end to end is offered for a direct conversation only, the server modes everywhere`() {
        assertThat(ConversationEncryptionModeChoice.E2EE.isOfferedFor(isDirect = true)).isTrue()
        assertThat(ConversationEncryptionModeChoice.E2EE.isOfferedFor(isDirect = false)).isFalse()
        assertThat(ConversationEncryptionModeChoice.SERVER.isOfferedFor(isDirect = false)).isTrue()
        assertThat(ConversationEncryptionModeChoice.HYBRID.isOfferedFor(isDirect = false)).isTrue()
    }

    @Test
    fun `the wire values are the ones the gateway accepts`() {
        assertThat(ConversationEncryptionModeChoice.values().map { it.wire }).containsExactly("e2ee", "server", "hybrid")
    }

    @Test
    fun `a group entry shows the safety number only once it is end to end`() {
        assertThat(ConversationSecurityRow.showsSafetyNumber(isDirect = false, regime = ConversationEncryptionRegime.END_TO_END)).isTrue()
        assertThat(ConversationSecurityRow.showsSafetyNumber(isDirect = false, regime = ConversationEncryptionRegime.SERVER)).isFalse()
        assertThat(ConversationSecurityRow.showsSafetyNumber(isDirect = false, regime = ConversationEncryptionRegime.NONE)).isFalse()
        assertThat(ConversationSecurityRow.showsSafetyNumber(isDirect = true, regime = ConversationEncryptionRegime.END_TO_END)).isFalse()
    }
}
