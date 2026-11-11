package me.meeshy.ui.component.kit

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.platform.ViewConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **Ce qu'on VOIT d'un bouton rond de verre** (K02) : le glyphe, son fond plein éventuel (blanc, rouge, voile doux) et le
 * verre de K01, interactif. C'est aussi le disque qu'un menu prend pour ancre.
 *
 * Atome opaque : ni action, ni nom accessible, ni haptique, ni légende. Le glyphe reçoit l'encre ([LocalContentColor]) et
 * la taille que la recette lui fixe : il est figé dans son disque, la taille de police du système ne le touche pas. La
 * réponse au toucher vient de [interactionSource] (appui, survol au pointeur) ou d'un état [pressed] figé (le catalogue) ;
 * elle se joue en phase de dessin, le contenu ne se recompose jamais à l'appui. Au clavier, la même source porte le
 * focus : un anneau décalé de 2 dp, à la couleur que le ton laisse lisible (jamais au doigt : le bouton ne prend le
 * focus qu'au clavier).
 *
 * Un changement de tenue est un fondu enchaîné : le fond et l'encre se fondent, et le verre de K01 qui part (normal →
 * actif, destructif, doux) s'efface dessous au lieu de disparaître.
 *
 * Pendant iOS : `MeeshyGlassButtonFace`.
 */
