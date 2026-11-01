package me.meeshy.sdk.model.composer.capture

/**
 * La photo sort à l'HORIZON, comme le téléphone était tenu (miroir de `ComposerCaptureHorizonRule` iOS).
 *
 * CameraX écrit l'orientation EXIF depuis la rotation cible de la prise ; sans elle, c'est la rotation de
 * l'écran au montage — fausse dès que la rotation automatique est coupée ou que le téléphone tourne
 * viseur ouvert. La rotation cible se lit donc sur la gravité (`OrientationEventListener`), avec la table
 * de la documentation CameraX. Rend l'indice d'un quart de tour, égal aux `Surface.ROTATION_*`
 * (0, 1, 2, 3) ; `null` quand le téléphone est à plat : la dernière rotation connue reste.
 */
object CaptureTargetRotation {
    const val ROTATION_0: Int = 0
    const val ROTATION_90: Int = 1
    const val ROTATION_180: Int = 2
    const val ROTATION_270: Int = 3

    fun fromDegrees(degrees: Int): Int? {
        if (degrees < 0) return null
        return when (degrees % 360) {
            in 45 until 135 -> ROTATION_270
            in 135 until 225 -> ROTATION_180
            in 225 until 315 -> ROTATION_90
            else -> ROTATION_0
        }
    }
}
