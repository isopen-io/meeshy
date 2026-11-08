package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.chat.fileviewer.FileViewerRequest
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleFile
import org.junit.Test

class ProtectedDocumentTest {

    private fun bubble(file: BubbleFile, outgoing: Boolean = false, viewOnce: Boolean = false) = BubbleContent(
        messageId = "m1",
        text = "",
        isOutgoing = outgoing,
        isTranslated = false,
        originalText = null,
        senderName = "Ada",
        showSenderName = false,
        isEdited = false,
        isDeleted = false,
        createdAtIso = "2026-10-29T10:00:00Z",
        files = listOf(file),
        isViewOnce = viewOnce,
    )

    private val request = FileViewerRequest("a.pdf", "application/pdf", "content://dl/1", attachmentId = "f1")
    private fun file(protected: Boolean = false) = BubbleFile(attachmentId = "f1", name = "a.pdf", sizeBytes = 2048, isProtected = protected)

    @Test
    fun `un document ordinaire recu n'est ni protege ni le mien et garde son poids`() {
        val guarded = request.guardedBy(listOf(bubble(file())))
        assertThat(guarded.isProtected).isFalse()
        assertThat(guarded.isMine).isFalse()
        assertThat(guarded.sizeBytes).isEqualTo(2048)
    }

    @Test
    fun `une piece protegee ou a vue unique ne sort pas`() {
        assertThat(request.guardedBy(listOf(bubble(file(protected = true)))).isProtected).isTrue()
        assertThat(request.guardedBy(listOf(bubble(file(), viewOnce = true))).isProtected).isTrue()
    }

    @Test
    fun `mon propre envoi ne se rapporte pas`() {
        assertThat(request.guardedBy(listOf(bubble(file(), outgoing = true))).isMine).isTrue()
    }

    @Test
    fun `une piece absente du fil n'ajoute aucune restriction`() {
        assertThat(request.guardedBy(emptyList())).isEqualTo(request)
    }
}
