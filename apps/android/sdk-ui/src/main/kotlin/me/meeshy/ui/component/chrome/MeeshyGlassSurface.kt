package me.meeshy.ui.component.chrome

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlurEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.toIntSize
import me.meeshy.sdk.model.chrome.GlassRendering
import me.meeshy.sdk.model.chrome.resolveGlassRendering
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La surface « verre » : remplissage indigo translucide (60 % sombre / 72 % clair), bordure
 * degradee 1 dp, ombre noire 20 % (rayon 10, y 5) et, des l'API 31, flou du fond enregistre par
 * [MeeshyBackground]. Avant l'API 31, ou en transparence reduite, surface opaque teintee.
 * Pendant iOS : `glassCard` / `adaptiveLiquidGlass`.
 *
 * @param tint teinte optionnelle (accent de conversation, passe en parametre par l'appelant).
 * @param liquid ajoute le reflet et le liseré clair de la recette liquid glass.
 */
@Composable
fun MeeshyGlassSurface(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(MeeshyRadius.xl),
    tint: Color? = null,
    liquid: Boolean = false,
    content: @Composable BoxScope.() -> Unit,
) {
    val dark = MeeshyTheme.isDark
    val backdrop = LocalGlassBackdrop.current
    val rendering = resolveGlassRendering(
        sdkInt = Build.VERSION.SDK_INT,
        reduceTransparency = rememberReduceTransparency(),
        hasBackdrop = backdrop != null,
    )
    val base = MeeshyTheme.tokens.backgroundSecondary
    val fill = when (rendering) {
        GlassRendering.Opaque -> base
        else -> base.copy(alpha = if (dark) GlassSurfaceValues.FILL_ALPHA_DARK else GlassSurfaceValues.FILL_ALPHA_LIGHT)
    }
    val wash = tint ?: if (rendering == GlassRendering.Opaque) MeeshyPalette.Indigo500 else null
    var position by remember { mutableStateOf<Offset?>(null) }
    val blurLayer = rememberGraphicsLayer()

    Box(
        modifier
            .shadow(
                elevation = GlassSurfaceValues.SHADOW_RADIUS_DP.dp,
                shape = shape,
                clip = false,
                ambientColor = Color.Black.copy(alpha = GlassSurfaceValues.SHADOW_ALPHA),
                spotColor = Color.Black.copy(alpha = GlassSurfaceValues.SHADOW_ALPHA),
            )
            .clip(shape)
            .onGloballyPositioned { position = it.positionInWindow() }
            .drawWithContent {
                val origin = backdrop?.origin
                val at = position
                if (rendering == GlassRendering.Blurred && backdrop != null && origin != null && at != null &&
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                ) {
                    val radius = GlassSurfaceValues.BLUR_RADIUS_DP.dp.toPx()
                    blurLayer.renderEffect = BlurEffect(radius, radius, TileMode.Clamp)
                    blurLayer.record(this, layoutDirection, size.toIntSize()) {
                        translate(left = origin.x - at.x, top = origin.y - at.y) { drawLayer(backdrop.layer) }
                    }
                    drawLayer(blurLayer)
                }
                drawContent()
            }
            .background(fill)
            .then(
                if (wash != null) {
                    val alpha = if (rendering == GlassRendering.Opaque) {
                        GlassSurfaceValues.OPAQUE_TINT_ALPHA
                    } else {
                        LiquidGlassRecipe.resolve(dark, true).tintWash
                    }
                    Modifier.background(wash.copy(alpha = alpha))
                } else {
                    Modifier
                },
            )
            .then(if (liquid) Modifier.background(MeeshyGradients.liquidGlassSheen(dark)) else Modifier)
            .border(
                1.dp,
                if (liquid) MeeshyGradients.liquidGlassRim(dark, tint != null) else MeeshyGradients.glassBorder(dark),
                shape,
            ),
        content = content,
    )
}
