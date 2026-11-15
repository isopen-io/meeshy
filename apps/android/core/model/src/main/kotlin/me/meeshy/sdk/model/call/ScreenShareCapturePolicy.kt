package me.meeshy.sdk.model.call

/**
 * Ce que le partage d'écran change à la scène du duo (#15636), miroir de iOS `CallStage` : l'écran d'un pair
 * se LIT en entier, donc il s'ajuste (bandes) au lieu de se remplir (rogné) ; la caméra locale ne revient
 * qu'à ceux qui la voulaient ET qui l'émettaient avant le partage.
 */
object ScreenShareCapturePolicy {

    /** L'image du pair s'ajuste quand la fenêtre se redimensionne, et toujours quand il partage son écran. */
    fun remoteFits(peerScreenSharing: Boolean, resizableWindow: Boolean): Boolean = peerScreenSharing || resizableWindow

    /** La caméra revient à l'arrêt du partage seulement si l'utilisateur la voulait et qu'elle émettait. */
    fun restoresCamera(cameraWanted: Boolean, wasEmitting: Boolean): Boolean = cameraWanted && wasEmitting
}
