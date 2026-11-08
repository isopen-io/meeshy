package me.meeshy.app.chat.fileviewer

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberUpdatedState
import me.meeshy.sdk.model.fileviewer.DocumentOpenReport
import me.meeshy.sdk.model.media.AttachmentStatusBody
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.fileviewer.FileViewerKind

/** Aiguille un fichier téléchargé du fil vers sa visionneuse (miroir de l'aiguillage de `BubbleAttachmentView`, iOS). */
@Composable
internal fun FileViewerHost(
    request: FileViewerRequest?,
    accent: Color,
    onOpenConversation: (conversationId: String) -> Unit = {},
    onOpened: (attachmentId: String, body: AttachmentStatusBody) -> Unit = { _, _ -> },
    onDismiss: () -> Unit,
) {
    if (request == null) return
    ReportOpening(request, onOpened)
    when (val kind = request.kind) {
        FileViewerKind.ContactCard -> ContactCardHost(request, accent, onOpenConversation, onDismiss)
        is FileViewerKind.Code -> CodeViewerSheet(request, kind.language, accent, onDismiss)
        is FileViewerKind.Text -> TextDocumentSheet(request, kind.isMarkdown, accent, onDismiss)
        FileViewerKind.Pdf -> DocumentViewerSheet(request, isPdf = true, accent = accent, onDismiss = onDismiss)
        FileViewerKind.Document -> DocumentViewerSheet(request, isPdf = false, accent = accent, onDismiss = onDismiss)
    }
}

/**
 * La présentation de la fiche déclare une OUVERTURE (« vu », jamais « téléchargé » : l'enregistrement a son propre
 * rapport), sauf pour son propre document. La sortie est inerte par défaut ; une seule déclaration par pièce présentée.
 */
@Composable
private fun ReportOpening(request: FileViewerRequest, onOpened: (String, AttachmentStatusBody) -> Unit) {
    val sink = rememberUpdatedState(onOpened)
    LaunchedEffect(request.attachmentId, request.localUri) {
        if (request.attachmentId.isEmpty()) return@LaunchedEffect
        DocumentOpenReport.bodyForOpening(request.isMine)?.let { sink.value(request.attachmentId, it) }
    }
}
