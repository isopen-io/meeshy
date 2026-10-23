package me.meeshy.sdk.chat

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.MessageStarredEvent
import me.meeshy.sdk.model.StarredMessage
import me.meeshy.sdk.model.StarredMessages
import org.junit.Test

class StarredMessagesSyncTest {

    private class FakeSource(
        var message: ApiMessage? = null,
        var conversation: ApiConversation? = null,
        var prism: List<String> = listOf("fr"),
    ) : StarredSource {
        override suspend fun message(messageId: String) = message
        override suspend fun conversation(conversationId: String) = conversation
        override suspend fun readerPrism() = prism
    }

    private fun msg(id: String = "m1", content: String = "Hello", translations: List<ApiTextTranslation> = emptyList()) =
        ApiMessage(id = id, conversationId = "c1", content = content, originalLanguage = "en", translations = translations)

    private fun fixture(
        store: InMemoryStarredMessagesStore = InMemoryStarredMessagesStore(),
        source: FakeSource = FakeSource(),
    ) = Triple(
        store,
        source,
        StarredMessagesSync(store, source, conversationName = { "Team" }, conversationAccent = { "AABBCC" }, nowMillis = { 99L }),
    )

    @Test
    fun `placeRemote composes the snapshot from the database in the reader language`() = runTest {
        val (store, source, sync) = fixture()
        source.message = msg(translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour")))
        source.conversation = ApiConversation(id = "c1")

        sync.onStarred(MessageStarredEvent("m1", "c1", true, "2026-10-01T10:00:00.000Z"))

        val star = store.starred.value.items.single()
        assertThat(star.contentPreview).isEqualTo("Bonjour")
        assertThat(star.conversationName).isEqualTo("Team")
        assertThat(star.starredAtMillis).isGreaterThan(99L)
    }

    @Test
    fun `a message absent from the cache composes no snapshot`() = runTest {
        val (store, _, sync) = fixture()

        sync.onStarred(MessageStarredEvent("m1", "c1", true, null))

        assertThat(store.starred.value.items).isEmpty()
    }

    @Test
    fun `an already starred message keeps its snapshot`() = runTest {
        val existing = StarredMessage(messageId = "m1", conversationId = "c1", contentPreview = "mine")
        val (store, source, sync) = fixture(InMemoryStarredMessagesStore(StarredMessages(listOf(existing))))
        source.message = msg(content = "other")

        sync.onStarred(MessageStarredEvent("m1", "c1", true, null))

        assertThat(store.starred.value.items.single().contentPreview).isEqualTo("mine")
    }

    @Test
    fun `unstar delete and expiry remove the star`() = runTest {
        val star = StarredMessage(messageId = "m1", conversationId = "c1")
        val (store, _, sync) = fixture(InMemoryStarredMessagesStore(StarredMessages(listOf(star, star.copy(messageId = "m2")))))

        sync.onStarred(MessageStarredEvent("m1", "c1", false, null))
        sync.onGone("m2")

        assertThat(store.starred.value.items).isEmpty()
    }

    @Test
    fun `an edit updates the preview of a starred message only`() = runTest {
        val star = StarredMessage(messageId = "m1", conversationId = "c1", contentPreview = "old")
        val (store, _, sync) = fixture(InMemoryStarredMessagesStore(StarredMessages(listOf(star))))

        sync.onEdited(msg("m1", "new"))
        sync.onEdited(msg("m9", "ignored"))

        assertThat(store.starred.value.items.map { it.contentPreview }).containsExactly("new")
    }

    @Test
    fun `reset empties the store`() = runTest {
        val (store, _, sync) = fixture(
            InMemoryStarredMessagesStore(StarredMessages(listOf(StarredMessage(messageId = "m1", conversationId = "c1")))),
        )

        sync.reset()

        assertThat(store.starred.value.items).isEmpty()
    }
}
