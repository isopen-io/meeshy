package me.meeshy.sdk.model.composer

/** La famille de sélecteur qu'un outil d'attache ouvre (miroir d'iOS `ComposerMediaIntake`). */
enum class ComposerDocumentIntake { PHOTO_LIBRARY, CAMERA_PHOTO, CAMERA_VIDEO, FILES }

/**
 * Ce qu'un outil du document FAIT (miroir d'iOS `ComposerDocumentToolEffect`) : un outil sans effet n'est pas grisé,
 * il est absent de la rangée servie. L'hôte s'aiguille sur l'EFFET, jamais sur l'outil qui l'a déclenché.
 */
sealed interface ComposerDocumentToolEffect {
    data object InsertsEmojiIntoText : ComposerDocumentToolEffect
    data object OpensReferencePicker : ComposerDocumentToolEffect
    data class AttachesLocalMedia(val intake: ComposerDocumentIntake) : ComposerDocumentToolEffect
    data object AttachesLocation : ComposerDocumentToolEffect
    data object AttachesTranscribedAudio : ComposerDocumentToolEffect
    data object ComposesTextScene : ComposerDocumentToolEffect
}
