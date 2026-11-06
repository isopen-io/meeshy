package me.meeshy.sdk.model.search

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.ApiTextTranslation
import org.junit.Test

class ListMessageSearchTest {

    private fun message(
        id: String = "m1",
        content: String = "Hello team",
        createdAt: String? = "2026-11-02T10:00:00Z",
        translations: List<ApiTextTranslation> = emptyList(),
        isEncrypted: Boolean? = null,
        isViewOnce: Boolean? = null,
        isBlurred: Boolean? = null,
        expiresAt: String? = null,
        deletedAt: String? = null,
    ) = ApiMessage(
        id = id,
        conversationId = "c1",
        content = content,
        originalLanguage = "en",
        createdAt = createdAt,
        sender = ApiMessageSender(displayName = "Ada", username = "ada"),
        translations = translations,
        isEncrypted = isEncrypted,
        isViewOnce = isViewOnce,
        isBlurred = isBlurred,
        expiresAt = expiresAt,
        deletedAt = deletedAt,
    )

    private fun french(text: String) = ApiTextTranslation(targetLanguage = "fr", translatedContent = text)

    private fun hit(id: String, at: Long, text: String = id) =
        ListMessageHit(messageId = id, conversationId = "c1", createdAtMillis = at, text = text, senderName = "Ada")

    @Test
    fun `a query shorter than two characters searches nothing, spaces aside`() {
        assertThat(ListMessageSearch.queryOf("a")).isNull()
        assertThat(ListMessageSearch.queryOf("  a  ")).isNull()
        assertThat(ListMessageSearch.queryOf("  ab ")).isEqualTo("ab")
    }

    @Test
    fun `a hit serves the translation of the first prism language that has one`() {
        val hit = ListMessageSearch.hitOf(message(translations = listOf(french("Bonjour l'équipe"))), listOf("fr", "en"))

        assertThat(hit?.text).isEqualTo("Bonjour l'équipe")
        assertThat(hit?.senderName).isEqualTo("Ada")
        assertThat(hit?.createdAtMillis).isEqualTo(java.time.Instant.parse("2026-11-02T10:00:00Z").toEpochMilli())
    }

    @Test
    fun `a hit serves the original when the reader prism reaches its language first`() {
        val hit = ListMessageSearch.hitOf(message(translations = listOf(french("Bonjour"))), listOf("en", "fr"))

        assertThat(hit?.text).isEqualTo("Hello team")
    }

    @Test
    fun `a hit serves the original without any prism language rather than the first translation`() {
        val hit = ListMessageSearch.hitOf(message(translations = listOf(french("Bonjour"))), emptyList())

        assertThat(hit?.text).isEqualTo("Hello team")
    }

    @Test
    fun `a protected message is never a hit, whatever the server returned`() {
        val prism = listOf("fr")
        assertThat(ListMessageSearch.hitOf(message(isEncrypted = true), prism)).isNull()
        assertThat(ListMessageSearch.hitOf(message(isViewOnce = true), prism)).isNull()
        assertThat(ListMessageSearch.hitOf(message(isBlurred = true), prism)).isNull()
        assertThat(ListMessageSearch.hitOf(message(expiresAt = "2026-11-03T00:00:00Z"), prism)).isNull()
        assertThat(ListMessageSearch.hitOf(message(deletedAt = "2026-11-02T00:00:00Z"), prism)).isNull()
        assertThat(ListMessageSearch.hitOf(message(content = "  "), prism)).isNull()
    }

    @Test
    fun `an encrypted translation is never served`() {
        val sealed = ApiTextTranslation(targetLanguage = "fr", translatedContent = "xx", isEncrypted = true)

        assertThat(ListMessageSearch.hitOf(message(translations = listOf(sealed)), listOf("fr"))?.text).isEqualTo("Hello team")
    }

    @Test
    fun `the server is never asked about an end to end encrypted conversation`() {
        val conversations = listOf(
            ApiConversation(id = "a", encryptionMode = "server"),
            ApiConversation(id = "b", encryptionMode = "e2ee"),
            ApiConversation(id = "c"),
            ApiConversation(id = "d", encryptionMode = "hybrid"),
        )

        assertThat(ListMessageSearch.remoteTargets(conversations, max = 2)).containsExactly("a", "c").inOrder()
        assertThat(ListMessageSearch.remoteTargets(conversations, max = 10)).containsExactly("a", "c", "d").inOrder()
    }

    @Test
    fun `merging keeps the server copy of a message found twice and sorts the newest first`() {
        val local = listOf(hit("m1", at = 10, text = "local"), hit("m2", at = 30))
        val remote = listOf(hit("m1", at = 10, text = "served"), hit("m3", at = 20))

        val merged = ListMessageSearch.merge(local, remote)

        assertThat(merged.map { it.messageId }).containsExactly("m2", "m3", "m1").inOrder()
        assertThat(merged.first { it.messageId == "m1" }.text).isEqualTo("served")
    }

