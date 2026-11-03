package me.meeshy.sdk.model.imagine

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageReplyPreview
import me.meeshy.sdk.model.ApiMessageSender
import org.junit.Test

class ImagineDiscussionWindowTest {

    private val now = 1_800_000_000_000L
    private val viewer = ImagineViewer(id = "me", displayName = "Moi", username = "moi")

    private fun msg(
        id: String,
        content: String = "salut $id",
        sender: String = "alice",
        attachments: List<ApiMessageAttachment> = emptyList(),
        replyTo: ApiMessageReplyPreview? = null,
        viewOnce: Boolean? = null,
    ) = ApiMessage(
        id = id, conversationId = "c", senderId = sender, content = content, attachments = attachments, replyTo = replyTo,
        isViewOnce = viewOnce, createdAt = "2026-10-20T10:00:00Z",
        sender = ApiMessageSender(id = sender, displayName = sender.replaceFirstChar { it.uppercase() }, username = sender),
    )

    private fun photo(id: String) = ApiMessageAttachment(id = id, mimeType = "image/jpeg", fileUrl = "https://x/$id.jpg")

    private fun thread(count: Int) = (1..count).map { msg("m$it") }

    @Test
    fun `the window ends at the chosen message included - what follows is not part of it`() {
        val window = ImagineDiscussionWindow.window(thread(5), "m3", now)
        assertThat(window.map { it.id }).containsExactly("m1", "m2", "m3").inOrder()
    }

    @Test
    fun `the window keeps the twelve latest messages`() {
        val window = ImagineDiscussionWindow.window(thread(20), "m20", now)
        assertThat(window).hasSize(ImagineDiscussionWindow.MAX_MESSAGES)
        assertThat(window.first().id).isEqualTo("m9")
        assertThat(window.last().id).isEqualTo("m20")
    }

    @Test
    fun `an unknown ending message gives an empty window`() {
        assertThat(ImagineDiscussionWindow.window(thread(3), "nope", now)).isEmpty()
    }

    @Test
    fun `protected messages stay out of the window`() {
        val messages = listOf(msg("a"), msg("b", viewOnce = true), msg("c"))
        assertThat(ImagineDiscussionWindow.window(messages, "c", now).map { it.id }).containsExactly("a", "c").inOrder()
    }

    @Test
    fun `a reply quoting protected content closes the whole discussion`() {
        val quote = ApiMessageReplyPreview(id = "x", content = "secret", isViewOnce = true)
        val messages = listOf(msg("a"), msg("b", replyTo = quote), msg("c"))
        assertThat(ImagineDiscussionWindow.window(messages, "c", now)).isEmpty()
        assertThat(ImagineDiscussionWindow.offers(messages, "c", now)).isFalse()
    }

    @Test
    fun `a protected quote older than the window does not close it`() {
        val quote = ApiMessageReplyPreview(id = "x", content = "secret", isViewOnce = true)
        val messages = listOf(msg("old", replyTo = quote)) + (1..12).map { msg("m$it") }
        assertThat(ImagineDiscussionWindow.window(messages, "m12", now)).hasSize(12)
    }

    @Test
    fun `the offer exists only when something can be painted`() {
        assertThat(ImagineDiscussionWindow.offers(thread(2), "m2", now)).isTrue()
        assertThat(ImagineDiscussionWindow.offers(listOf(msg("a", viewOnce = true)), "a", now)).isFalse()
        assertThat(ImagineDiscussionWindow.offers(emptyList(), "a", now)).isFalse()
    }

    @Test
    fun `the discussion reads one line per message and is titled by the conversation`() {
        val window = ImagineDiscussionWindow.window(listOf(msg("a", "Coucou", "alice"), msg("b", "Hey", "me")), "b", now)
        val subject = ImagineDiscussionWindow.subject(window, { null }, viewer, "Les copains", "Discussion")!!
        assertThat(subject.reply.author).isEqualTo("Les copains")
        assertThat(subject.reply.text).isEqualTo("Alice : Coucou\nMoi : Hey")
        assertThat(subject.quoted).isNull()
    }

    @Test
    fun `a blank title falls back to the default and the served text replaces the original`() {
        val window = listOf(msg("a", "Hello"))
        val subject = ImagineDiscussionWindow.subject(window, { "Bonjour" }, viewer, "  ", "Discussion")!!
        assertThat(subject.reply.author).isEqualTo("Discussion")
        assertThat(subject.reply.text).isEqualTo("Alice : Bonjour")
    }

    @Test
    fun `a message without words says what its media are`() {
        val window = listOf(msg("a", "", attachments = listOf(photo("p"))))
        val subject = ImagineDiscussionWindow.subject(window, { null }, viewer, null, "Discussion")!!
        assertThat(subject.reply.text).isEqualTo("Alice : 📷")
    }

    @Test
    fun `at most the four most recent media are painted and each keeps the author of its message`() {
        val messages = (1..6).map { msg("m$it", sender = if (it % 2 == 0) "bob" else "alice", attachments = listOf(photo("p$it"))) }
        val window = ImagineDiscussionWindow.window(messages, "m6", now)
        val subject = ImagineDiscussionWindow.subject(window, { null }, viewer, null, "Discussion")!!
        assertThat(subject.media.map { it.id }).containsExactly("p3", "p4", "p5", "p6").inOrder()
        assertThat(subject.media.map { it.author!!.name }).containsExactly("Alice", "Bob", "Alice", "Bob").inOrder()
    }

    @Test
    fun `the request is built from the loaded discussion with one language and the passed accent`() {
        val request = ImagineDiscussionWindow.request(
            thread(3), "m3", { null }, viewer, "moi", "Groupe", "Discussion", "#4338CA", now,
        )!!
        assertThat(request.languages).isEmpty()
        assertThat(request.accentColor).isEqualTo("#4338CA")
        assertThat(request.quick).isFalse()
        assertThat(ImagineDiscussionWindow.request(listOf(msg("a", viewOnce = true)), "a", { null }, viewer, null, null, "D", "#000000", now)).isNull()
    }
}
