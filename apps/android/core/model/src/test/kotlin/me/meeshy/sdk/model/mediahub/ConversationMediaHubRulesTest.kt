package me.meeshy.sdk.model.mediahub

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.MeeshyImageVariant
import org.junit.Test

class ConversationMediaHubRulesTest {

    private val origin = "https://meeshy.me"
    private val now = 2_000_000_000_000L

    private fun piece(id: String, mime: String, url: String = "https://cdn/$id", name: String = "$id.bin", viewOnce: Boolean? = null) =
        ApiMessageAttachment(id = id, mimeType = mime, fileUrl = url, originalName = name, isViewOnce = viewOnce)

    private fun message(
        id: String,
        createdAt: String = "2026-10-01T10:00:00.000Z",
        content: String = "",
        attachments: List<ApiMessageAttachment> = emptyList(),
        deletedAt: String? = null,
        expiresAt: String? = null,
        isViewOnce: Boolean? = null,
    ) = ApiMessage(
        id = id,
        conversationId = "c1",
        content = content,
        createdAt = createdAt,
        attachments = attachments,
        deletedAt = deletedAt,
        expiresAt = expiresAt,
        isViewOnce = isViewOnce,
        sender = ApiMessageSender(displayName = "Ada"),
    )

    @Test
    fun `la partition des pieces par type MIME est disjointe`() {
        assertThat(ConversationMediaKind.ofMime("image/webp")).isEqualTo(ConversationMediaKind.VISUAL)
        assertThat(ConversationMediaKind.ofMime("VIDEO/mp4")).isEqualTo(ConversationMediaKind.VISUAL)
        assertThat(ConversationMediaKind.ofMime("audio/mpeg")).isEqualTo(ConversationMediaKind.AUDIO)
        assertThat(ConversationMediaKind.ofMime("text/x-vcard")).isEqualTo(ConversationMediaKind.CONTACT)
        assertThat(ConversationMediaKind.ofMime("application/pdf")).isEqualTo(ConversationMediaKind.DOCUMENT)
        assertThat(ConversationMediaKind.ofMime(null)).isEqualTo(ConversationMediaKind.DOCUMENT)
    }

    @Test
    fun `kinds n est envoye que s il differe du defaut serveur`() {
        assertThat(ConversationMediaKind.kindsQuery(listOf(ConversationMediaKind.VISUAL))).isNull()
        assertThat(ConversationMediaKind.kindsQuery(listOf(ConversationMediaKind.AUDIO, ConversationMediaKind.AUDIO))).isEqualTo("audio")
        assertThat(ConversationMediaKind.searchQuery(" a ")).isNull()
        assertThat(ConversationMediaKind.searchQuery(" ab ")).isEqualTo("ab")
    }

    @Test
    fun `un message portant une photo et un PDF donne un element par segment`() {
        val mixed = message("m1", attachments = listOf(piece("a", "image/png"), piece("b", "application/pdf")))
        assertThat(ConversationMediaHubRules.items(listOf(mixed), ConversationMediaKind.VISUAL, now, origin).map { it.id })
            .containsExactly("m1:a")
        assertThat(ConversationMediaHubRules.items(listOf(mixed), ConversationMediaKind.DOCUMENT, now, origin).map { it.id })
            .containsExactly("m1:b")
    }

    @Test
    fun `les elements sont du plus recent au plus ancien`() {
        val old = message("m1", createdAt = "2026-09-01T10:00:00.000Z", attachments = listOf(piece("a", "image/png")))
        val recent = message("m2", createdAt = "2026-10-01T10:00:00.000Z", attachments = listOf(piece("b", "image/png")))
        assertThat(ConversationMediaHubRules.items(listOf(old, recent), ConversationMediaKind.VISUAL, now, origin).map { it.messageId })
            .containsExactly("m2", "m1").inOrder()
    }

    @Test
    fun `supprime, echu, masque, vue unique et piece masquee sont exclus`() {
        val photo = listOf(piece("a", "image/png"))
        val carriers = listOf(
            message("deleted", deletedAt = "2026-10-02T00:00:00.000Z", attachments = photo),
            message("expired", expiresAt = "2001-01-01T00:00:00.000Z", attachments = photo),
            message("hidden", attachments = photo),
            message("once", isViewOnce = true, attachments = photo),
            message("maskedPiece", attachments = listOf(piece("z", "image/png", viewOnce = true))),
            message("ok", attachments = photo),
        )
        val ids = ConversationMediaHubRules.items(carriers, ConversationMediaKind.VISUAL, now, origin, isHidden = { it == "hidden" })
            .map { it.messageId }
        assertThat(ids).containsExactly("ok")
    }

