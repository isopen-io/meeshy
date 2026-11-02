package me.meeshy.sdk.model.call.frames

import kotlin.math.max

/** Comment une toile peinte remplit l'écran : agrandie de [scale], puis décalée de ([offsetX], [offsetY]), centrée. */
public data class CallLiveFrameFit(val scale: Double, val offsetX: Double, val offsetY: Double) {
    public fun x(value: Double): Double = value * scale + offsetX

    public fun y(value: Double): Double = value * scale + offsetY

    public fun rect(value: CallFrameRect): CallFrameRect =
        CallFrameRect(x(value.x), y(value.y), value.width * scale, value.height * scale)

    public companion object {
        public val IDENTITY: CallLiveFrameFit = CallLiveFrameFit(1.0, 0.0, 0.0)
    }
}

/**
 * Où se pose la vidéo d'une personne, dans le repère de l'ÉCRAN : le rectangle du visage ([photo], la case ou
 * l'intérieur de sa carte), tourné de [rotation] degrés (sens horaire) autour du centre de la CASE — que
 * [pivotX] et [pivotY] situent en fraction du visage, la carte pouvant porter un pied qui décentre le visage.
 */
public data class CallLiveFrameSlotPlacement(
    val personIndex: Int,
    val photo: CallFrameRect,
    val rotation: Double,
    val pivotX: Double,
    val pivotY: Double,
)

/**
 * **LA GÉOMÉTRIE DU CADRE EN DIRECT** (#13687, miroir de iOS `CallLiveFrameGeometry`) : la toile peinte remplit
 * l'écran sans déformation, et chaque vidéo se pose dans le visage de sa case, à l'endroit exact où le peintre
 * dessinerait le portrait (même rectangle, même rotation, même pivot). Repère : haut-gauche, y vers le bas.
 */
public object CallLiveFrameGeometry {

    /** La toile [sceneWidth] × [sceneHeight] remplit [viewWidth] × [viewHeight] (même proportion, débordement centré). */
    public fun fit(sceneWidth: Double, sceneHeight: Double, viewWidth: Double, viewHeight: Double): CallLiveFrameFit {
        if (sceneWidth <= 0 || sceneHeight <= 0) return CallLiveFrameFit.IDENTITY
        val scale = max(viewWidth / sceneWidth, viewHeight / sceneHeight)
        return CallLiveFrameFit(scale, (viewWidth - sceneWidth * scale) / 2, (viewHeight - sceneHeight * scale) / 2)
    }

    /** Les cases où une vidéo se pose, portées à l'écran par [fit] ; une case sans surface n'en reçoit aucune. */
    public fun placements(boxes: List<CallFrameSlotBox>, card: CallFrameCard?, fit: CallLiveFrameFit): List<CallLiveFrameSlotPlacement> =
        boxes.mapNotNull { box ->
            val photo = CallFrameRenderKit.photoRect(box.rect, card)
            if (photo.width <= 0 || photo.height <= 0) return@mapNotNull null
            CallLiveFrameSlotPlacement(
                personIndex = box.index,
                photo = fit.rect(photo),
                rotation = box.rotation,
                pivotX = (box.rect.midX - photo.x) / photo.width,
                pivotY = (box.rect.midY - photo.y) / photo.height,
            )
        }
}
