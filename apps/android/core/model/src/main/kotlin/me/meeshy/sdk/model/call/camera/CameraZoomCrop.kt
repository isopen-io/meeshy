package me.meeshy.sdk.model.call.camera

/** Le rectangle de l'image gardé pour un zoom numérique : centré, de dimensions paires (exigence des plans YUV 4:2:0). */
data class CameraCropRect(val x: Int, val y: Int, val width: Int, val height: Int) {
    val isWhole: Boolean get() = x == 0 && y == 0
}

object CameraZoomCrop {
    /** Le centre de l'image de [width] × [height] recadré d'un facteur [zoom] ≥ 1. */
    fun rect(width: Int, height: Int, zoom: Float): CameraCropRect {
        val factor = zoom.coerceAtLeast(1f)
        val w = even((width / factor).toInt()).coerceIn(2, width)
        val h = even((height / factor).toInt()).coerceIn(2, height)
        return CameraCropRect(x = even((width - w) / 2), y = even((height - h) / 2), width = w, height = h)
    }

    private fun even(value: Int): Int = value and 1.inv()
}
