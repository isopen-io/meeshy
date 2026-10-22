package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.time.Instant
import kotlinx.serialization.decodeFromString
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test

class MessageEntityFactoryTest {

    private fun message(
        id: String = "m1",
        conversationId: String = "c1",
        createdAt: String? = "2026-06-01T10:00:00Z",
    ) = ApiMessage(id = id, conversationId = conversationId, content = "salut", createdAt = createdAt)

    @Test
    fun `cached keeps the server identity and serializes the whole message as the payload`() {
        val source = message()

        val row = MessageEntityFactory.cached(source, cachedAt = 42L)

        assertThat(row.id).isEqualTo("m1")
        assertThat(row.conversationId).isEqualTo("c1")
        assertThat(row.seq).isNull()
        assertThat(row.createdAt).isEqualTo(Instant.parse("2026-06-01T10:00:00Z").toEpochMilli())
        assertThat(row.cachedAt).isEqualTo(42L)
        assertThat(MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)).isEqualTo(source)
    }

    @Test
    fun `cached leaves the send state empty because the row is server truth`() {
        assertThat(MessageEntityFactory.cached(message(), cachedAt = 1L).sendState).isNull()
    }

    @Test
    fun `cached files the row under the conversation that owns the page when it differs from the message`() {
        val row = MessageEntityFactory.cached(message(conversationId = "other"), cachedAt = 1L, conversationId = "c1")

        assertThat(row.conversationId).isEqualTo("c1")
    }

    @Test
    fun `cached falls back to epoch zero when the message carries no creation instant`() {
        assertThat(MessageEntityFactory.cached(message(createdAt = null), cachedAt = 1L).createdAt).isEqualTo(0L)
    }

    @Test
    fun `local tags the row with the optimistic send state`() {
        val sending = MessageEntityFactory.local(message(), cachedAt = 7L, state = LocalSendState.SENDING)
        val failed = MessageEntityFactory.local(message(), cachedAt = 7L, state = LocalSendState.FAILED)

        assertThat(sending.sendState).isEqualTo("SENDING")
        assertThat(failed.sendState).isEqualTo("FAILED")
    }

    @Test
    fun `local differs from cached by the send state alone`() {
        val source = message()

        val local = MessageEntityFactory.local(source, cachedAt = 9L, state = LocalSendState.SENDING)

        assertThat(local.copy(sendState = null)).isEqualTo(MessageEntityFactory.cached(source, cachedAt = 9L))
    }

    @Test
    fun `a local row decodes back into the message with its send state`() {
        val source = message(id = "cid_1")

        val decoded = MessageEntityFactory.local(source, cachedAt = 1L, state = LocalSendState.FAILED).toLocalMessage()

        assertThat(decoded).isEqualTo(LocalMessage(source, LocalSendState.FAILED))
    }

    @Test
    fun `no other source of the message cache builds a MessageEntity row by hand`() {
        val offenders = conversationSources()
            .filter { it.name != "MessageEntityFactory.kt" }
            .filter { Regex("""\bMessageEntity\(""").containsMatchIn(it.readText()) }
            .map { it.name }

        assertThat(offenders).isEmpty()
    }

    /**
     * Le repertoire de travail de Gradle est tantot le MODULE, tantot la racine du depot :
     * sans le `check`, un chemin inexistant donnerait une liste VIDE et la garde passerait
     * au vert en ne lisant rien (modele de `ApiPathLiteralGuardTest`).
     */
    private fun conversationSources(): List<File> {
        val relative = "src/main/kotlin/me/meeshy/sdk/conversation"
        val directory = listOf(File(relative), File("sdk-core/$relative"), File("apps/android/sdk-core/$relative"))
            .firstOrNull { it.isDirectory }
        check(directory != null) { "sources introuvables depuis ${File(relative).absolutePath}" }
        val sources = directory.walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()
        check(sources.any { it.name == "MessageCacheSource.kt" }) { "MessageCacheSource.kt introuvable" }
        return sources
    }
}
