package me.meeshy.ui.component.kit

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.State
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Fige le pouce en état tenu : la tuile « pressé » du catalogue, rien d'autre. Pendant iOS : `meeshyLabeledSliderForcesPressed`.
 */
public val LocalMeeshyLabeledSliderForcesPressed: ProvidableCompositionLocal<Boolean> = compositionLocalOf { false }

/**
 * Le curseur d'un réglage continu (K05) : le nom à gauche, la valeur lue à droite, la piste fine et son pouce dessous.
 * Il ne choisit ni le ton ni le verre : le ton vient de l'hôte ([LocalMeeshyGlassTone]), et le conteneur lui revient.
 * Pendant iOS : `MeeshyLabeledSlider`. Le texte de la valeur ([valueText]) est ce que l'accessibilité annonce.
 *
 * - [showsValue] faux : la valeur ne s'affiche pas, mais elle reste annoncée ; aucune place n'est gardée à droite du nom.
 * - [neutral] : deux touchers sur la valeur la remettent au neutre ; [resetLabel] nomme cette action au lecteur d'écran.
 * - [enabled] faux : contenu à 40 %, ni geste ni haptique, aucun focus.
 *
 * L'en-tête est sa propre portée de recomposition, à paramètres stables : glisser ne le recompose que si le texte de la
 * valeur (ou son encre) change.
 */
@Composable
public fun MeeshyLabeledSlider(
    label: String,
    value: Float,
    onValueChange: (Float) -> Unit,
    valueText: String,
    modifier: Modifier = Modifier,
    range: ClosedFloatingPointRange<Float> = 0f..1f,
    step: Float? = null,
    showsValue: Boolean = true,
    neutral: Float? = null,
    resetLabel: String? = null,
    tint: Color? = null,
    haptic: MeeshyLabeledSliderHaptic = MeeshyLabeledSliderHaptic.Light,
    enabled: Boolean = true,
    onEditingChanged: ((Boolean) -> Unit)? = null,
) {
    val rule = remember(range, step) { MeeshyLabeledSliderRule(range = range, step = step) }
    val interaction = remember(rule, neutral, haptic, enabled) { MeeshyLabeledSliderInteraction(rule, neutral, haptic, enabled) }
    val recipe = MeeshyLabeledSliderRecipe.resolve(
        tone = LocalMeeshyGlassTone.current,
        isEnabled = enabled,
        isPressed = false,
        isOffNeutral = rule.isOffNeutral(value, neutral),
        tint = tint,
    )
    val isDark = MeeshyTheme.isDark
    val latestValue = rememberUpdatedState(value)
    val latestOnChange = rememberUpdatedState(onValueChange)
    val latestEditing = rememberUpdatedState(onEditingChanged)
    val haptics: MeeshyHaptics = rememberMeeshyHaptics()
    val canReset = enabled && interaction.neutral != null
    val reset: (() -> Unit)? = remember(interaction, haptics, canReset) {
        if (canReset) {
            val action: () -> Unit = {
                val effects = interaction.perform(MeeshyLabeledSliderCommand.Reset, latestValue.value, isRtl = false)
                playEffects(effects, latestOnChange, latestEditing, haptics)
            }
            action
        } else {
            null
        }
    }
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
        MeeshyLabeledSliderHeader(
            label = label,
            valueText = if (showsValue) valueText else null,
            ink = recipe.inkColor(isDark),
            valueColor = recipe.valueColor(isDark),
            contentAlpha = recipe.contentOpacity,
            onReset = reset,
        )
        MeeshySliderTrack(
            label = label,
            value = value,
            onValueChange = onValueChange,
            valueText = valueText,
            range = range,
            step = step,
            neutral = neutral,
            resetLabel = resetLabel,
            tint = tint,
            haptic = haptic,
            enabled = enabled,
            onEditingChanged = onEditingChanged,
        )
    }
}

/**
 * L'en-tête : le nom au bord de début, la valeur lue au bord de fin, alignés sur la première ligne de base (le nom peut
 * passer à deux lignes). Masqué au lecteur d'écran — la piste porte le nom et la valeur. Sans valeur visible, aucune place
 * n'est gardée. Deux touchers sur la valeur remettent au neutre, seulement si [onReset] existe.
 */
