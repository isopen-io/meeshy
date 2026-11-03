package me.meeshy.sdk.media

import me.meeshy.sdk.model.media.TusTranscription

/**
 * Ce qu'un envoi TUS déclare en plus du fichier à la création de sa session (`Upload-Metadata`) : l'aperçu flou, la
 * transcription faite sur l'appareil, la capture dans l'app. [progressId] nomme la ligne de [UploadProgressCenter] de cet
 * envoi. Tout est facultatif : aucun appelant existant n'a à changer.
 */
public data class TusUploadExtras(
    val thumbHash: String? = null,
    val transcription: TusTranscription? = null,
    val capturedInApp: Boolean = false,
    val progressId: String? = null,
)
