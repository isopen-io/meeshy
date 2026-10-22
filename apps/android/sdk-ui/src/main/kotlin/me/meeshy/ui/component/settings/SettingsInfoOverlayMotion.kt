package me.meeshy.ui.component.settings

import android.content.ContentResolver
import android.provider.Settings

public object SettingsInfoOverlayMotion {
    /** Vrai seulement si les animations système ne sont pas coupées (échelle > 0). */
    public fun shouldAnimate(durationScale: Float): Boolean = durationScale > 0f

    internal fun systemScale(resolver: ContentResolver): Float =
        runCatching { Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) }
            .getOrDefault(1f)
}