@Composable
public fun MeeshyGlassButtonFace(
    modifier: Modifier = Modifier,
    kind: MeeshyGlassButtonKind = MeeshyGlassButtonKind.Normal,
    size: MeeshyGlassButtonSize = MeeshyGlassButtonSize.S44,
    tone: MeeshyGlassTone? = null,
    tint: Color? = null,
    glyphTint: Color? = null,
    enabled: Boolean = true,
    interactionSource: InteractionSource? = null,
    pressed: Boolean? = null,
    badge: (@Composable BoxScope.() -> Unit)? = null,
    glyph: @Composable (glyphSize: Dp) -> Unit,
) {
    val effectiveTone = tone ?: LocalMeeshyGlassTone.current
    val isNested = LocalMeeshyGlassNested.current
    val reduceMotion = LocalReduceMotion.current
    val themeInk = MeeshyTheme.tokens.textPrimary
    val themeInverse = MeeshyTheme.tokens.backgroundPrimary
    val rest = remember(kind, size, effectiveTone, isNested, enabled, glyphTint) {
        MeeshyGlassButtonRecipe.resolve(kind, size, effectiveTone, isNested, isEnabled = enabled, glyphTint = glyphTint)
    }
    val hovered = remember(kind, size, effectiveTone, isNested, enabled, glyphTint) {
        MeeshyGlassButtonRecipe.resolve(kind, size, effectiveTone, isNested, isHovered = true, isEnabled = enabled, glyphTint = glyphTint)
    }
    val pressedRecipe = remember(kind, size, effectiveTone, isNested, enabled, glyphTint) {
        MeeshyGlassButtonRecipe.resolve(kind, size, effectiveTone, isNested, isPressed = true, isEnabled = enabled, glyphTint = glyphTint)
    }
    val sourcePressed: State<Boolean>? = if (interactionSource != null) interactionSource.collectIsPressedAsState() else null
    val sourceHovered: State<Boolean>? = if (interactionSource != null) interactionSource.collectIsHoveredAsState() else null
    val sourceFocused: State<Boolean>? = if (interactionSource != null) interactionSource.collectIsFocusedAsState() else null

    val fadeSpec: AnimationSpec<Float> = if (reduceMotion) snap() else tween(durationMillis = MeeshyGlassRecipe.TONE_FADE_MILLIS)
    val inkSpec: AnimationSpec<Color> = if (reduceMotion) snap() else tween(durationMillis = MeeshyGlassRecipe.TONE_FADE_MILLIS)
    val restOpacity = animateFloatAsState(targetValue = rest.fillOpacity, animationSpec = fadeSpec, label = "meeshyGlassButtonFill")
    val wearsGlass = rest.glass == MeeshyGlassButtonGlassRequest.Neutral
    val glassOpacity = animateFloatAsState(targetValue = if (wearsGlass) 1f else 0f, animationSpec = fadeSpec, label = "meeshyGlassButtonGlass")
    val glassLingers = remember(glassOpacity) { derivedStateOf { glassOpacity.value > 0f } }
    val ink = animateColorAsState(targetValue = rest.inkColor(themeInk, themeInverse), animationSpec = inkSpec, label = "meeshyGlassButtonInk")
    val lastFill = remember { LastFill() }
    if (rest.fill != MeeshyGlassButtonFill.Clear) lastFill.color = rest.fillColor(themeInk)
    val fillColor = lastFill.color

    val activeShadow = rest.shadow
    val shadowModifier = if (activeShadow == null) {
        Modifier
    } else {
        val shadowColor = MeeshyMediaChromeColors.MediaBackdrop.copy(alpha = activeShadow.opacity)
        Modifier.shadow(elevation = activeShadow.radiusDp.dp, shape = CircleShape, clip = false, ambientColor = shadowColor, spotColor = shadowColor)
    }
    val discModifier = Modifier
        .size(rest.diameterDp.dp)
        .then(shadowModifier)
        .drawBehind {
            val live = when {
                !enabled -> rest
                pressed ?: sourcePressed?.value ?: false -> pressedRecipe
                sourceHovered?.value == true -> hovered
                else -> rest
            }
            val base = restOpacity.value
            if (base > 0f) {
                val ratio = if (rest.fillOpacity > 0f) live.fillOpacity / rest.fillOpacity else 1f
                drawCircle(fillColor.copy(alpha = (base * ratio).coerceIn(0f, 1f)))
            }
            if (live.pressVeilOpacity > 0f) drawCircle(MeeshyMediaChromeColors.OnMedia.copy(alpha = live.pressVeilOpacity))
        }

    val ringColor = rest.focusRingColor(themeInk)
    val focusRing = if (sourceFocused == null) {
        Modifier
    } else {
        Modifier.drawWithContent {
            drawContent()
            if (sourceFocused.value) {
                val width = MeeshyGlassButtonRecipe.FOCUS_RING_WIDTH_DP.dp.toPx()
                val radius = size.minDimension / 2f + MeeshyGlassButtonRecipe.FOCUS_RING_OFFSET_DP.dp.toPx() + width / 2f
                drawCircle(ringColor, radius = radius, style = Stroke(width = width))
            }
        }
    }

    Box(modifier.then(if (rest.opacity < 1f) Modifier.alpha(rest.opacity) else Modifier).size(rest.diameterDp.dp).then(focusRing)) {
        if (wearsGlass || glassLingers.value) {
            MeeshyGlass(
                modifier = Modifier.size(rest.diameterDp.dp).graphicsLayer { alpha = glassOpacity.value },
                shape = CircleShape,
                tone = effectiveTone,
                tint = tint,
                interactionSource = if (enabled && wearsGlass) interactionSource else null,
                pressed = if (enabled && wearsGlass) pressed else null,
            ) {
                if (wearsGlass) GlassButtonDisc(discModifier, ink, rest.glyphSizeDp.dp, glyph)
            }
        }
        if (!wearsGlass) GlassButtonDisc(discModifier, ink, rest.glyphSizeDp.dp, glyph)
        if (badge != null) {
            Box(Modifier.align(Alignment.TopEnd).clearAndSetSemantics { }) { badge() }
        }
    }
}

/** Le disque d'un bouton avec une icône : le glyphe est l'[icon], à la taille de la recette. */
@Composable
public fun MeeshyGlassButtonFace(
    icon: ImageVector,
    modifier: Modifier = Modifier,
    kind: MeeshyGlassButtonKind = MeeshyGlassButtonKind.Normal,
    size: MeeshyGlassButtonSize = MeeshyGlassButtonSize.S44,
    tone: MeeshyGlassTone? = null,
    tint: Color? = null,
    glyphTint: Color? = null,
    enabled: Boolean = true,
    interactionSource: InteractionSource? = null,
    pressed: Boolean? = null,
    badge: (@Composable BoxScope.() -> Unit)? = null,
) {
    MeeshyGlassButtonFace(
        modifier = modifier, kind = kind, size = size, tone = tone, tint = tint, glyphTint = glyphTint, enabled = enabled,
        interactionSource = interactionSource, pressed = pressed, badge = badge,
    ) { glyphSize ->
        Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(glyphSize))
    }
}

