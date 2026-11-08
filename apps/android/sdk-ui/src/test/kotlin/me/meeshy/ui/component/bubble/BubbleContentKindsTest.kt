package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.BubbleAttachmentLayout
import me.meeshy.sdk.model.ProtectionDescriptor
import org.junit.Test

private object KindsReader : LanguageResolver.ContentLanguagePreferences {
    override val systemLanguage: String = "fr"
    override val regionalLanguage: String? = null
    override val customDestinationLanguage: String? = null
}

private fun build(message: ApiMessage, seal: Boolean = false) = BubbleContentBuilder.build(
    message,
    currentUserId = "me",
    preferences = KindsReader,
    sealUnopenedViewOnce = seal,
)

private fun message(
    attachments: List<ApiMessageAttachment> = emptyList(),
    content: String = "bonjour",
    isViewOnce: Boolean = false,
    consumedByMe: Boolean? = null,
) = ApiMessage(
    id = "m1",
    conversationId = "c1",
    senderId = "other",
    content = content,
    attachments = attachments,
    isViewOnce = isViewOnce,
    consumedByMe = consumedByMe,
)

private fun att(id: String, mime: String, name: String? = null) =
    ApiMessageAttachment(id = id, mimeType = mime, originalName = name, fileUrl = "https://x/$id")

class BubbleContentKindsTest {

    @Test
    fun `une image et une video donnent une grille visuelle de deux pieces et une video`() {
        val content = build(message(listOf(att("i", "image/png"), att("v", "video/mp4", "c.mp4"))))
        assertThat(content.attachmentLayout).isEqualTo(BubbleAttachmentLayout.VisualGrid(listOf("i", "v")))
        assertThat(content.videos.map { it.attachmentId }).containsExactly("v")
    }

    @Test
    fun `image plus pdf donne Mixed et texte seul aucune mise en page`() {
        assertThat(build(message(listOf(att("i", "image/png"), att("d", "application/pdf", "a.pdf")))).attachmentLayout)
            .isInstanceOf(BubbleAttachmentLayout.Mixed::class.java)
        assertThat(build(message()).attachmentLayout).isEqualTo(BubbleAttachmentLayout.None)
    }

    @Test
    fun `trois vocaux donnent Audio de trois`() {
        val content = build(message(listOf(att("1", "audio/aac"), att("2", "audio/aac"), att("3", "audio/aac"))))
        assertThat(content.attachmentLayout).isEqualTo(BubbleAttachmentLayout.Audio(listOf("1", "2", "3")))
    }

    @Test
    fun `une vue unique non ouverte reste inchangee sans la couture de scelle`() {
        val content = build(message(listOf(att("i", "image/png")), isViewOnce = true, consumedByMe = false))
        assertThat(content.isViewOnceSealed).isFalse()
        assertThat(content.text).isEqualTo("bonjour")
        assertThat(content.images).hasSize(1)
    }

    @Test
    fun `une vue unique non ouverte scellee ne porte ni texte ni piece`() {
        val content = build(message(listOf(att("i", "image/png"), att("f", "application/pdf", "a.pdf")), isViewOnce = true, consumedByMe = false), seal = true)
        assertThat(content.isViewOnceSealed).isTrue()
        assertThat(content.text).isEmpty()
        assertThat(content.originalText).isNull()
        assertThat(content.images).isEmpty()
        assertThat(content.files).isEmpty()
        assertThat(content.videos).isEmpty()
        assertThat(content.audios).isEmpty()
        assertThat(content.attachmentLayout).isEqualTo(BubbleAttachmentLayout.None)
        assertThat(content.blurReveal).isNull()
        assertThat(content.protection.isViewOnce).isTrue()
    }

    @Test
    fun `ouverte par ce lecteur elle n est pas scellee`() {
        val content = build(message(isViewOnce = true, consumedByMe = true), seal = true)
        assertThat(content.isViewOnceSealed).isFalse()
        assertThat(content.isViewOnceOpenedByMe).isTrue()
    }

    @Test
    fun `un message ordinaire ne porte aucune protection`() {
        assertThat(build(message()).protection).isEqualTo(ProtectionDescriptor.Unprotected)
    }

    @Test
    fun `une carte vcf avec une extension de code reste un contact`() {
        val content = build(message(listOf(att("c", "application/json", "Bob.vcf"))))
        assertThat(content.contactCards.map { it.attachmentId }).containsExactly("c")
    }
}
