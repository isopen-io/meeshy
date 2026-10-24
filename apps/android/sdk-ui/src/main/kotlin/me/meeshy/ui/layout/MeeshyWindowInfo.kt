package me.meeshy.ui.layout

import android.app.Activity
import android.content.res.Configuration
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.systemBars
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowMetricsCalculator
import me.meeshy.sdk.model.layout.BubbleWidthLaw
import me.meeshy.sdk.model.layout.EdgeInsetsDp
import me.meeshy.sdk.model.layout.RectDp
import me.meeshy.sdk.model.layout.SafeZoneLaw
import me.meeshy.sdk.model.layout.WindowPosture
import me.meeshy.sdk.model.layout.WindowPostureLaw
import me.meeshy.sdk.model.layout.WindowSizeClass
import me.meeshy.sdk.model.layout.WindowSizeClassLaw
import me.meeshy.sdk.model.layout.WindowWidthClass
import me.meeshy.ui.component.permission.findActivity
import kotlin.math.min

/**
 * La fenetre qui PORTE l'interface — miroir de `SceneWindowSize` / `sceneSafeAreaInsets` iOS.
 *
 * Mesuree sur la fenetre de l'activite (split-screen, freeform, pliable), jamais sur l'ecran ;
 * [safeInsets] = barres systeme union decoupe, clavier exclu ; [cutouts] = rectangles de decoupe
 * camera dans le repere de la fenetre (vide sous l'API 28 ou sans decoupe).
 */
@Immutable
public data class MeeshyWindowInfo(
    public val widthDp: Float,
    public val heightDp: Float,
    public val sizeClass: WindowSizeClass,
    public val posture: WindowPosture,
    public val safeInsets: EdgeInsetsDp,
    public val cutouts: List<RectDp>,
) {
    public val widthClass: WindowWidthClass get() = sizeClass.width

    /** La fenetre moins sa zone sure. */
    public val safeZone: RectDp get() = SafeZoneLaw.safeRect(widthDp, heightDp, safeInsets)

    public companion object {
        /** Une fenetre de [widthDp] x [heightDp] sans marge ni pli (apercus, tests). */
        public fun of(widthDp: Float, heightDp: Float): MeeshyWindowInfo = MeeshyWindowInfo(
            widthDp = widthDp,
            heightDp = heightDp,
            sizeClass = WindowSizeClassLaw.classify(widthDp, heightDp),
            posture = WindowPosture.NORMAL,
            safeInsets = EdgeInsetsDp.Zero,
            cutouts = emptyList(),
        )
    }
}

/** La fenetre courante, publiee par [ProvideMeeshyWindowInfo] ; `null` hors d'un fournisseur. */
public val LocalMeeshyWindowInfo: ProvidableCompositionLocal<MeeshyWindowInfo?> =
    compositionLocalOf { null }

/** Mesure la fenetre (taille, classe, posture, zone sure, decoupe) et la publie dans [LocalMeeshyWindowInfo]. */
@Composable
public fun ProvideMeeshyWindowInfo(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalMeeshyWindowInfo provides rememberMeeshyWindowInfo(), content = content)
}

/** La fenetre publiee, ou — hors d'un fournisseur — mesuree ici. */
@Composable
public fun currentMeeshyWindowInfo(): MeeshyWindowInfo =
    LocalMeeshyWindowInfo.current ?: rememberMeeshyWindowInfo()

/**
 * Classe de largeur de la fenetre, bon marche : lue dans [LocalMeeshyWindowInfo], sinon deduite de
 * la configuration (qui decrit deja la fenetre en multi-fenetre). Faite pour les rangees de liste,
 * qui ne doivent pas ouvrir chacune un suivi de pli.
 */
@Composable
public fun currentWindowWidthClass(): WindowWidthClass =
    LocalMeeshyWindowInfo.current?.widthClass
        ?: WindowSizeClassLaw.widthClass(LocalConfiguration.current.screenWidthDp.toFloat())

