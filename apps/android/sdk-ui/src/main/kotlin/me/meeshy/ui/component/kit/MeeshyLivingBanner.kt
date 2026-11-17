package me.meeshy.ui.component.kit

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme

private const val TAU = 2.0 * PI
private const val BOTTOM_SLOT_INSET_DP = 76
private const val SLOT_INSET_DP = 16
private const val IMAGE_DESATURATED_ALPHA = 0.6f

/**
 * **La bannière vivante** (K27) : un dégradé tiré d'une seule teinte, deux orbes qui flottent, une parallaxe à l'inclinaison, un
 * fondu vers le fond de l'écran et trois emplacements (haut début, haut fin, bas). Un décor, jamais un écran.
 *
 * Agnostique : une teinte, une image DÉJÀ chargée, des emplacements ; elle ne sait ni réglages, ni niveau, ni rang, ne charge
 * rien et ne demande aucune permission. L'inclinaison ([tiltDegrees]) est lue par l'hôte, qui n'allume son capteur que si
 * `MeeshyLivingBannerRecipe.shouldRunSensor` le permet. Dégradé, orbes et fondu se taisent pour TalkBack ; seuls les emplacements
 * parlent. Le flottement se lit au dessin : rien ne se recompose. Jumeau iOS : `MeeshyLivingBanner`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyLivingBanner(
    tint: Color,
    modifier: Modifier = Modifier,
    mode: MeeshyLivingBannerMode = MeeshyLivingBannerMode.Banner,
    image: ImageBitmap? = null,
    height: Dp = MeeshyLivingBannerRecipe.HEIGHT_HERO.dp,
    motion: MeeshyLivingBannerMotion = MeeshyLivingBannerMotion.On,
    isMuted: Boolean = false,
    isVisible: Boolean = true,
    collapse: Float = 0f,
    tiltDegrees: Float = 0f,
    topLeading: (@Composable BoxScope.() -> Unit)? = null,
    topTrailing: (@Composable BoxScope.() -> Unit)? = null,
    bottom: (@Composable BoxScope.() -> Unit)? = null,
) {
    val isDark = MeeshyTheme.isDark
    val screen = MeeshyTheme.tokens.backgroundPrimary
    val systemReduce = LocalReduceMotion.current
    val values = remember(mode, isDark, image != null, isMuted, motion, height, collapse, isVisible, systemReduce) {
        MeeshyLivingBannerRecipe.resolve(mode, isDark, image != null, isMuted, motion, height.value.toDouble(), collapse.toDouble(), isVisible, systemReduce)
    }
    val base = if (isMuted) MeeshyKitColor.desaturated(tint) else tint
    val far = remember(base) { MeeshyKitColor.hueShifted(base, values.far.hueShift) }
    val shift = MeeshyLivingBannerRecipe.parallax(tiltDegrees.toDouble())
    val phase: State<Float>? = if (values.floats) {
        rememberInfiniteTransition(label = "living-banner").animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween((MeeshyLivingBannerRecipe.FLOAT_PERIOD_SECONDS * 1000).toInt(), easing = LinearEasing), RepeatMode.Restart),
            label = "float",
        )
    } else {
        null
    }
    Box(
        modifier
            .fillMaxWidth()
            .height(values.height.dp)
            .clipToBounds()
            .drawBehind {
                drawGradient(base, screen, values)
                drawOrb(base, values.near, Offset(size.width * 0.78f, size.height * 0.30f), shift.near, phase?.value ?: 0f, 0f)
                if (values.far.diameter > 0.0) {
                    drawOrb(far, values.far, Offset(size.width * 0.18f, size.height * 0.62f), shift.far, phase?.value ?: 0f, 0.5f)
                }
            },
    ) {
        if (image != null) {
            Image(
                bitmap = image,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                alpha = if (isMuted) IMAGE_DESATURATED_ALPHA else 1f,
                modifier = Modifier.fillMaxSize().clearAndSetSemantics { },
            )
            Box(Modifier.fillMaxSize().drawBehind { drawRect(screen.copy(alpha = values.imageVeil.toFloat())) })
        }
        if (values.showsFade && values.fadeOpacity > 0.0) {
            Box(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(values.fadeHeight.dp)
                    .drawBehind {
                        drawRect(Brush.verticalGradient(listOf(Color.Transparent, screen.copy(alpha = values.fadeOpacity.toFloat()))))
                    },
            )
        }
        if (topLeading != null) Box(Modifier.align(Alignment.TopStart).padding(SLOT_INSET_DP.dp), content = topLeading)
        if (topTrailing != null) Box(Modifier.align(Alignment.TopEnd).padding(SLOT_INSET_DP.dp), content = topTrailing)
        if (bottom != null) Box(Modifier.align(Alignment.BottomStart).padding(start = SLOT_INSET_DP.dp, end = SLOT_INSET_DP.dp, bottom = if (values.showsFade) BOTTOM_SLOT_INSET_DP.dp else SLOT_INSET_DP.dp), content = bottom)
    }
}

private fun DrawScope.drawGradient(base: Color, screen: Color, values: MeeshyLivingBannerValues) {
    val angle = MeeshyLivingBannerRecipe.GRADIENT_ANGLE * PI / 180.0
    val reach = size.height.toFloat()
    val dx = (sin(angle) * reach).toFloat()
    val dy = (-cos(angle) * reach).toFloat()
    val stops = values.stopShares.map { share -> MeeshyKitColor.mixed(screen, base, share.toFloat()) }
    drawRect(Brush.linearGradient(stops, start = Offset(size.width / 2 - dx / 2, size.height / 2 - dy / 2), end = Offset(size.width / 2 + dx / 2, size.height / 2 + dy / 2)))
}

private fun DrawScope.drawOrb(color: Color, orb: MeeshyLivingBannerOrb, anchor: Offset, parallax: Double, phase: Float, offset: Float) {
    val turn = (phase + offset).toDouble() * TAU
    val drift = Offset(
        (sin(turn) * MeeshyLivingBannerRecipe.FLOAT_DRIFT_X).toFloat() * density,
        (cos(turn) * MeeshyLivingBannerRecipe.FLOAT_DRIFT_Y).toFloat() * density,
    )
    val scale = 1f + ((MeeshyLivingBannerRecipe.FLOAT_SCALE - 1.0) * (0.5 + 0.5 * sin(turn))).toFloat()
    val center = anchor + drift + Offset(parallax.toFloat() * density, 0f)
    val radius = (orb.diameter / 2).toFloat() * density * scale
    drawCircle(
        brush = Brush.radialGradient(listOf(color.copy(alpha = orb.opacity.toFloat()), Color.Transparent), center = center, radius = radius),
        radius = radius,
        center = center,
    )
}