    @Test
    fun `merging is capped`() {
        val many = (1..80).map { hit("m$it", at = it.toLong()) }

        assertThat(ListMessageSearch.merge(many, emptyList(), limit = 30)).hasSize(30)
    }

    @Test
    fun `a first search shows the section searching, a revalidation keeps the hits on screen`() {
        val cold = ListMessageSearchState.Idle.started("ab")
        assertThat(cold.phase).isEqualTo(ListMessageSearchPhase.SEARCHING)
        assertThat(cold.showsSection).isTrue()

        val shown = cold.withRemote("ab", emptyList(), listOf(hit("m1", at = 1)), failed = false)
        val again = shown.started("abc")
        assertThat(again.phase).isEqualTo(ListMessageSearchPhase.REVALIDATING)
        assertThat(again.hits.map { it.messageId }).containsExactly("m1")
    }

    @Test
    fun `local hits paint before the server answers`() {
        val state = ListMessageSearchState.Idle.started("ab").withLocal("ab", listOf(hit("m1", at = 1)), remotePending = true)

        assertThat(state.phase).isEqualTo(ListMessageSearchPhase.REVALIDATING)
        assertThat(state.hits.map { it.messageId }).containsExactly("m1")
        assertThat(ListMessageSearchState.Idle.started("ab").withLocal("ab", emptyList(), remotePending = false).phase)
            .isEqualTo(ListMessageSearchPhase.LOADED)
    }

    @Test
    fun `an answer to an older query is ignored`() {
        val state = ListMessageSearchState.Idle.started("abc")

        assertThat(state.withLocal("ab", listOf(hit("m1", at = 1)), remotePending = false)).isEqualTo(state)
        assertThat(state.withRemote("ab", emptyList(), listOf(hit("m1", at = 1)), failed = false)).isEqualTo(state)
    }

    @Test
    fun `a failure with nothing found is a failure, a failure over local hits is not`() {
        val started = ListMessageSearchState.Idle.started("ab")

        assertThat(started.withRemote("ab", emptyList(), emptyList(), failed = true).phase).isEqualTo(ListMessageSearchPhase.FAILED)
        val kept = started.withRemote("ab", listOf(hit("m1", at = 1)), emptyList(), failed = true)
        assertThat(kept.phase).isEqualTo(ListMessageSearchPhase.LOADED)
        assertThat(kept.hits).hasSize(1)
    }

    @Test
    fun `an empty loaded search and an idle one show no section`() {
        assertThat(ListMessageSearchState.Idle.showsSection).isFalse()
        val empty = ListMessageSearchState.Idle.started("ab").withRemote("ab", emptyList(), emptyList(), failed = false)
        assertThat(empty.showsSection).isFalse()
    }

    @Test
    fun `a server hit keeps the text the server served, its sender and its conversation title`() {
        val served = GlobalMessageSearchHit(
            id = "m9",
            conversationId = "c9",
            createdAt = "2026-11-02T10:00:00Z",
            content = "Bonjour",
            servedLanguage = "fr",
            originalContent = "Hello",
            sender = GlobalMessageSearchSender(displayName = "", username = "ada"),
            conversation = GlobalMessageSearchConversation(title = "Ada", avatar = "2026/11/ada.png"),
        )

        val hit = ListMessageSearch.hitOf(served)

        assertThat(hit?.text).isEqualTo("Bonjour")
        assertThat(hit?.senderName).isEqualTo("ada")
        assertThat(hit?.conversationTitle).isEqualTo("Ada")
        assertThat(hit?.conversationAvatar).isEqualTo("2026/11/ada.png")
        assertThat(ListMessageSearch.hitOf(served.copy(content = " ", originalContent = ""))).isNull()
    }

    @Test
    fun `a server hit decodes from the contract wire`() {
        val json = """{"id":"m1","conversationId":"c1","createdAt":"2026-11-02T10:00:00Z","messageType":"text",
            "content":"Bonjour","servedLanguage":"fr","originalContent":"Hello","originalLanguage":"en",
            "sender":{"id":"p1","userId":null,"displayName":"Ada","username":null,"avatar":null},
            "conversation":{"id":"c1","identifier":null,"type":"direct","title":"Ada","avatar":null},"extra":1}"""

        val hit = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }.decodeFromString(GlobalMessageSearchHit.serializer(), json)

        assertThat(hit.content).isEqualTo("Bonjour")
        assertThat(hit.conversation?.title).isEqualTo("Ada")
    }
}
