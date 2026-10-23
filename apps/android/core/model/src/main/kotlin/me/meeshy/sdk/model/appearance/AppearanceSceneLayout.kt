package me.meeshy.sdk.model.appearance

import kotlin.math.min

/** L'emplacement d'une illustration dans sa boîte : échelle uniforme et coin haut-gauche. */
data class SceneFrame(val scale: Double, val originX: Double, val originY: Double)

object AppearanceSceneLayout {

    /**
     * `bottom` centré en bas, `center` centré, `bottom-end` au bord de FIN (miroir en RTL) — MIROIR de
     * `AppearanceDesignView.origin`.
     */
    fun frame(scene: AppearanceDesignScene, width: Double, height: Double, isRtl: Boolean): SceneFrame {
        val scale = min(width / scene.width, height / scene.height)
        val drawnW = scene.width * scale
        val drawnH = scene.height * scale
        val (x, y) = when (scene.anchor) {
            AppearanceSceneAnchor.BOTTOM -> (width - drawnW) / 2 to height - drawnH
            AppearanceSceneAnchor.CENTER -> (width - drawnW) / 2 to (height - drawnH) / 2
            AppearanceSceneAnchor.BOTTOM_END -> (if (isRtl) 0.0 else width - drawnW) to height - drawnH
        }
        return SceneFrame(scale, x, y)
    }
}
