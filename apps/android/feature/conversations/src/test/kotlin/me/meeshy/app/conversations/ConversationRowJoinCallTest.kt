package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationRowJoinCallTest {

    @Test
    fun `a call in progress on an open row offers to join`() {
        assertThat(ConversationRowJoinCall.isVisible(callInProgress = true, isLocked = false, isTyping = false)).isTrue()
    }

    @Test
    fun `no call in progress offers nothing`() {
        assertThat(ConversationRowJoinCall.isVisible(callInProgress = false, isLocked = false, isTyping = false)).isFalse()
    }

    @Test
    fun `a locked row never reveals that a call is going on`() {
        assertThat(ConversationRowJoinCall.isVisible(callInProgress = true, isLocked = true, isTyping = false)).isFalse()
    }

    @Test
    fun `the typing line keeps the preview slot`() {
        assertThat(ConversationRowJoinCall.isVisible(callInProgress = true, isLocked = false, isTyping = true)).isFalse()
    }

    @Test
    fun `signals only know a call that was served`() {
        val signals = ConversationRowSignals(callInProgress = setOf("c1"))

        assertThat(signals.hasCallInProgress("c1")).isTrue()
        assertThat(signals.hasCallInProgress("c2")).isFalse()
    }
}
