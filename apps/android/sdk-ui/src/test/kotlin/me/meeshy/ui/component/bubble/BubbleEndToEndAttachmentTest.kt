package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MessageEffects
import org.junit.Test

/**
 * #13106 — une pièce chiffrée de bout en bout reçue (un blob `application/octet-stream`,
 * `originalName` vide, `encryptionMode: "e2ee"`) ne devient jamais une bulle de fichier
 * sans nom au lien mort : la bulle dit où elle se lit, sans nom, sans taille, sans lien, et
 * rien n'est téléchargé (ni Coil, ni lecteur, ni partage).
 */
class BubbleEndToEndAttachmentTest {

    private val prefs = object : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private val blob = ApiMessageAttachment(
        id = "blob-1",
        mimeType = "application/octet-stream",
        originalName = "",
        fileName = "e2ee_8b1f0c1e-0000-4000-8000-000000000000.bin",
        fileUrl = "2026/10/u1/e2ee_8b1f0c1e-0000-4000-8000-000000000000.bin",
        fileSize = 1240,
        isEncrypted = true,
        encryptionMode = "e2ee",
    )

    @Test
    fun `un blob chiffré de bout en bout ne devient pas une bulle de fichier`() {
        val built = BubbleAttachmentBuilder.build(
            visibleAttachments = listOf(blob, blob.copy(id = "blob-2", mimeType = "image/png")),
            effects = MessageEffects(),
            preferences = prefs,
            mediaBaseUrl = "https://gate.staging.meeshy.me",
            displayDensity = 2f,
        )

        assertThat(built.files).isEmpty()
        assertThat(built.images).isEmpty()
        assertThat(built.audios).isEmpty()
    }

    @Test
    fun `un message qui porte un blob e2ee se dit chiffré, même servi en clair`() {
        val message = ApiMessage(
            id = "m1",
            conversationId = "c1",
            senderId = "other",
            content = "U2FsdGVkX1+opaque",
            originalLanguage = "fr",
            isEncrypted = false,
            attachments = listOf(blob),
        )

        val content = BubbleContentBuilder.build(message, currentUserId = "me", preferences = prefs)

        assertThat(content.isEndToEndSealed).isTrue()
        assertThat(content.holdsEndToEndSend).isTrue()
        assertThat(content.files).isEmpty()
        assertThat(content.text).isEmpty()
    }

    @Test
    fun `une pièce ordinaire reste une bulle de fichier`() {
        val built = BubbleAttachmentBuilder.build(
            visibleAttachments = listOf(blob.copy(id = "pdf", mimeType = "application/pdf", originalName = "devis.pdf", isEncrypted = false, encryptionMode = null)),
            effects = MessageEffects(),
            preferences = prefs,
            mediaBaseUrl = null,
            displayDensity = 2f,
        )

        assertThat(built.files.map { it.name }).containsExactly("devis.pdf")
    }
}
