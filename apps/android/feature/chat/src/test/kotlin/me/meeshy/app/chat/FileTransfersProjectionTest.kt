package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.piece.PieceTransfer
import org.junit.Test

class FileTransfersProjectionTest {

    private fun download(state: FileAttachmentDownloadState, attachmentId: String = "a1") =
        FileAttachmentDownloadUiState("m1", attachmentId, "x.pdf", state, openWhenDone = true)

    @Test
    fun `un telechargement en cours designe sa piece et son avancement`() {
        val t = bubbleFileTransfersOf(download(FileAttachmentDownloadState.InProgress(30)), emptySet())
        assertThat(t.activeAttachmentId).isEqualTo("a1")
        assertThat(t.active).isEqualTo(PieceTransfer.InProgress(30))
    }

    @Test
    fun `un echec reseau ou serveur se retente depuis la rangee`() {
        val t = bubbleFileTransfersOf(download(FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.NetworkError)), emptySet())
        assertThat(t.active).isEqualTo(PieceTransfer.Failed)
    }

    @Test
    fun `un refus de protection ou un contenu expire ne se retente pas depuis la rangee, le bandeau l'explique`() {
        listOf(FileAttachmentDownloadFailure.Protected, FileAttachmentDownloadFailure.Expired, FileAttachmentDownloadFailure.NotAvailable).forEach { reason ->
            val t = bubbleFileTransfersOf(download(FileAttachmentDownloadState.Failed(reason)), emptySet())
            assertThat(t.active).isNull()
            assertThat(t.activeAttachmentId).isNull()
        }
    }

    @Test
    fun `une piece terminee n'est plus active, elle est prete`() {
        val done = FileAttachmentDownloadState.Completed("content://dl/1", "application/pdf")
        val t = bubbleFileTransfersOf(download(done), setOf("a1"))
        assertThat(t.active).isNull()
        assertThat(t.readyAttachmentIds).containsExactly("a1")
    }

    @Test
    fun `sans telechargement rien n'est actif`() {
        assertThat(bubbleFileTransfersOf(null, emptySet())).isEqualTo(me.meeshy.ui.component.bubble.BubbleFileTransfers.None)
    }
}