@Composable
private fun MeeshyLabeledSliderHeader(
    label: String,
    valueText: String?,
    ink: Color,
    valueColor: Color,
    contentAlpha: Float,
    onReset: (() -> Unit)?,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .graphicsLayer { alpha = contentAlpha }
            .clearAndSetSemantics {},
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            text = label,
            modifier = Modifier.weight(1f).alignByBaseline(),
            color = ink,
            style = TextStyle(fontSize = MeeshyFontSize.subhead, fontWeight = FontWeight.SemiBold),
            maxLines = 2,
        )
        if (valueText != null) {
            val resetGesture = if (onReset == null) {
                Modifier
            } else {
                Modifier.pointerInput(onReset) { detectTapGestures(onDoubleTap = { onReset() }) }
            }
            Text(
                text = valueText,
                modifier = Modifier.alignByBaseline().then(resetGesture),
                color = valueColor,
                style = TextStyle(fontSize = MeeshyFontSize.small, fontFeatureSettings = "tnum"),
                maxLines = 1,
                softWrap = false,
            )
        }
    }
}

/**
 * La piste seule d'un curseur : même loi, même accessibilité, sans en-tête visible. L'élément d'accessibilité porte le nom
 * [label], la valeur lue [valueText] et l'action de remise. Glisser à l'horizontale règle ; un toucher bref y porte le pouce ;
 * un glissé vertical reste à l'hôte. Pendant iOS : `MeeshySliderTrack`.
 *
 * Le glissé part au-delà de la pente système (`touchSlop`), celle que partage le défilement de l'hôte : c'est elle qui
 * décide de l'axe sur Android, là où iOS pose son propre seuil ([MeeshyLabeledSliderRecipe.DRAG_THRESHOLD_DP]).
 */
@Composable
public fun MeeshySliderTrack(
    label: String,
    value: Float,
    onValueChange: (Float) -> Unit,
    valueText: String,
    modifier: Modifier = Modifier,
    range: ClosedFloatingPointRange<Float> = 0f..1f,
    step: Float? = null,
    neutral: Float? = null,
    resetLabel: String? = null,
    tint: Color? = null,
    haptic: MeeshyLabeledSliderHaptic = MeeshyLabeledSliderHaptic.Light,
    enabled: Boolean = true,
    onEditingChanged: ((Boolean) -> Unit)? = null,
) {
    require(label.isNotEmpty()) { "MeeshySliderTrack : le nom accessible est obligatoire et non vide" }
    val rule = remember(range, step) { MeeshyLabeledSliderRule(range = range, step = step) }
    val interaction = remember(rule, neutral, haptic, enabled) { MeeshyLabeledSliderInteraction(rule, neutral, haptic, enabled) }
    val latestInteraction = rememberUpdatedState(interaction)
    val latestValue = rememberUpdatedState(value)
    val latestOnChange = rememberUpdatedState(onValueChange)
    val latestEditing = rememberUpdatedState(onEditingChanged)
    val haptics: MeeshyHaptics = rememberMeeshyHaptics()
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val reduceMotion = LocalReduceMotion.current
    val isDark = MeeshyTheme.isDark
    val interactionSource = remember { MutableInteractionSource() }
    val isHovered by interactionSource.collectIsHoveredAsState()
    var isTouching by remember { mutableStateOf(false) }
    val forcesPressed = LocalMeeshyLabeledSliderForcesPressed.current
    var isFocused by remember { mutableStateOf(false) }

    val recipe = MeeshyLabeledSliderRecipe.resolve(
        tone = LocalMeeshyGlassTone.current,
        isEnabled = enabled,
        isPressed = isTouching || forcesPressed,
        isOffNeutral = rule.isOffNeutral(value, neutral),
        tint = tint,
        reduceMotion = reduceMotion,
        isHovered = isHovered,
    )
    val fraction = rule.fraction(of = value, isRtl = isRtl)
    val settledFraction: State<Float> = animateFloatAsState(
        targetValue = fraction,
        animationSpec = if (isTouching || reduceMotion) {
            snap<Float>()
        } else {
            tween<Float>(MeeshyLabeledSliderRecipe.SETTLE_MILLIS, easing = MeeshyLabeledSliderRecipe.SettleEasing)
        },
        label = "meeshy-labeled-slider-fraction",
    )
    val thumbScale: State<Float> = animateFloatAsState(
        targetValue = recipe.thumbScale,
        animationSpec = MeeshyMotion.springFast<Float>(),
        label = "meeshy-labeled-slider-scale",
    )
    val haloOpacity: State<Float> = animateFloatAsState(
        targetValue = recipe.haloOpacity,
        animationSpec = MeeshyMotion.springFast<Float>(),
        label = "meeshy-labeled-slider-halo",
    )

    val play: (List<MeeshyLabeledSliderEffect>) -> Unit = remember(haptics) {
        { effects: List<MeeshyLabeledSliderEffect> -> playEffects(effects, latestOnChange, latestEditing, haptics) }
    }
    DisposableEffect(enabled, isRtl) {
        onDispose {
            if (isTouching) {
                isTouching = false
                latestEditing.value?.invoke(false)
            }
        }
    }

    val gestures = if (!enabled) {
        Modifier
    } else {
        Modifier
            .pointerInput(isRtl) {
                detectTapGestures(onTap = { offset ->
                    play(latestInteraction.value.jump(latestValue.value, fractionAt(offset.x), isRtl))
                })
            }
            .pointerInput(isRtl) {
                detectHorizontalDragGestures(
                    onDragStart = { offset ->
                        isTouching = true
                        play(latestInteraction.value.drag(latestValue.value, fractionAt(offset.x), isRtl, isEditing = false))
                    },
                    onDragEnd = {
                        play(latestInteraction.value.release(isEditing = isTouching))
                        isTouching = false
                    },
                    onDragCancel = {
                        play(latestInteraction.value.release(isEditing = isTouching))
                        isTouching = false
                    },
                    onHorizontalDrag = { change, _ ->
                        change.consume()
                        play(latestInteraction.value.drag(latestValue.value, fractionAt(change.position.x), isRtl, isEditing = true))
                    },
                )
            }
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(MeeshyLabeledSliderRecipe.HIT_HEIGHT_DP.dp)
            .hoverable(interactionSource, enabled = enabled)
            .onFocusChanged { isFocused = it.isFocused }
            .focusable(enabled = enabled)
            .onKeyEvent { event ->
                val command = event.toCommandOrNull()
                if (command == null || event.type != KeyEventType.KeyDown) {
                    false
                } else {
                    play(latestInteraction.value.perform(command, latestValue.value, isRtl))
                    true
                }
            }
            .then(gestures)
            .semantics(mergeDescendants = true) {
                contentDescription = label
                stateDescription = valueText
                progressBarRangeInfo = ProgressBarRangeInfo(value.coerceIn(range), range)
                if (!enabled) disabled()
                if (enabled) {
                    setProgress { target ->
                        val command = if (target >= latestValue.value) {
                            MeeshyLabeledSliderCommand.PageUp
                        } else {
                            MeeshyLabeledSliderCommand.PageDown
                        }
                        play(latestInteraction.value.perform(command, latestValue.value, isRtl))
                        true
                    }
                }
                interaction.resetActionName(resetLabel)?.let { name ->
                    customActions = listOf(
                        CustomAccessibilityAction(name) {
                            play(latestInteraction.value.perform(MeeshyLabeledSliderCommand.Reset, latestValue.value, isRtl))
                            true
                        },
                    )
                }
            },
    ) {
        Canvas(modifier = Modifier.fillMaxSize().graphicsLayer { alpha = recipe.contentOpacity }) {
            drawSlider(
                fraction = if (isTouching) fraction else settledFraction.value,
                isRtl = isRtl,
                recipe = recipe,
                isDark = isDark,
                thumbScale = thumbScale.value,
                haloOpacity = haloOpacity.value,
                showsFocusRing = isFocused && enabled,
            )
        }
    }
}

