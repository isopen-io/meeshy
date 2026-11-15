package me.meeshy.ui.component.chrome

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * Rampe verticale noir -> transparent du bas d'une barre haute (masque ou voile).
 * Pendant iOS : `TopBarBottomFade` (MeeshyUI/Components/TopBarBottomFade.swift).
 */
public object TopBarBottomFade {
    public const val TRANSPARENT_FRACTION: Float = 0.06f
    public const val GRADIENT_FRACTION: Float = 0.24f

    public val fadeStartLocation: Float get() = 1f - TRANSPARENT_FRACTION - GRADIENT_FRACTION
    public val fullyTransparentLocation: Float get() = 1f - TRANSPARENT_FRACTION

    public val gradient: Brush
        get() = Brush.verticalGradient(
            0f to Color.Black,
            fadeStartLocation to Color.Black,
            fullyTransparentLocation to Color.Transparent,
            1f to Color.Transparent,
        )
}
