package me.meeshy.sdk.model.e2ee

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationEncryptionActivationTest {

    @Test
    fun `this phone offers the server modes and withholds end to end until it is an encrypted device`() {
        assertThat(ConversationEncryptionModeChoice.offeredOnThisPhone)
            .containsExactly(ConversationEncryptionModeChoice.SERVER, ConversationEncryptionModeChoice.HYBRID)
            .inOrder()
        assertThat(ConversationEncryptionModeChoice.E2EE.isOfferedOnThisPhone).isFalse()
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
