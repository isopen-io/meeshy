package me.meeshy.app.chat.fileviewer

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.fileviewer.FileViewerKind

/** Un fichier du fil, téléchargé, que l'application ouvre elle-même. */
@Immutable
internal data class FileViewerRequest(
    val fileName: String,
    val mimeType: String,
    val localUri: String,
) {
    val kind: FileViewerKind get() = FileViewerKind.of(mimeType, fileName)
}
