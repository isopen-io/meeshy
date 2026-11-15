package me.meeshy.sdk.model.composer.capture

import me.meeshy.sdk.model.composer.ComposerOpening

/**
 * Le mode dans lequel le viseur s'OUVRE (miroir de `CameraCaptureMode` et de
 * `ComposerCameraMode.mode(for:)` iOS). Une porte qui promet un viseur vidéo
 * ne doit pas ouvrir un viseur photo : l'appariement est une règle, pas un défaut.
 */
enum class CameraCaptureMode {
    PHOTO,
    VIDEO,
    ;

    companion object {
        /** Seule `VIDEO_CAMERA_READY` promet la vidéo ; toute autre ouverture naît en photo. */
        fun forOpening(opening: ComposerOpening): CameraCaptureMode = when (opening) {
            ComposerOpening.VIDEO_CAMERA_READY -> VIDEO
            ComposerOpening.CAMERA_READY,
            ComposerOpening.KEYBOARD_ON_CONTENT,
            ComposerOpening.MOOD_GRID,
            ComposerOpening.RESUME,
            ComposerOpening.MEDIA_SEEDED,
            -> PHOTO
        }
    }
}
