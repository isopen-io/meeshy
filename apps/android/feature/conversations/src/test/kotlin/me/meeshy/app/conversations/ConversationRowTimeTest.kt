package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import org.junit.Test

/**
 * The instant a conversation row renders as a relative timestamp (parity with iOS
 * `ThemedConversationRow`'s trailing `RelativeTimeFormatter.shortString(for:
 * conversation.lastMessageAt)`). Behaviour asserted through the pure
 * [ConversationRowTime.epochMillis] resolver on real [ApiConversation] fixtures.
 *
 * Resolution order: the last message's `createdAt` (the true "last activity"),
 * else the conversation's `updatedAt`, else its `createdAt`; the first parseable
 * ISO-8601 value wins and `null` means "no timestamp to show".
 */
class ConversationRowTimeTest {

    // 2026-07-13T12:00:00Z
    private val lastMsgIso = "2026-07-13T12:00:00Z"
    private val lastMsgMillis = 1_783_944_000_000L
    // 2026-07-13T10:00:00Z (2h earlier)
    private val updatedIso = "2026-07-13T10:00:00Z"
    private val updatedMillis = 1_783_936_800_000L
    // 2026-07-12T09:00:00Z
    private val createdIso = "2026-07-12T09:00:00Z"
    private val createdMillis = 1_783_846_800_000L

    private fun conv(
        lastMessage: ApiConversationLastMessage? = null,
        updatedAt: String? = null,
        createdAt: String? = null,
    ) = ApiConversation(
        id = "c1",
        lastMessage = lastMessage,
        updatedAt = updatedAt,
        createdAt = createdAt,
    )

    @Test
    fun `last message createdAt is preferred over conversation timestamps`() {
        val c = conv(
            lastMessage = ApiConversationLastMessage(createdAt = lastMsgIso),
            updatedAt = updatedIso,
            createdAt = createdIso,
        )

        assertThat(ConversationRowTime.epochMillis(c)).isEqualTo(lastMsgMillis)
    }

    @Test
    fun `updatedAt is used when there is no last message`() {
        val c = conv(lastMessage = null, updatedAt = updatedIso, createdAt = createdIso)

        assertThat(ConversationRowTime.epochMillis(c)).isEqualTo(updatedMillis)
    }

    @Test
    fun `updatedAt is used when the last message has no createdAt`() {
        val c = conv(
            lastMessage = ApiConversationLastMessage(content = "hi", createdAt = null),
            updatedAt = updatedIso,
            createdAt = createdIso,
        )

        assertThat(ConversationRowTime.epochMillis(c)).isEqualTo(updatedMillis)
    }

    @Test
    fun `createdAt is the final fallback when nothing else is present`() {
        val c = conv(lastMessage = null, updatedAt = null, createdAt = createdIso)

        assertThat(ConversationRowTime.epochMillis(c)).isEqualTo(createdMillis)
    }

    @Test
    fun `a blank last-message createdAt falls through to updatedAt`() {
        val c = conv(
            lastMessage = ApiConversationLastMessage(createdAt = "   "),
            updatedAt = updatedIso,
            createdAt = createdIso,
        )

        assertThat(ConversationRowTime.epochMillis(c)).isEqualTo(updatedMillis)
    }

    @Test
    fun `an unparseable last-message createdAt falls through to updatedAt`() {
        val c = conv(
            lastMessage = ApiConversationLastMessage(createdAt = "not-a-date"),
            updatedAt = updatedIso,
            createdAt = createdIso,
        )

        assertThat(ConversationRowTime.epochMillis(c)).isEqualTo(updatedMillis)
    }

    @Test
    fun `an unparseable updatedAt falls through to createdAt`() {
        val c = conv(lastMessage = null, updatedAt = "garbage", createdAt = createdIso)

        assertThat(ConversationRowTime.epochMillis(c)).isEqualTo(createdMillis)
    }

    @Test
    fun `null is returned when no timestamp is parseable`() {
        val c = conv(lastMessage = null, updatedAt = null, createdAt = null)

        assertThat(ConversationRowTime.epochMillis(c)).isNull()
    }

    @Test
    fun `null is returned when every timestamp is unparseable`() {
        val c = conv(
            lastMessage = ApiConversationLastMessage(createdAt = "x"),
            updatedAt = "y",
            createdAt = "z",
        )

        assertThat(ConversationRowTime.epochMillis(c)).isNull()
    }

    @Test
    fun `the unix epoch is a valid resolved timestamp, not treated as absent`() {
        val c = conv(
            lastMessage = ApiConversationLastMessage(createdAt = "1970-01-01T00:00:00Z"),
            updatedAt = updatedIso,
        )

        assertThat(ConversationRowTime.epochMillis(c)).isEqualTo(0L)
    }
}
