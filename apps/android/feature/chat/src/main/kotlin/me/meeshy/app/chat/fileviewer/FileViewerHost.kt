package me.meeshy.app.chat.fileviewer

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.fileviewer.FileViewerKind

/** Aiguille un fichier téléchargé du fil vers sa visionneuse (miroir de l'aiguillage de `BubbleAttachmentView`, iOS). */
@Composable
internal fun FileViewerHost(request: FileViewerRequest?, accent: Color, onDismiss: () -> Unit) {
    if (request == null) return
    when (val kind = request.kind) {
        FileViewerKind.ContactCard -> ContactCardSheet(request, accent, onDismiss)
        is FileViewerKind.Code -> CodeViewerSheet(request, kind.language, accent, onDismiss)
        FileViewerKind.Pdf -> DocumentViewerSheet(request, isPdf = true, accent = accent, onDismiss = onDismiss)
        FileViewerKind.Document -> DocumentViewerSheet(request, isPdf = false, accent = accent, onDismiss = onDismiss)
    }
}
