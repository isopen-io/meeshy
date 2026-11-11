package me.meeshy.ui.component.kit

import android.os.Build
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.HoverInteraction
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.State
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlurEffect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.toIntSize
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.chrome.GlassRendering
import me.meeshy.sdk.model.chrome.resolveGlassRendering
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.chrome.LocalGlassBackdrop
import me.meeshy.ui.component.chrome.rememberReduceTransparency
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le ton posé par l'hôte : toutes les surfaces dessous qui n'en déclarent pas le prennent. Défaut [MeeshyGlassTone.Deep].
 * `compositionLocalOf` et non `static` : seuls les lecteurs du ton se recomposent quand il change.
 */
public val LocalMeeshyGlassTone: ProvidableCompositionLocal<MeeshyGlassTone> = compositionLocalOf { MeeshyGlassTone.Deep }

/** Posé par un verre sur son contenu : jamais de verre sur du verre. */
internal val LocalMeeshyGlassNested: ProvidableCompositionLocal<Boolean> = compositionLocalOf { false }

/** Pose le ton de l'hôte pour tout [content]. Pendant iOS : `.meeshyGlassTone(_:)`. */
@Composable
public fun ProvideMeeshyGlassTone(tone: MeeshyGlassTone, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalMeeshyGlassTone provides tone, content = content)
}

/**
 * L'UNIQUE entrée de verre du kit : elle choisit la matière selon l'appareil (verre dessiné, ou fond plein sous « réduire
 * la transparence »), le ton selon l'hôte, et elle répond au toucher. Android n'a pas de Liquid Glass du système.
 *
 * Atome opaque, par pureté du SDK : l'appelant passe une forme et une teinte. La surface ne pose ni action, ni nom
 * accessible, ni retour haptique (ils appartiennent au contrôle), et n'ajoute aucun nœud de sémantique.
 *
 * La surface se touche si elle reçoit la [interactionSource] de son contrôle (appui, survol au pointeur) ou un état
 * [pressed] figé (le catalogue). Elle grandit alors à 1,04 et son reflet double, puis revient par un ressort ; l'échelle est
 * coupée sous « réduire les animations ». Tout se joue en phase de dessin : le contenu ne se recompose jamais à l'appui.
 */