/**
 * Le dessin de la piste, en coordonnées de GAUCHE à droite (le miroir RTL est déjà dans [fraction]). Lu en phase de dessin :
 * le doigt qui glisse, la pression et le relâchement repeignent sans remesurer. Doigt posé, le pouce prend la fraction de la
 * valeur dans la même image ; hors du doigt, il glisse en [MeeshyLabeledSliderRecipe.SETTLE_MILLIS].
 */
private fun DrawScope.drawSlider(
    fraction: Float,
    isRtl: Boolean,
    recipe: MeeshyLabeledSliderRecipe,
    isDark: Boolean,
    thumbScale: Float,
    haloOpacity: Float,
    showsFocusRing: Boolean,
) {
    val width = size.width
    val centreY = size.height / 2f
    val inset = MeeshyLabeledSliderRecipe.THUMB_INSET_DP.dp.toPx()
    val thumbX = inset + fraction * (width - 2f * inset).coerceAtLeast(0f)
    val railHeight = MeeshyLabeledSliderRecipe.TRACK_HEIGHT_DP.dp.toPx()
    val railTop = centreY - railHeight / 2f
    val ink = recipe.inkColor(isDark)
    drawRoundRect(
        color = recipe.emptyTrackColor(isDark),
        topLeft = Offset(0f, railTop),
        size = Size(width, railHeight),
        cornerRadius = CornerRadius(railHeight / 2f),
    )
    drawRoundRect(
        color = recipe.fillColor(isDark),
        topLeft = Offset(if (isRtl) thumbX else 0f, railTop),
        size = Size(if (isRtl) width - thumbX else thumbX, railHeight),
        cornerRadius = CornerRadius(railHeight / 2f),
    )
    val centre = Offset(thumbX, centreY)
    drawCircle(
        color = recipe.haloColor(isDark).copy(alpha = haloOpacity),
        radius = MeeshyLabeledSliderRecipe.HALO_DIAMETER_DP.dp.toPx() / 2f,
        center = centre,
    )
    val thumbRadius = MeeshyLabeledSliderRecipe.THUMB_DIAMETER_DP.dp.toPx() / 2f * thumbScale
    drawThumbShadow(centre = centre, thumbRadius = thumbRadius, shadow = recipe.shadowColor())
    drawCircle(color = ink, radius = thumbRadius, center = centre)
    if (showsFocusRing) {
        val ringWidth = MeeshyLabeledSliderRecipe.FOCUS_RING_WIDTH_DP.dp.toPx()
        drawCircle(
            color = ink,
            radius = (MeeshyLabeledSliderRecipe.FOCUS_RING_DIAMETER_DP.dp.toPx() - ringWidth) / 2f,
            center = centre,
            style = Stroke(width = ringWidth),
        )
    }
}

