package me.meeshy.ui.component.settings

public object SettingsInfoOverlayMotion {
    /** Vrai seulement si les animations système ne sont pas coupées (échelle > 0). */
    public fun shouldAnimate(durationScale: Float): Boolean = durationScale > 0f
}
