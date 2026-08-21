package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Pins the one literal that decides whether a message is a system notice.
 *
 * `ChatViewModel` used to compare `messageSource == "system"` inline, where a
 * typo would have silently disarmed the whole grouping rule: every notice would
 * simply have been treated as a spoken turn again, with no test turning red.
 * The comparison lives on [ApiMessage] so it can be pinned here.
 */
class MessageSourceTest {

    private fun message(source: String?) = ApiMessage(
        id = "m1",
        conversationId = "c1",
        content = "X a rejoint la conversation",
        originalLanguage = "fr",
        messageSource = source,
    )

    @Test
    fun `a message whose source is system is a system message`() {
        assertThat(message("system").isSystemMessage).isTrue()
    }

    @Test
    fun `a message with no source is not a system message`() {
        assertThat(message(null).isSystemMessage).isFalse()
    }

    @Test
    fun `a spoken message is not a system message`() {
        assertThat(message("user").isSystemMessage).isFalse()
    }

    @Test
    fun `the other non-spoken sources are not system messages`() {
        // They are not turns at talk either, but they are authored content and
        // do group — only "system" leaves the conversation's flow of speech.
        listOf("ads", "app", "agent", "authority").forEach { source ->
            assertThat(message(source).isSystemMessage).isFalse()
        }
    }

    @Test
    fun `the comparison is exact, never case-insensitive`() {
        // Web (`messageSource === 'system'`) and iOS (`MessageSource.system.rawValue`)
        // both compare exactly. Should the gateway ever change the casing, the
        // three platforms must move together — so this stays strict on purpose.
        assertThat(message("SYSTEM").isSystemMessage).isFalse()
        assertThat(message(" system").isSystemMessage).isFalse()
    }
}
