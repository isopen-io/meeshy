package me.meeshy.sdk.model.composer.capture

/**
 * La garde de préparation du viseur (miroir de `CameraRecordingReadiness` iOS).
 *
 * Déclencher une prise avant que les use cases soient liés et actifs ne rend pas une
 * erreur propre : sur CameraX, `takePicture` / `Recording.start` sur un use case non lié
 * lève `IllegalStateException`, ce qui tue l'écran. Seule la prévention est possible,
 * et elle s'écrit devant l'appel. La règle est pure pour s'éprouver sans caméra.
 */
object CameraRecordingReadiness {

    fun mayStartRecording(
        sessionIsRunning: Boolean,
        hasVideoUseCase: Boolean,
        useCaseIsActive: Boolean,
        useCaseIsEnabled: Boolean,
    ): Boolean = sessionIsRunning && hasVideoUseCase && useCaseIsActive && useCaseIsEnabled

    /** Le déclencheur photo obéit à la même règle (second site, même prévention). */
    fun mayCapturePhoto(
        sessionIsRunning: Boolean,
        hasPhotoUseCase: Boolean,
        useCaseIsActive: Boolean,
        useCaseIsEnabled: Boolean,
    ): Boolean = mayStartRecording(sessionIsRunning, hasPhotoUseCase, useCaseIsActive, useCaseIsEnabled)
}
