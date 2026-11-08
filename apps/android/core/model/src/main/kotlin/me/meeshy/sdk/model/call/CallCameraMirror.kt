package me.meeshy.sdk.model.call

import me.meeshy.sdk.model.call.camera.CameraFacing

/** Ce que montre une image caméra : mon aperçu, le flux envoyé à l'autre, ou une capture (photo, film). */
enum class CallVideoRole { LocalPreview, Sent, Capture }

/**
 * La symétrie de l'image caméra pendant un appel, décidée en UN endroit (miroir de iOS `CallCameraMirror`, #8696).
 * La capture envoie les trames telles que le capteur les voit : le flux envoyé n'est jamais retourné, et seul
 * l'aperçu de MA caméra AVANT l'est (on se voit comme dans un miroir). Une capture montre ce que l'autre voit.
 */
object CallCameraMirror {
    fun isMirrored(facing: CameraFacing, role: CallVideoRole): Boolean =
        facing == CameraFacing.Front && role == CallVideoRole.LocalPreview

    /**
     * La caméra dont viennent les trames affichées : celle que la capture a CONFIRMÉE, sinon l'intention. Pendant
     * une bascule, l'ancienne caméra livre encore ses trames : suivre l'intention retournerait cette image un instant.
     */
    fun displayedFacing(live: CameraFacing?, intendedFront: Boolean): CameraFacing =
        live ?: if (intendedFront) CameraFacing.Front else CameraFacing.Back
}