@Composable
public fun MeeshyGlass(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(MeeshyRadius.xl),
    tone: MeeshyGlassTone = LocalMeeshyGlassTone.current,
    density: MeeshyGlassDensity = MeeshyGlassDensity.Regular,
    tint: Color? = null,
    interactionSource: InteractionSource? = null,
    pressed: Boolean? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    val isDark = MeeshyTheme.isDark
    val isNested = LocalMeeshyGlassNested.current
    val backdrop = LocalGlassBackdrop.current
    val reduceTransparency = rememberReduceTransparency()
    val reduceMotion = LocalReduceMotion.current
    val rendering = resolveGlassRendering(
        sdkInt = Build.VERSION.SDK_INT,
        reduceTransparency = reduceTransparency,
        hasBackdrop = backdrop != null,
    )
    val glass = MeeshyGlassMaterial.resolve(tone = tone, rendering = rendering, reduceTransparency = reduceTransparency)
    val isInteractive = interactionSource != null || pressed != null
    val isTinted = tint != null
    val rest = remember(tone, density, isTinted, glass, isDark, isNested) {
        MeeshyGlassRecipe.resolve(
            tone = tone, density = density, isTinted = isTinted, isInteractive = false, isPressed = false,
            material = glass, reduceMotion = reduceMotion, isDark = isDark, isNested = isNested,
        )
    }
    val full = remember(tone, density, isTinted, glass, isDark, isNested, reduceMotion) {
        MeeshyGlassRecipe.resolve(
            tone = tone, density = density, isTinted = isTinted, isInteractive = true, isPressed = true,
            material = glass, reduceMotion = reduceMotion, isDark = isDark, isNested = isNested,
        )
    }
    val response = if (isInteractive) rememberGlassResponse(interactionSource, pressed, reduceMotion) else IdleResponse
    val fill = rememberGlassFill(
        target = rest.fillColor(MeeshyTheme.tokens.backgroundSecondary),
        animated = tone != MeeshyGlassTone.Theme,
        reduceMotion = reduceMotion,
    )
    val blurs = rest.blursBackdrop && rendering == GlassRendering.Blurred && backdrop != null &&
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    val blurLayer = if (blurs) rememberGraphicsLayer() else null
    var position by remember { mutableStateOf<Offset?>(null) }
    val wash = tint ?: if (tone == MeeshyGlassTone.Theme && glass == MeeshyGlassMaterial.Opaque) MeeshyPalette.Indigo500 else null
    val rim = remember(rest) { rest.rimBrush() }
    val sheens = remember(rest.sheen, full.sheen) { GlowBrushes(rest.sheen, full.sheen) }
    val topLights = remember(rest.topLight, full.topLight) { GlowBrushes(rest.topLight, full.topLight) }

    Box(
        modifier
            .then(if (isInteractive) Modifier.graphicsLayer { scaleBy(rest, full, response.value) } else Modifier)
            .then(
                if (rest.shadowOpacity > 0f) {
                    val shadowColor = MeeshyMediaChromeColors.MediaBackdrop.copy(alpha = rest.shadowOpacity)
                    Modifier.shadow(
                        elevation = rest.shadowRadiusDp.dp,
                        shape = shape,
                        clip = false,
                        ambientColor = shadowColor,
                        spotColor = shadowColor,
                    )
                } else {
                    Modifier
                },
            )
            .clip(shape)
            .then(if (blurs) Modifier.onGloballyPositioned { position = it.positionInWindow() } else Modifier)
            .drawWithCache {
                val outline = if (topLights.reaches) shape.createOutline(size, layoutDirection, this) else null
                val hairline = Stroke(width = 1.dp.toPx())
                if (blurLayer != null) {
                    val radius = rest.blurRadiusDp.dp.toPx()
                    blurLayer.renderEffect = BlurEffect(radius, radius, TileMode.Clamp)
                }
                onDrawWithContent {
                    val at = position
                    if (blurLayer != null && backdrop != null && at != null) {
                        val origin = backdrop.origin
                        blurLayer.record(this, layoutDirection, size.toIntSize()) {
                            translate(left = origin.x - at.x, top = origin.y - at.y) { drawLayer(backdrop.layer) }
                        }
                        drawLayer(blurLayer)
                    }
                    val glow = response.value
                    val filled = fill.value
                    if (filled.alpha > 0f) drawRect(filled)
                    if (wash != null && rest.tintWash > 0f) drawRect(wash.copy(alpha = rest.tintWash))
                    sheens.brush(glow)?.let { drawRect(brush = it, alpha = sheens.alpha(glow)) }
                    drawContent()
                    val topLight = topLights.brush(glow)
                    if (outline != null && topLight != null) strokeOutline(outline, topLight, topLights.alpha(glow), hairline)
                }
            }
            .then(if (rim != null) Modifier.border(1.dp, rim, shape) else Modifier),
    ) {
        CompositionLocalProvider(LocalMeeshyGlassNested provides true) { content() }
    }
}

private const val REST_RESPONSE = 0f
private const val HOVER_RESPONSE = 0.5f
private const val PRESS_RESPONSE = 1f

/** La réponse d'une surface qui ne se touche pas : toujours au repos, sans état ni coroutine. */
private val IdleResponse: State<Float> = object : State<Float> {
    override val value: Float = REST_RESPONSE
}

/**
 * UNE valeur animée, du repos (0) à l'appui (1) ; le survol est à mi-chemin : le reflet de la recette survolée est la
 * moyenne de celles du repos et de l'appui. [pressed] fige l'état (catalogue) et l'emporte sur la source.
 */
@Composable
private fun rememberGlassResponse(
    interactionSource: InteractionSource?,
    pressed: Boolean?,
    reduceMotion: Boolean,
): State<Float> {
    val response = remember { Animatable(if (pressed == true) PRESS_RESPONSE else REST_RESPONSE) }
    val spec: AnimationSpec<Float> = if (reduceMotion) snap() else MeeshyMotion.springFast()
    if (pressed != null) {
        LaunchedEffect(pressed, reduceMotion) { response.animateTo(if (pressed) PRESS_RESPONSE else REST_RESPONSE, spec) }
    } else if (interactionSource != null) {
        LaunchedEffect(interactionSource, reduceMotion) {
            var isPressed = false
            var isHovered = false
            interactionSource.interactions.collect { interaction ->
                when (interaction) {
                    is PressInteraction.Press -> isPressed = true
                    is PressInteraction.Release, is PressInteraction.Cancel -> isPressed = false
                    is HoverInteraction.Enter -> isHovered = true
                    is HoverInteraction.Exit -> isHovered = false
                }
                val target = if (isPressed) PRESS_RESPONSE else if (isHovered) HOVER_RESPONSE else REST_RESPONSE
                launch(start = CoroutineStart.UNDISPATCHED) { response.animateTo(target, spec) }
            }
        }
    }
    return response.asState()
}

