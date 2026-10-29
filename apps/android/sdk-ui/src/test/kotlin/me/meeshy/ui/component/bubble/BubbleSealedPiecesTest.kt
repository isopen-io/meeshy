package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import org.junit.Test

/**
 * #13493 — une pièce chiffrée de bout en bout se PRÉSENTE comme chiffrée (une rangée scellée par pièce, sans nom,
 * sans taille, sans adresse), jamais comme un document téléchargeable.
 */
class BubbleSealedPiecesTest {

    private val prefs = object : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private val blob = ApiMessageAttachment(
        id = "blob-1",
        mimeType = "application/octet-stream",
        originalName = "",
        fileName = "e2ee_8b1f.bin",
        fileUrl = "2026/10/u1/e2ee_8b1f.bin",
        fileSize = 1240,
        isEncrypted = true,
        encryptionMode = "e2ee",
    )

    private fun message(vararg pieces: ApiMessageAttachment, mode: String? = null, deletedAt: String? = null) = ApiMessage(
        id = "m1", conversationId = "c1", senderId = "other", content = "[Encrypted]", originalLanguage = "fr",
        isEncrypted = mode != null, encryptionMode = mode, attachments = pieces.toList(), deletedAt = deletedAt,
    )

    private fun build(message: ApiMessage) = BubbleContentBuilder.build(message, currentUserId = "me", preferences = prefs)

    @Test
    fun `chaque blob e2ee devient une rangee scellee, jamais une rangee de fichier`() {
        val content = build(message(blob, blob.copy(id = "blob-2", mimeType = "image/png")))

        assertThat(content.sealedPieceIds).containsExactly("blob-1", "blob-2").inOrder()
        assertThat(content.files).isEmpty()
        assertThat(content.images).isEmpty()
    }

    @Test
    fun `un message chiffre de bout en bout scelle toutes ses pieces, meme servies sans drapeau`() {
        val plain = blob.copy(id = "p", mimeType = "application/pdf", isEncrypted = false, encryptionMode = null)

        assertThat(build(message(plain, mode = "e2ee")).sealedPieceIds).containsExactly("p")
    }

    @Test
    fun `un message ordinaire n'a aucune piece scellee`() {
        val pdf = blob.copy(id = "pdf", mimeType = "application/pdf", originalName = "devis.pdf", isEncrypted = false, encryptionMode = null)

        val content = build(message(pdf).copy(content = "Voici", isEncrypted = false))

        assertThat(content.sealedPieceIds).isEmpty()
        assertThat(content.files.single().isSealed).isFalse()
    }

    @Test
    fun `un message supprime ne montre aucune piece scellee`() {
        assertThat(build(message(blob, deletedAt = "2026-10-28T10:00:00Z")).sealedPieceIds).isEmpty()
    }

    @Test
    fun `un fichier marque chiffre sans etre un blob se presente scelle, sans adresse a ouvrir`() {
        val encrypted = blob.copy(id = "enc", mimeType = "application/pdf", originalName = "secret.pdf", encryptionMode = "server")

        val file = build(message(encrypted).copy(content = "Voici", isEncrypted = false, encryptionMode = null)).files.single()

        assertThat(file.isSealed).isTrue()
        assertThat(file.url).isNull()
        assertThat(file.name).isNull()
    }

    @Test
    fun `une piece locale file ou content est deja sur l'appareil, aucun badge de telechargement`() {
        val local = blob.copy(id = "l", mimeType = "application/pdf", originalName = "x.pdf", fileUrl = "file:///data/x.pdf", isEncrypted = false, encryptionMode = null)
        val remote = local.copy(id = "r", fileUrl = "/files/x.pdf")

        val files = build(message(local, remote).copy(content = "", isEncrypted = false, encryptionMode = null)).files

        assertThat(files.map { it.isOnDevice }).containsExactly(true, false).inOrder()
    }
}

class BubbleProtectedPiecesTest {
    private val prefs = object : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private fun pdf(viewOnce: Boolean? = null) = ApiMessageAttachment(
        id = "d", mimeType = "application/pdf", originalName = "x.pdf", fileName = "x.pdf", fileUrl = "/files/x.pdf", isViewOnce = viewOnce,
    )

    private fun build(piece: ApiMessageAttachment, viewOnce: Boolean? = null) = BubbleContentBuilder.build(
        ApiMessage(id = "m", conversationId = "c", senderId = "o", content = "", attachments = listOf(piece), isViewOnce = viewOnce),
        currentUserId = "me", preferences = prefs,
    ).files.single()

    @Test
    fun `un fichier a vue unique est protege et son badge n'offre rien`() {
        val file = build(pdf(viewOnce = true))
        assertThat(file.isProtected).isTrue()
        assertThat(BubbleFileTransfers.None.badgeOf(file)).isEqualTo(me.meeshy.sdk.model.piece.PieceBadge.None)
    }

    @Test
    fun `un fichier d'un message a vue unique est protege aussi`() {
        assertThat(build(pdf(), viewOnce = true).isProtected).isTrue()
    }

    @Test
    fun `un fichier ordinaire propose son telechargement`() {
        val file = build(pdf())
        assertThat(file.isProtected).isFalse()
        assertThat(BubbleFileTransfers.None.badgeOf(file)).isInstanceOf(me.meeshy.sdk.model.piece.PieceBadge.Idle::class.java)
    }
}
