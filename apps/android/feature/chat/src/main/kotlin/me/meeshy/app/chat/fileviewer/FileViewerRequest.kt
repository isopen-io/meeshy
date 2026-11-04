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
    /** Contenu à vue unique, flouté, éphémère ou retenu par la loi de sortie : ni enregistrer, ni partager, ni copier. */
    val isProtected: Boolean = false,
    /** Le document est le SIEN : son ouverture ne se rapporte pas. */
    val isMine: Boolean = false,
    /** Le poids annoncé par le fil, dit sur la fiche d'un document sans aperçu. */
    val sizeBytes: Int? = null,
) {
    val kind: FileViewerKind get() = FileViewerKind.of(mimeType, fileName)
}