/** Le fondu du remplissage quand le ton change ; un ton fixe (`Theme`) n'ouvre aucune animation. */
@Composable
private fun rememberGlassFill(target: Color, animated: Boolean, reduceMotion: Boolean): State<Color> {
    if (!animated) return rememberUpdatedState(target)
    val spec: AnimationSpec<Color> = if (reduceMotion) snap() else tween(durationMillis = MeeshyGlassRecipe.TONE_FADE_MILLIS)
    return animateColorAsState(targetValue = target, animationSpec = spec, label = "meeshyGlassFill")
}

/** L'échelle ne répond qu'à l'appui : à mi-chemin (survol) elle reste à 1. */
private fun androidx.compose.ui.graphics.GraphicsLayerScope.scaleBy(rest: MeeshyGlassRecipe, full: MeeshyGlassRecipe, response: Float) {
    val pressedShare = ((response - HOVER_RESPONSE) / (PRESS_RESPONSE - HOVER_RESPONSE)).coerceAtLeast(0f)
    val scale = rest.scale + (full.scale - rest.scale) * pressedShare
    scaleX = scale
    scaleY = scale
}

private fun MeeshyGlassRecipe.fillColor(system: Color): Color = when (fill) {
    MeeshyGlassFill.Clear -> Color.Transparent
    MeeshyGlassFill.Light -> MeeshyMediaChromeColors.OnMedia.copy(alpha = fillOpacity)
    MeeshyGlassFill.Dark -> MeeshyMediaChromeColors.MediaBackdrop.copy(alpha = fillOpacity)
    MeeshyGlassFill.System -> system.copy(alpha = fillOpacity)
}

/** Le reflet qui descend du bord haut : plein en haut, éteint au milieu. */
private fun sheenBrush(alpha: Float): Brush = Brush.verticalGradient(
    0f to MeeshyMediaChromeColors.OnMedia.copy(alpha = alpha),
    0.5f to MeeshyMediaChromeColors.OnMedia.copy(alpha = 0f),
)

/**
 * Un reflet du repos à l'appui sans pinceau neuf par image : le dégradé est linéaire en opacité, donc le reflet
 * intermédiaire est celui de l'appui dessiné à l'opacité `valeur / pleine`. Au repos, le pinceau du repos tel quel.
 */
private class GlowBrushes(private val rest: Float, private val full: Float) {
    private val restBrush: Brush? = if (rest > 0f) sheenBrush(rest) else null
    private val fullBrush: Brush? = if (full > 0f) sheenBrush(full) else null

    val reaches: Boolean get() = restBrush != null || fullBrush != null

    fun brush(glow: Float): Brush? = if (glow == 0f) restBrush else fullBrush

    fun alpha(glow: Float): Float {
        if (glow == 0f || glow >= 1f) return 1f
        return ((rest + (full - rest) * glow) / full).coerceIn(0f, 1f)
    }
}

/** Le liseré, plus clair du côté éclairé (haut-gauche) que du côté ombre ; `null` quand la recette n'en porte pas. */
private fun MeeshyGlassRecipe.rimBrush(): Brush? {
    if (rimLit <= 0f && rimShade <= 0f && rimTail <= 0f) return null
    val ink = MeeshyMediaChromeColors.OnMedia
    return Brush.linearGradient(
        colors = listOf(ink.copy(alpha = rimLit), ink.copy(alpha = rimShade), ink.copy(alpha = rimTail)),
        start = Offset.Zero,
        end = Offset.Infinite,
    )
}

/** Trace le contour d'une forme quelconque : Compose n'expose pas de `drawOutline` public. */
private fun DrawScope.strokeOutline(outline: Outline, brush: Brush, alpha: Float, stroke: Stroke) {
    when (outline) {
        is Outline.Rectangle -> drawRect(
            brush = brush,
            topLeft = Offset(outline.rect.left, outline.rect.top),
            size = outline.rect.size,
            alpha = alpha,
            style = stroke,
        )
        is Outline.Rounded -> drawRoundRect(
            brush = brush,
            topLeft = Offset(outline.roundRect.left, outline.roundRect.top),
            size = Size(outline.roundRect.width, outline.roundRect.height),
            cornerRadius = outline.roundRect.topLeftCornerRadius,
            alpha = alpha,
            style = stroke,
        )
        is Outline.Generic -> drawPath(path = outline.path, brush = brush, alpha = alpha, style = stroke)
    }
}