/**
 * L'ombre portée du pouce, adoucie sur [MeeshyLabeledSliderRecipe.SHADOW_RADIUS_DP] par un dégradé radial repeint : le
 * pendant de `.shadow(radius:y:)` d'iOS, sans flou ni calque hors écran.
 */
private fun DrawScope.drawThumbShadow(centre: Offset, thumbRadius: Float, shadow: Color) {
    val softness = MeeshyLabeledSliderRecipe.SHADOW_RADIUS_DP.dp.toPx()
    val outer = thumbRadius + softness
    if (outer <= 0f) return
    val shadowCentre = centre.copy(y = centre.y + MeeshyLabeledSliderRecipe.SHADOW_OFFSET_Y_DP.dp.toPx())
    val solidUntil = ((thumbRadius - softness / 2f) / outer).coerceIn(0f, 1f)
    drawCircle(
        brush = Brush.radialGradient(
            0f to shadow,
            solidUntil to shadow,
            1f to shadow.copy(alpha = 0f),
            center = shadowCentre,
            radius = outer,
        ),
        radius = outer,
        center = shadowCentre,
    )
}

/** La fraction lue sous le doigt, depuis le bord de GAUCHE : le centre du pouce reste dans la piste. */
private fun PointerInputScope.fractionAt(x: Float): Float {
    val inset = MeeshyLabeledSliderRecipe.THUMB_INSET_DP.dp.toPx()
    val usable = (size.width - 2f * inset).coerceAtLeast(1f)
    return (x - inset) / usable
}

private fun MeeshyLabeledSliderRule.isOffNeutral(value: Float, neutral: Float?): Boolean =
    neutral != null && snap(value) != snap(neutral)

/** Joue les effets d'une interaction : l'hôte reçoit l'édition et la valeur, le tic passe par [MeeshyHaptics]. */
private fun playEffects(
    effects: List<MeeshyLabeledSliderEffect>,
    onValueChange: State<(Float) -> Unit>,
    onEditingChanged: State<((Boolean) -> Unit)?>,
    haptics: MeeshyHaptics,
) {
    effects.forEach { effect ->
        when (effect) {
            is MeeshyLabeledSliderEffect.Editing -> onEditingChanged.value?.invoke(effect.isEditing)
            is MeeshyLabeledSliderEffect.Value -> onValueChange.value(effect.value)
            MeeshyLabeledSliderEffect.Haptic -> haptics.light()
        }
    }
}

/**
 * Le clavier : flèches, Page préc. / suiv., Début / Fin ; Suppr et retour arrière remettent au neutre (iOS : `.delete` et
 * `.deleteForward`).
 */
private fun KeyEvent.toCommandOrNull(): MeeshyLabeledSliderCommand? = when (key) {
    Key.DirectionLeft -> MeeshyLabeledSliderCommand.ArrowLeft
    Key.DirectionRight -> MeeshyLabeledSliderCommand.ArrowRight
    Key.DirectionUp -> MeeshyLabeledSliderCommand.ArrowUp
    Key.DirectionDown -> MeeshyLabeledSliderCommand.ArrowDown
    Key.PageUp -> MeeshyLabeledSliderCommand.PageUp
    Key.PageDown -> MeeshyLabeledSliderCommand.PageDown
    Key.MoveHome -> MeeshyLabeledSliderCommand.Home
    Key.MoveEnd -> MeeshyLabeledSliderCommand.End
    Key.Delete, Key.Backspace -> MeeshyLabeledSliderCommand.Reset
    else -> null
}
