package me.meeshy.app.chat.fileviewer

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.contacts.ContactCardResolutionScope
import me.meeshy.sdk.model.fileviewer.FileViewerKind

/** Un fichier du fil, téléchargé, que l'application ouvre elle-même. */
@Immutable
internal data class FileViewerRequest(
    val fileName: String,
    val mimeType: String,
    val localUri: String,
    /** La pièce ouverte, pour que l'hôte du fil lui donne sa portée de résolution. */
    val attachmentId: String = "",
    /** Où une carte de visite a le droit de résoudre ses identifiants ; FERMÉE par défaut (#13633). */
    val contactScope: ContactCardResolutionScope = ContactCardResolutionScope.Unknown,
) {
    val kind: FileViewerKind get() = FileViewerKind.of(mimeType, fileName)
}