/** Mesure la fenetre de l'activite et la tient a jour (redimensionnement, rotation, pli, marges). */
@Composable
public fun rememberMeeshyWindowInfo(): MeeshyWindowInfo {
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    val density = LocalDensity.current
    val activity = remember(context) { context.findActivity() }
    val size = remember(activity, configuration, density) { measureWindowDp(activity, configuration, density) }
    val posture by produceState(WindowPosture.NORMAL, activity) {
        if (activity == null) return@produceState
        try {
            WindowInfoTracker.getOrCreate(activity).windowLayoutInfo(activity).collect { info ->
                val fold = info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull()
                value = WindowPostureLaw.resolve(
                    isHalfOpened = fold?.let { it.state == FoldingFeature.State.HALF_OPENED },
                    isHingeHorizontal = fold?.let { it.orientation == FoldingFeature.Orientation.HORIZONTAL },
                )
            }
        } catch (e: kotlin.coroutines.cancellation.CancellationException) {
            throw e
        } catch (ignored: Throwable) {
            // Pas de bibliotheque d'extensions de fenetre sur cet appareil : posture normale.
        }
    }
    val layoutDirection = configuration.layoutDirectionOrLtr()
    val safeInsets = SafeZoneLaw.insets(
        systemBars = WindowInsets.systemBars.toDp(density, layoutDirection),
        cutout = WindowInsets.displayCutout.toDp(density, layoutDirection),
    )
    val cutouts = rememberCutoutRects()
    return remember(size, posture, safeInsets, cutouts) {
        MeeshyWindowInfo(
            widthDp = size.first,
            heightDp = size.second,
            sizeClass = WindowSizeClassLaw.classify(size.first, size.second),
            posture = posture,
            safeInsets = safeInsets,
            cutouts = cutouts,
        )
    }
}

/**
 * Plafonne la largeur d'une bulle par [BubbleWidthLaw] : le conteneur est la largeur que la rangee
 * recoit (plus sa gouttiere [horizontalGutter], que la rangee a deja retiree), la fenetre
 * [windowWidthDp] quand la largeur n'est pas bornee (rangee defilant horizontalement).
 */
public fun Modifier.bubbleWidthCap(
    widthClass: WindowWidthClass,
    windowWidthDp: Float,
    horizontalGutter: Dp = 0.dp,
): Modifier = layout { measurable, constraints ->
    val containerDp = if (constraints.hasBoundedWidth) {
        constraints.maxWidth.toDp().value + horizontalGutter.value
    } else {
        windowWidthDp
    }
    val capPx = BubbleWidthLaw.maxWidthDp(containerDp, widthClass).dp.roundToPx().coerceAtLeast(0)
    val maxWidth = if (constraints.hasBoundedWidth) min(constraints.maxWidth, capPx) else capPx
    val placeable = measurable.measure(
        constraints.copy(minWidth = min(constraints.minWidth, maxWidth), maxWidth = maxWidth),
    )
    layout(placeable.width, placeable.height) { placeable.place(0, 0) }
}

/** Taille de la fenetre de l'activite en dp ; repli sur la configuration hors d'une activite. */
private fun measureWindowDp(activity: Activity?, configuration: Configuration, density: Density): Pair<Float, Float> {
    val bounds = activity?.let {
        runCatching { WindowMetricsCalculator.getOrCreate().computeCurrentWindowMetrics(it).bounds }.getOrNull()
    }
    if (bounds != null && bounds.width() > 0 && bounds.height() > 0) {
        return bounds.width() / density.density to bounds.height() / density.density
    }
    return configuration.screenWidthDp.toFloat() to configuration.screenHeightDp.toFloat()
}

private fun Configuration.layoutDirectionOrLtr(): LayoutDirection =
    if (layoutDirection == android.view.View.LAYOUT_DIRECTION_RTL) LayoutDirection.Rtl else LayoutDirection.Ltr

private fun WindowInsets.toDp(density: Density, layoutDirection: LayoutDirection): EdgeInsetsDp = EdgeInsetsDp(
    left = getLeft(density, layoutDirection) / density.density,
    top = getTop(density) / density.density,
    right = getRight(density, layoutDirection) / density.density,
    bottom = getBottom(density) / density.density,
)
