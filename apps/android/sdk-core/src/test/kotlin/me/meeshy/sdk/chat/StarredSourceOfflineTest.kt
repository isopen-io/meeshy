package me.meeshy.sdk.chat

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageStarredEvent
import me.meeshy.sdk.model.StarredAttachmentKind
import org.junit.Test

class StarredSourceOfflineTest {

    private class CacheOnlySource(var message: ApiMessage?, var prism: List<String> = listOf("fr", "es")) : StarredSource {
        override suspend fun message(messageId: String) = message
        override suspend fun conversation(conversationId: String): ApiConversation? = null
        override suspend fun readerPrism() = prism
    }

    private fun message(
        content: String = "Hello",
        deletedAt: String? = null,
        isViewOnce: Boolean? = null,
        effectFlags: Int? = null,
        attachments: List<ApiMessageAttachment> = emptyList(),
        translations: List<ApiTextTranslation> = emptyList(),
    ) = ApiMessage(
        id = "m1", conversationId = "c1", content = content, originalLanguage = "en", deletedAt = deletedAt,
        isViewOnce = isViewOnce, effectFlags = effectFlags, attachments = attachments, translations = translations,
    )

    private suspend fun star(source: CacheOnlySource): InMemoryStarredMessagesStore {
        val store = InMemoryStarredMessagesStore()
        StarredMessagesSync(store, source, conversationName = { null }, conversationAccent = { null }, nowMillis = { 1L })
            .onStarred(MessageStarredEvent("m1", "c1", true, null), null)
        return store
    }

    @Test
    fun `a star placed from another device is rebuilt from the cache with the preview served by the prism`() = runTest {
        val store = star(CacheOnlySource(message(translations = listOf(ApiTextTranslation(targetLanguage = "es", translatedContent = "Hola")))))

        assertThat(store.starred.value.items.single().contentPreview).isEqualTo("Hola")
    }

    @Test
    fun `a photo without text is rebuilt with its nature`() = runTest {
        val photo = ApiMessageAttachment(id = "a1", mimeType = "image/jpeg")
        val store = star(CacheOnlySource(message(content = "", attachments = listOf(photo))))

        assertThat(store.starred.value.items.single().attachmentKind).isEqualTo(StarredAttachmentKind.IMAGE)
    }

    @Test
    fun `a deleted message is not rebuilt`() = runTest {
        assertThat(star(CacheOnlySource(message(deletedAt = "2026-10-01T10:00:00Z"))).starred.value.items).isEmpty()
    }

    @Test
    fun `a view-once message is not rebuilt, by the legacy flag or by the bitfield`() = runTest {
        assertThat(star(CacheOnlySource(message(isViewOnce = true))).starred.value.items).isEmpty()
        val bit = MessageEffectFlags.VIEW_ONCE.toInt()
        assertThat(star(CacheOnlySource(message(effectFlags = bit))).starred.value.items).isEmpty()
    }
}
