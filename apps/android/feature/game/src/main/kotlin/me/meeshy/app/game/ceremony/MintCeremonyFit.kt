package me.meeshy.app.game.ceremony

import me.meeshy.sdk.model.game.ceremony.MintCeremonyStage as Stage

/** La scène de 360 × 640 portée dans l'écran sans déformation (miroir de `MintCeremonyFit`). */
internal class MintCeremonyFit(val width: Float, val height: Float) {
    val k: Float = (minOf(width / Stage.WIDTH.toFloat(), height / Stage.HEIGHT.toFloat())).takeIf { it > 0 } ?: 1f
    val offX: Float = (width - Stage.WIDTH.toFloat() * k) / 2
    val offY: Float = (height - Stage.HEIGHT.toFloat() * k) / 2
}