/** La dernière couleur de fond plein posée : le fond qui s'efface au retour au normal garde sa teinte pendant le fondu. */
private class LastFill {
    var color: Color = Color.Transparent
}

@Composable
private fun GlassButtonDisc(
    modifier: Modifier,
    ink: State<Color>,
    glyphSize: Dp,
    glyph: @Composable (glyphSize: Dp) -> Unit,
) {
    Box(modifier, contentAlignment = Alignment.Center) {
        CompositionLocalProvider(LocalContentColor provides ink.value) {
            Box(Modifier.clearAndSetSemantics { }, contentAlignment = Alignment.Center) { glyph(glyphSize) }
        }
    }
}

/**
 * **Un bouton rond de verre** (K02) : le disque, son geste, son nom accessible. Jamais de légende : le nom vit dans
 * l'accessibilité.
 *
 * - Toucher : [onClick] part au relâcher, la réponse visuelle est celle de K01.
 * - Appui long (si [onLongPress]) : 500 ms, annulé au-delà de 10 dp, sans déclencher [onClick] ; le lecteur d'écran
 *   l'offre sous [longPressLabel], ou sous le nom du bouton.
 * - Désactivé ([enabled] faux) : ni action, ni haptique, ni appui, contenu à 40 %.
 * - [activation] dit l'état (bascule, sélection, déplié) et en déduit la tenue quand [kind] est absent.
 * - La cible tactile déborde le disque (au moins 48 dp) ; l'encombrement reste son diamètre.
 *
 * Pendant iOS : `MeeshyGlassButton`.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
public fun MeeshyGlassButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    hint: String? = null,
    value: String? = null,
    kind: MeeshyGlassButtonKind? = null,
    size: MeeshyGlassButtonSize = MeeshyGlassButtonSize.S44,
    activation: MeeshyGlassButtonActivation = MeeshyGlassButtonActivation.None,
    tone: MeeshyGlassTone? = null,
    tint: Color? = null,
    glyphTint: Color? = null,
    enabled: Boolean = true,
    haptic: MeeshyGlassButtonHaptic = MeeshyGlassButtonHaptic.Light,
    onPressChange: ((Boolean) -> Unit)? = null,
    onLongPress: (() -> Unit)? = null,
    longPressLabel: String? = null,
    badge: (@Composable BoxScope.() -> Unit)? = null,
    glyph: @Composable (glyphSize: Dp) -> Unit,
) {
    assert(label.isNotEmpty()) { "MeeshyGlassButton : le nom accessible est obligatoire et non vide" }
    val source = remember { MutableInteractionSource() }
    val haptics = rememberMeeshyHaptics()
    val play: (MeeshyGlassButtonHaptic) -> Unit = remember(haptics) { { _ -> haptics.light() } }
    val state = remember(activation) { MeeshyGlassButtonAccessibilityState.resolve(activation) }
    val toggleWord = state.toggleIsOn?.let {
        stringResource(if (it) R.string.a11y_kit_toggle_on else R.string.a11y_kit_toggle_off)
    }
    val said = MeeshyGlassButtonAccessibilityState.composeValue(toggleWord, value)
    val longPressName = MeeshyGlassButtonAccessibilityState.longPressActionName(longPressLabel, label)

    if (onPressChange != null) PressReporter(source, onPressChange)

    val activate: () -> Unit = { MeeshyGlassButtonTrigger.perform(enabled, haptic, play, onClick) }
    val fireLongPress: () -> Unit = {
        if (onLongPress != null) MeeshyGlassButtonTrigger.perform(enabled, haptic, play, onLongPress)
    }
    val gesture = if (onLongPress == null) {
        Modifier.clickable(
            interactionSource = source,
            indication = null,
            enabled = enabled,
            onClickLabel = hint,
            role = Role.Button,
            onClick = { activate() },
        )
    } else {
        Modifier.combinedClickable(
            interactionSource = source,
            indication = null,
            enabled = enabled,
            onClickLabel = hint,
            role = Role.Button,
            onLongClickLabel = longPressName,
            onLongClick = { fireLongPress() },
            onClick = { activate() },
        )
    }
    val announced = Modifier.semantics(mergeDescendants = true) {
        contentDescription = label
        if (said.isNotEmpty()) stateDescription = said
        state.toggleIsOn?.let { toggleableState = ToggleableState(it) }
        if (state.isSelected) selected = true
    }

    LongPressConfiguration(isOn = onLongPress != null) {
        MeeshyGlassButtonFace(
            modifier = modifier.then(gesture).then(announced),
            kind = kind ?: activation.impliedKind,
            size = size,
            tone = tone,
            tint = tint,
            glyphTint = glyphTint,
            enabled = enabled,
            interactionSource = source,
            badge = badge,
            glyph = glyph,
        )
    }
}

/** Un bouton rond de verre avec une icône ; le nom reste obligatoire, il n'est jamais celui de l'icône. */
@Composable
public fun MeeshyGlassButton(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    hint: String? = null,
    value: String? = null,
    kind: MeeshyGlassButtonKind? = null,
    size: MeeshyGlassButtonSize = MeeshyGlassButtonSize.S44,
    activation: MeeshyGlassButtonActivation = MeeshyGlassButtonActivation.None,
    tone: MeeshyGlassTone? = null,
    tint: Color? = null,
    glyphTint: Color? = null,
    enabled: Boolean = true,
    haptic: MeeshyGlassButtonHaptic = MeeshyGlassButtonHaptic.Light,
    onPressChange: ((Boolean) -> Unit)? = null,
    onLongPress: (() -> Unit)? = null,
    longPressLabel: String? = null,
    badge: (@Composable BoxScope.() -> Unit)? = null,
) {
    MeeshyGlassButton(
        label = label, onClick = onClick, modifier = modifier, hint = hint, value = value, kind = kind, size = size,
        activation = activation, tone = tone, tint = tint, glyphTint = glyphTint, enabled = enabled, haptic = haptic,
        onPressChange = onPressChange, onLongPress = onLongPress, longPressLabel = longPressLabel, badge = badge,
    ) { glyphSize ->
        Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(glyphSize))
    }
}

