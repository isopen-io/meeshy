package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import org.junit.Test

/** Parité iOS `LentilleConversationRow.Line2Kind.resolve` et `effectivePresenceState`. */
class ConversationRowPrecedenceTest {

    @Test
    fun `typing beats a draft and a preview`() {
        assertThat(ConversationRowPrecedence.line2(hasTyping = true, hasDraft = true)).isEqualTo(RowLine2.TYPING)
        assertThat(ConversationRowPrecedence.line2(hasTyping = true, hasDraft = false)).isEqualTo(RowLine2.TYPING)
    }

    @Test
    fun `a draft beats the preview when nobody types`() {
        assertThat(ConversationRowPrecedence.line2(hasTyping = false, hasDraft = true)).isEqualTo(RowLine2.DRAFT)
    }

    @Test
    fun `the preview is the fallback`() {
        assertThat(ConversationRowPrecedence.line2(hasTyping = false, hasDraft = false)).isEqualTo(RowLine2.PREVIEW)
    }

    @Test
    fun `a peer who types forces the presence dot to green whatever the served presence`() {
        listOf(null, PresenceState.OFFLINE, PresenceState.IDLE, PresenceState.AWAY, PresenceState.ONLINE).forEach {
            assertThat(ConversationRowPrecedence.presence(it, isTyping = true)).isEqualTo(PresenceState.ONLINE)
        }
    }

    @Test
    fun `without typing the served presence goes through untouched, offline included`() {
        assertThat(ConversationRowPrecedence.presence(PresenceState.OFFLINE, isTyping = false)).isEqualTo(PresenceState.OFFLINE)
        assertThat(ConversationRowPrecedence.presence(PresenceState.AWAY, isTyping = false)).isEqualTo(PresenceState.AWAY)
        assertThat(ConversationRowPrecedence.presence(null, isTyping = false)).isNull()
    }
}
