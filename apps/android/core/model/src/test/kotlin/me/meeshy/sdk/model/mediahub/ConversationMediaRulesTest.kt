package me.meeshy.sdk.model.mediahub

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import org.junit.Test

class ConversationMediaRulesTest {

    private val now = 2_000_000_000_000L

    private fun piece(id: String, mime: String) = ApiMessageAttachment(id = id, mimeType = mime, fileUrl = "https://cdn/$id")

    private fun message(
        id: String,
        vararg pieces: ApiMessageAttachment,
        deletedAt: String? = null,
        expiresAt: String? = null,
        isViewOnce: Boolean? = null,
    ) = ApiMessage(
        id = id, conversationId = "c1", createdAt = "2026-10-01T10:00:00.000Z",
        attachments = pieces.toList(), deletedAt = deletedAt, expiresAt = expiresAt, isViewOnce = isViewOnce,
    )

    @Test
    fun `ni vue unique ni supprime ni echu n entre sur le disque`() {
        val kept = message("ok", piece("a", "image/png"))
        val admitted = ConversationMediaRules.admitted(
            listOf(
                kept,
                message("once", piece("b", "image/png"), isViewOnce = true),
                message("gone", piece("c", "image/png"), deletedAt = "2026-10-02T00:00:00.000Z"),
                message("late", piece("d", "image/png"), expiresAt = "2001-01-01T00:00:00.000Z"),
            ),
            now,
        )
        assertThat(admitted).containsExactly(kept)
    }

    @Test
    fun `un message supprime quitte la liste d un genre`() {
        val list = listOf(message("m1", piece("a", "application/pdf")), message("m2", piece("b", "application/pdf")))
        assertThat(ConversationMediaRules.dropping(list, "m1").map { it.id }).containsExactly("m2")
    }

    @Test
    fun `retirer la derniere piece d un genre retire le porteur, pas celui d un autre genre`() {
        val mixed = message("m1", piece("photo", "image/png"), piece("doc", "application/pdf"))
        val documents = ConversationMediaRules.droppingAttachment(listOf(mixed), ConversationMediaKind.DOCUMENT, "m1", "doc")
        val visuals = ConversationMediaRules.droppingAttachment(listOf(mixed), ConversationMediaKind.VISUAL, "m1", "doc")
        assertThat(documents).isEmpty()
        assertThat(visuals.single().attachments.map { it.id }).containsExactly("photo")
    }

    @Test
    fun `le texte d un lien survit au retrait d une de ses pieces`() {
        val link = message("m1", piece("a", "image/png")).copy(content = "https://example.com/x")
        val kept = ConversationMediaRules.droppingAttachment(listOf(link), ConversationMediaKind.LINK, "m1", "a")
        assertThat(kept).hasSize(1)
    }

    @Test
    fun `le prechauffage ne prend que la tete et le recent`() {
        val items = (0 until 40).map { i ->
            val old = i >= 30
            MediaHubItem(
                id = "m$i:a$i", kind = ConversationMediaKind.VISUAL, messageId = "m$i", sentAtIso = null,
                sentAtMillis = if (old) now - 400L * 24 * 3600 * 1000 else now - i * 1000L,
                senderName = "",
                payload = MediaHubPayload.Attachment(
                    MediaHubAttachment("a$i", "https://cdn/$i", null, "", "image/png", null, null, false, false, null),
                ),
            )
        }
        val targets = ConversationMediaRules.prewarmTargets(items, now)
        assertThat(targets).hasSize(30)
        assertThat(targets.map { it.id }).doesNotContain("a35")
    }

    @Test
    fun `un fichier chiffre n est jamais prechauffe`() {
        val encrypted = MediaHubItem(
            "m:a", ConversationMediaKind.VISUAL, "m", null, now, "",
            MediaHubPayload.Attachment(MediaHubAttachment("a", "https://cdn/a", null, "", "image/png", null, null, false, true, null)),
        )
        assertThat(ConversationMediaRules.prewarmTargets(listOf(encrypted), now)).isEmpty()
    }
}
