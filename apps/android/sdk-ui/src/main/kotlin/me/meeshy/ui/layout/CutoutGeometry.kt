package me.meeshy.ui.layout

import android.os.Build
import android.view.View
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalView
import me.meeshy.sdk.model.layout.PointDp
import me.meeshy.sdk.model.layout.RectDp
import me.meeshy.sdk.model.layout.SafeZoneLaw

/**
 * Geometrie de la decoupe camera de la fenetre — pendant Android de `IslandGeometry.swift`.
 *
 * Une banniere in-app nait au centre de la decoupe du haut ([emergence]) et se pose avec 12 dp
 * d'air sous elle ([bannerTopDp]) ; sans decoupe, elle nait au centre de la marge haute. Le calcul
 * est celui de [SafeZoneLaw] ; cet objet ne fait que l'appliquer a une [MeeshyWindowInfo].
 */
public object CutoutGeometry {
    /** Ordonnee (dp, depuis le haut de la fenetre) ou se pose une banniere, au moins [minimumDp] sous la marge haute. */
    public fun bannerTopDp(window: MeeshyWindowInfo, minimumDp: Float): Float = SafeZoneLaw.bannerTop(
        cutouts = window.cutouts,
        windowWidthDp = window.widthDp,
        safeTopDp = window.safeInsets.top,
        minimumDp = minimumDp,
    )

    /** Point (dp) d'ou nait et ou revient une banniere emergente. */
    public fun emergence(window: MeeshyWindowInfo): PointDp = SafeZoneLaw.bannerEmergence(
        cutouts = window.cutouts,
        windowWidthDp = window.widthDp,
        safeTopDp = window.safeInsets.top,
    )

    /** La decoupe du haut de la fenetre, `null` sans decoupe en haut. */
    public fun topCutout(window: MeeshyWindowInfo): RectDp? =
        SafeZoneLaw.topCutout(window.cutouts, window.widthDp)
}

/**
 * Rectangles de decoupe de la fenetre, en dp. Relus quand les marges de decoupe changent (rotation,
 * redimensionnement, attachement de la vue) ; vide sous l'API 28 ou sans decoupe.
 */
@Composable
public fun rememberCutoutRects(): List<RectDp> {
    val view = LocalView.current
    val density = LocalDensity.current
    val layoutDirection = LocalLayoutDirection.current
    val cutoutInsets = WindowInsets.displayCutout
    val left = cutoutInsets.getLeft(density, layoutDirection)
    val top = cutoutInsets.getTop(density)
    val right = cutoutInsets.getRight(density, layoutDirection)
    val bottom = cutoutInsets.getBottom(density)
    return remember(view, density, left, top, right, bottom) { readCutoutRects(view, density.density) }
}

internal fun readCutoutRects(view: View, density: Float): List<RectDp> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P || density <= 0f) return emptyList()
    return runCatching<List<RectDp>> {
        val cutout = view.rootWindowInsets?.displayCutout ?: return@runCatching emptyList()
        cutout.boundingRects.map { rect ->
            RectDp(
                left = rect.left / density,
                top = rect.top / density,
                right = rect.right / density,
                bottom = rect.bottom / density,
            )
        }
    }.getOrDefault(emptyList())
}