/**
 * Dit à l'hôte le doigt posé et levé, et levé si le bouton quitte l'écran doigt posé. N'existe que si l'hôte écoute :
 * sans `onPressChange`, aucun écouteur n'est posé.
 */
@Composable
private fun PressReporter(source: InteractionSource, onPressChange: (Boolean) -> Unit) {
    val latest = rememberUpdatedState(onPressChange)
    LaunchedEffect(source) {
        var isPressed = false
        try {
            source.interactions.collect { interaction ->
                val now = when (interaction) {
                    is PressInteraction.Press -> true
                    is PressInteraction.Release, is PressInteraction.Cancel -> false
                    else -> isPressed
                }
                MeeshyGlassPressReport.report(isPressed, now)?.let { latest.value.invoke(it) }
                isPressed = now
            }
        } finally {
            MeeshyGlassPressReport.report(isPressed, null)?.let { latest.value.invoke(it) }
        }
    }
}

/** L'appui long de la planche (500 ms, 10 dp de jeu) pour les boutons qui en portent un. */
@Composable
private fun LongPressConfiguration(isOn: Boolean, content: @Composable () -> Unit) {
    if (!isOn) {
        content()
        return
    }
    val base = LocalViewConfiguration.current
    val density = LocalDensity.current
    val configuration = remember(base, density.density) {
        GlassLongPressConfiguration(base, with(density) { MeeshyGlassButtonRecipe.LONG_PRESS_MAX_MOVEMENT_DP.dp.toPx() })
    }
    CompositionLocalProvider(LocalViewConfiguration provides configuration, content = content)
}

private class GlassLongPressConfiguration(
    private val base: ViewConfiguration,
    override val touchSlop: Float,
) : ViewConfiguration by base {
    override val longPressTimeoutMillis: Long = MeeshyGlassButtonRecipe.LONG_PRESS_MILLIS
}
