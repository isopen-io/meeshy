package me.meeshy.sdk.model.call.montage

import kotlin.math.max
import kotlin.math.min
import me.meeshy.sdk.model.call.frames.CallFrameRect

/** Le carré d'un visage pour une case de montage — portage de `CallFaceCrop` (`CallMontageLayout.swift`). */
public object CallFaceCrop {

    /** Une boîte normalisée (0…1, origine en BAS à gauche, comme la détection de visages) en pixels, origine en HAUT. */
    public fun pixelRect(box: CallFrameRect, imageSize: CallMontageCanvas): CallFrameRect = CallFrameRect(
        box.minX * imageSize.width,
        (1 - box.maxY) * imageSize.height,
        box.width * imageSize.width,
        box.height * imageSize.height,
    )

    /** Le carré autour du [face] (marge de [margin] par côté), légèrement remonté, gardé dans l'image ; sans visage, le plus grand carré centré. */
    public fun square(face: CallFrameRect?, imageSize: CallMontageCanvas, margin: Double): CallFrameRect {
        val maxSide = min(imageSize.width, imageSize.height)
        if (maxSide <= 0) return CallFrameRect(0.0, 0.0, 0.0, 0.0)
        if (face == null || face.width <= 0 || face.height <= 0) {
            return CallFrameRect((imageSize.width - maxSide) / 2, (imageSize.height - maxSide) / 2, maxSide, maxSide)
        }
        val side = min(max(face.width, face.height) * (1 + margin * 2), maxSide)
        val centerX = face.midX
        val centerY = face.midY - face.height * 0.08
        val x = min(max(centerX - side / 2, 0.0), imageSize.width - side)
        val y = min(max(centerY - side / 2, 0.0), imageSize.height - side)
        return CallFrameRect(x, y, side, side)
    }
}