    @Test
    fun `les liens web et les adresses de conversation sont separes`() {
        val m = message("m", content = "voir https://example.com/x, puis https://meeshy.me/join/abc. et https://example.com/x")
        val links = ConversationMediaHubRules.items(m, ConversationMediaKind.LINK, origin)
        assertThat(links.map { (it.payload as MediaHubPayload.Link).url })
            .containsExactly("https://example.com/x", "https://meeshy.me/join/abc").inOrder()
        val conversations = ConversationMediaHubRules.items(m, ConversationMediaKind.CONVERSATION, origin)
        assertThat(conversations.map { (it.payload as MediaHubPayload.Link).host }).containsExactly("meeshy.me")
    }

    @Test
    fun `un lien meeshy n est pas un lien web`() {
        val m = message("m", content = "meeshy://c/123")
        assertThat(ConversationMediaHubRules.items(m, ConversationMediaKind.LINK, origin)).isEmpty()
    }

    @Test
    fun `la recherche ignore casse et accents et lit le nom des pieces`() {
        val m = message("m", content = "Réunion", attachments = listOf(piece("a", "application/pdf", name = "Budget.pdf")))
        assertThat(ConversationMediaHubRules.matches(m, "reunion")).isTrue()
        assertThat(ConversationMediaHubRules.matches(m, "BUDGET")).isTrue()
        assertThat(ConversationMediaHubRules.matches(m, "absent")).isFalse()
    }

    @Test
    fun `une piece chiffree reste listee et se declare chiffree`() {
        val enc = ApiMessageAttachment(id = "e", mimeType = "image/jpeg", fileUrl = "https://cdn/e", isEncrypted = true)
        val item = ConversationMediaHubRules.items(message("m", attachments = listOf(enc)), ConversationMediaKind.VISUAL, origin).single()
        assertThat(item.attachment?.isEncrypted).isTrue()
    }

    private fun hubPiece(variants: List<MeeshyImageVariant>, encrypted: Boolean = false, video: Boolean = false, thumb: String? = "https://cdn/thumb") =
        MediaHubAttachment(
            id = "a", url = "https://cdn/full", thumbnailUrl = thumb, name = "", mimeType = if (video) "video/mp4" else "image/jpeg",
            sizeBytes = null, durationMs = null, isVideo = video, isEncrypted = encrypted, alt = null, width = 4000, variants = variants,
        )

    @Test
    fun `la tuile charge la plus petite variante suffisante`() {
        val ladder = listOf(MeeshyImageVariant(200, 200, "https://cdn/v200", 1), MeeshyImageVariant(600, 600, "https://cdn/v600", 2))
        assertThat(hubPiece(ladder).tileUrl(150)).isEqualTo("https://cdn/v200")
        assertThat(hubPiece(ladder).tileUrl(300)).isEqualTo("https://cdn/v600")
        assertThat(hubPiece(emptyList()).tileUrl(300)).isEqualTo("https://cdn/thumb")
    }

    @Test
    fun `une piece chiffree ou une video sans vignette ne charge rien`() {
        assertThat(hubPiece(emptyList(), encrypted = true).tileUrl(300)).isNull()
        assertThat(hubPiece(emptyList(), video = true, thumb = null).tileUrl(300)).isNull()
        assertThat(hubPiece(emptyList(), video = true).tileUrl(300)).isEqualTo("https://cdn/thumb")
    }

    @Test
    fun `une piece chiffree de bout en bout par son mode est scellee meme sans le drapeau`() {
        val sealed = ApiMessageAttachment(id = "e", mimeType = "image/png", fileUrl = "/api/v1/attachments/file/e.bin", encryptionMode = "e2ee")
        val item = ConversationMediaHubRules.items(listOf(message("m1", attachments = listOf(sealed))), ConversationMediaKind.VISUAL, now, origin).single()

        assertThat(item.attachment?.isEncrypted).isTrue()
        assertThat(item.attachment?.tileUrl(140)).isNull()
    }

    @Test
    fun `les adresses d une piece passent toutes par le resolveur, un lien reste tel quel`() {
        val variant = MeeshyImageVariant(width = 160, height = 160, url = "v/160.webp", size = 10)
        val photo = ApiMessageAttachment(id = "p", mimeType = "image/png", fileUrl = "/api/v1/attachments/file/p.png", thumbnailUrl = "t/p.jpg", imageVariants = listOf(variant))
        val visual = ConversationMediaHubRules.items(listOf(message("m1", attachments = listOf(photo))), ConversationMediaKind.VISUAL, now, origin).single()
        val link = ConversationMediaHubRules.items(listOf(message("m2", content = "voir https://example.org/a")), ConversationMediaKind.LINK, now, origin).single()
        val resolve = { url: String -> "https://gate.test/$url".replace("test//", "test/") }

        val resolved = visual.resolvingMedia(resolve).attachment!!

        assertThat(resolved.url).isEqualTo("https://gate.test/api/v1/attachments/file/p.png")
        assertThat(resolved.thumbnailUrl).isEqualTo("https://gate.test/t/p.jpg")
        assertThat(resolved.variants.single().url).isEqualTo("https://gate.test/v/160.webp")
        assertThat(link.resolvingMedia(resolve)).isEqualTo(link)
    }
}
