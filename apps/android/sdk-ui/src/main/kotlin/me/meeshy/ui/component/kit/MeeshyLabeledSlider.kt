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
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.focus.onFocusChanged
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
    val recipe = MeeshyLabeledSliderRecipe.resolve(
        tone = LocalMeeshyGlassTone.current,
        isEnabled = enabled,
        isPressed = false,
        isOffNeutral = isOffNeutral(value, step, range, neutral),
        tint = tint,
    )
    val isDark = MeeshyTheme.isDark
    Column(
        modifier = modifier.graphicsLayer { alpha = recipe.contentOpacity },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        Row(
            modifier = Modifier.clearAndSetSemantics {},
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Text(
                text = label,
                modifier = Modifier.weight(1f),
                color = recipe.inkColor(isDark),
                style = TextStyle(fontSize = MeeshyFontSize.subhead, fontWeight = FontWeight.SemiBold),
                maxLines = 2,
            )
            if (showsValue) {
                Text(
                    text = valueText,
                    color = recipe.valueColor(isDark),
                    style = TextStyle(fontSize = MeeshyFontSize.small, fontFeatureSettings = "tnum"),
                    maxLines = 1,
                )
            }
        }
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
 * La piste seule d'un curseur : même loi, même accessibilité, sans en-tête visible. L'élément d'accessibilité porte le nom
 * [label], la valeur lue [valueText] et l'action de remise. Glisser à l'horizontale règle ; un toucher bref y porte le pouce ;
 * un glissé vertical reste à l'hôte. Pendant iOS : `MeeshySliderTrack`.
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
    val interaction = MeeshyLabeledSliderInteraction(rule, neutral, haptic, enabled)
    val latestInteraction = rememberUpdatedState(interaction)
    val latestValue = rememberUpdatedState(value)
    val latestOnChange = rememberUpdatedState(onValueChange)
    val latestEditing = rememberUpdatedState(onEditingChanged)
    val haptics: MeeshyHaptics = rememberMeeshyHaptics()
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val reduceMotion = LocalReduceMotion.current
    val isDark = MeeshyTheme.isDark
    val density = LocalDensity.current
    val insetPx = with(density) { MeeshyLabeledSliderRecipe.THUMB_INSET_DP.dp.toPx() }
    val interactionSource = remember { MutableInteractionSource() }
    val isHovered by interactionSource.collectIsHoveredAsState()
    var isTouching by remember { mutableStateOf(false) }
    val forcesPressed = LocalMeeshyLabeledSliderForcesPressed.current
    var isFocused by remember { mutableStateOf(false) }
    var widthPx by remember { mutableIntStateOf(0) }

    val recipe = MeeshyLabeledSliderRecipe.resolve(
        tone = LocalMeeshyGlassTone.current,
        isEnabled = enabled,
        isPressed = isTouching || forcesPressed,
        isOffNeutral = isOffNeutral(value, step, range, neutral),
        tint = tint,
        reduceMotion = reduceMotion,
        isHovered = isHovered,
    )
    val fraction = rule.fraction(of = value, isRtl = isRtl)
    val animatedFraction by animateFloatAsState(
        targetValue = fraction,
        animationSpec = if (isTouching || reduceMotion) snap<Float>() else tween<Float>(MeeshyLabeledSliderRecipe.SETTLE_MILLIS),
        label = "meeshy-labeled-slider-fraction",
    )
    val animatedThumbScale by animateFloatAsState(
        targetValue = recipe.thumbScale,
        animationSpec = MeeshyMotion.springFast<Float>(),
        label = "meeshy-labeled-slider-scale",
    )
    val animatedHalo by animateFloatAsState(
        targetValue = recipe.haloOpacity,
        animationSpec = MeeshyMotion.springFast<Float>(),
        label = "meeshy-labeled-slider-halo",
    )

    val play: (List<MeeshyLabeledSliderEffect>) -> Unit = { effects ->
        effects.forEach { effect ->
            when (effect) {
                is MeeshyLabeledSliderEffect.Editing -> latestEditing.value?.invoke(effect.isEditing)
                is MeeshyLabeledSliderEffect.Value -> latestOnChange.value(effect.value)
                MeeshyLabeledSliderEffect.Haptic -> haptics.light()
            }
        }
    }
    DisposableEffect(Unit) {
        onDispose { if (isTouching) latestEditing.value?.invoke(false) }
    }

    val fractionAt: (Float) -> Float = { x ->
        val usable = (widthPx - 2f * insetPx).coerceAtLeast(1f)
        (x - insetPx) / usable
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(MeeshyLabeledSliderRecipe.HIT_HEIGHT_DP.dp)
            .onSizeChanged { widthPx = it.width }
            .hoverable(interactionSource)
            .focusable(enabled = enabled)
            .onFocusChanged { isFocused = it.isFocused }
            .onKeyEvent { event ->
                val command = event.toCommandOrNull()
                if (command == null || event.type != KeyEventType.KeyDown) {
                    false
                } else {
                    play(latestInteraction.value.perform(command, latestValue.value, isRtl))
                    true
                }
            }
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
                latestInteraction.value.resetActionName(resetLabel)?.let { name ->
                    customActions = listOf(
                        CustomAccessibilityAction(name) {
                            play(latestInteraction.value.perform(MeeshyLabeledSliderCommand.Reset, latestValue.value, isRtl))
                            true
                        },
                    )
                }
            },
    ) {
        Canvas(modifier = Modifier.fillMaxWidth().height(MeeshyLabeledSliderRecipe.HIT_HEIGHT_DP.dp)) {
            val width = size.width
            val centreY = size.height / 2f
            val usable = (width - 2f * insetPx).coerceAtLeast(0f)
            val thumbX = insetPx + animatedFraction * usable
            val railHeight = MeeshyLabeledSliderRecipe.TRACK_HEIGHT_DP.dp.toPx()
            val railTop = centreY - railHeight / 2f
            val ink = recipe.inkColor(isDark)
            drawRoundRect(
                color = recipe.emptyTrackColor(isDark),
                topLeft = Offset(0f, railTop),
                size = Size(width, railHeight),
                cornerRadius = CornerRadius(railHeight / 2f),
            )
            val fillStart = if (isRtl) thumbX else 0f
            val fillWidth = if (isRtl) width - thumbX else thumbX
            drawRoundRect(
                color = recipe.fillColor(isDark),
                topLeft = Offset(fillStart, railTop),
                size = Size(fillWidth, railHeight),
                cornerRadius = CornerRadius(railHeight / 2f),
            )
            val centre = Offset(thumbX, centreY)
            drawCircle(
                color = recipe.haloColor(isDark).copy(alpha = animatedHalo),
                radius = MeeshyLabeledSliderRecipe.HALO_DIAMETER_DP.dp.toPx() / 2f,
                center = centre,
            )
            drawCircle(
                color = recipe.shadowColor(),
                radius = MeeshyLabeledSliderRecipe.THUMB_DIAMETER_DP.dp.toPx() / 2f * animatedThumbScale,
                center = centre.copy(y = centre.y + MeeshyLabeledSliderRecipe.SHADOW_OFFSET_Y_DP.dp.toPx()),
            )
            drawCircle(
                color = ink,
                radius = MeeshyLabeledSliderRecipe.THUMB_DIAMETER_DP.dp.toPx() / 2f * animatedThumbScale,
                center = centre,
            )
            if (isFocused && enabled) {
                drawCircle(
                    color = ink,
                    radius = (MeeshyLabeledSliderRecipe.THUMB_DIAMETER_DP + 8f).dp.toPx() / 2f,
                    center = centre,
                    style = Stroke(width = MeeshyLabeledSliderRecipe.FOCUS_RING_WIDTH_DP.dp.toPx()),
                )
            }
        }
    }
}

private fun isOffNeutral(value: Float, step: Float?, range: ClosedFloatingPointRange<Float>, neutral: Float?): Boolean {
    val rule = MeeshyLabeledSliderRule(range = range, step = step)
    return neutral != null && rule.snap(value) != rule.snap(neutral)
}

private fun KeyEvent.toCommandOrNull(): MeeshyLabeledSliderCommand? = when (key) {
    Key.DirectionLeft -> MeeshyLabeledSliderCommand.ArrowLeft
    Key.DirectionRight -> MeeshyLabeledSliderCommand.ArrowRight
    Key.DirectionUp -> MeeshyLabeledSliderCommand.ArrowUp
    Key.DirectionDown -> MeeshyLabeledSliderCommand.ArrowDown
    Key.PageUp -> MeeshyLabeledSliderCommand.PageUp
    Key.PageDown -> MeeshyLabeledSliderCommand.PageDown
    Key.MoveHome -> MeeshyLabeledSliderCommand.Home
    Key.MoveEnd -> MeeshyLabeledSliderCommand.End
    Key.Delete -> MeeshyLabeledSliderCommand.Reset
    else -> null
}
