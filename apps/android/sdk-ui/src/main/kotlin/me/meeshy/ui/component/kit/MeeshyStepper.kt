package me.meeshy.ui.component.kit

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.AwaitPointerEventScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.coerceAtLeast
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/** Un arrêt de la piste ou un jalon : des mots déjà traduits, un glyphe, une taille donnée par l'hôte (K53). */
public data class MeeshyStepperStop(
    val id: String,
    val title: String,
    val caption: String? = null,
    val icon: ImageVector? = null,
    val markSize: Dp? = null,
)

/**
 * **Des crans, jamais une glissière** (K53) : une valeur qui avance par pas se règle ou se suit sur une seule échelle
 * discrète. Trois formes — [MeeshyStepperKind.Buttons] (deux disques et la valeur, l'appui long qui accélère),
 * [MeeshyStepperKind.Track] (2 à 5 arrêts, un seul choisi) et [MeeshyStepperKind.Milestones] (2 à 5 étapes en lecture, aucun
 * geste) — et UNE loi de bornes ([MeeshyStepperRule]).
 *
 * La valeur reçue par [onChange] est déjà bornée ; [onBound] prévient l'hôte à la butée, que la main sent (haptique ferme).
 * Le sens d'un cran — rayon, quota, date — vient de l'hôte, jamais d'ici : [label], [spokenValue], [decrementLabel] et
 * [incrementLabel] sont des mots déjà traduits. TalkBack lit un seul élément réglable qui annonce la valeur, pas le geste.
 * Jumeau iOS : `MeeshyStepper`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyStepper(
    value: Int,
    range: IntRange,
    label: String,
    onChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
    kind: MeeshyStepperKind = MeeshyStepperKind.Buttons,
    size: MeeshyStepperSize = MeeshyStepperSize.Regular,
    stops: List<MeeshyStepperStop> = emptyList(),
    spokenValue: String? = null,
    step: Int = 1,
    stepLadder: List<MeeshyStepperRung> = emptyList(),
    repeatsOnHold: Boolean = true,
    decrementLabel: String? = null,
    incrementLabel: String? = null,
    tint: Color? = null,
    enabled: Boolean = true,
    animatesOnAppear: Boolean = true,
    onBound: (() -> Unit)? = null,
    footer: (@Composable () -> Unit)? = null,
    valueContent: (@Composable () -> Unit)? = null,
) {
    val reduce = LocalReduceMotion.current
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val bounds = if (kind == MeeshyStepperKind.Buttons) range else 0 until stops.size
    val values = MeeshyStepperRecipe.resolve(kind, size, value, bounds, stops.size, false, enabled, isRtl, reduce)
    if (!values.isRendered) return
    val accent = tint ?: MeeshyPalette.Indigo500
    val locale = LocalConfiguration.current.locales[0]
    val spoken = MeeshyStepperRecipe.spokenValue(spokenValue, value, stops.getOrNull(values.selectedIndex)?.title, locale)
    Column(modifier) {
        when (kind) {
            MeeshyStepperKind.Buttons -> StepperButtons(
                value, range, label, spoken, onChange, values, step, stepLadder, repeatsOnHold, decrementLabel, incrementLabel,
                enabled, onBound, valueContent,
            )
            MeeshyStepperKind.Track -> StepperTrack(values, stops, label, spoken, accent, enabled, onChange, onBound)
            MeeshyStepperKind.Milestones -> StepperMilestones(values, stops, label, accent, animatesOnAppear)
        }
        footer?.invoke()
    }
}

@Composable
@Suppress("LongParameterList", "LongMethod")
private fun StepperButtons(
    value: Int,
    range: IntRange,
    label: String,
    spoken: String,
    onChange: (Int) -> Unit,
    values: MeeshyStepperValues,
    step: Int,
    stepLadder: List<MeeshyStepperRung>,
    repeatsOnHold: Boolean,
    decrementLabel: String?,
    incrementLabel: String?,
    enabled: Boolean,
    onBound: (() -> Unit)?,
    valueContent: (@Composable () -> Unit)?,
) {
    val haptics = rememberMeeshyHaptics()
    val reduce = LocalReduceMotion.current
    val currentValue = rememberUpdatedState(value)
    val currentChange = rememberUpdatedState(onChange)
    val currentBound = rememberUpdatedState(onBound)
    fun advance(delta: Int) {
        val at = currentValue.value
        val result = MeeshyStepperRule.next(at, delta, range, MeeshyStepperRule.step(at, step, stepLadder))
        if (result.hitBound) {
            currentBound.value?.invoke()
            haptics.rigid()
        } else {
            haptics.light()
        }
        if (result.value != at) currentChange.value(result.value)
    }
    val atMinimum = stringResource(R.string.kit_stepper_at_minimum)
    val atMaximum = stringResource(R.string.kit_stepper_at_maximum)
    val tokens = MeeshyTheme.tokens
    val decrement = CustomAccessibilityAction(decrementLabel ?: "−") { advance(-1); true }
    val increment = CustomAccessibilityAction(incrementLabel ?: "+") { advance(1); true }
    Row(
        modifier = Modifier
            .height(values.capsuleHeightDp.dp)
            .clip(RoundedCornerShape(values.capsuleHeightDp.dp / 2))
            .background(tokens.inputBackground)
            .border(1.dp, tokens.hairline, RoundedCornerShape(values.capsuleHeightDp.dp / 2))
            .padding(values.capsuleInsetDp.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = label
                stateDescription = when {
                    value <= range.first -> "$spoken, $atMinimum"
                    value >= range.last -> "$spoken, $atMaximum"
                    else -> spoken
                }
                progressBarRangeInfo = ProgressBarRangeInfo(
                    value.toFloat(), range.first.toFloat()..range.last.toFloat(), MeeshyStepperRule.notches(range, step, stepLadder),
                )
                customActions = listOf(decrement, increment)
                setProgress { target ->
                    val delta = MeeshyStepperRule.direction(currentValue.value, target)
                    if (enabled && delta != 0) advance(delta)
                    enabled
                }
                if (!enabled) disabled()
            },
        horizontalArrangement = Arrangement.spacedBy(values.capsuleGapDp.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StepperDisc(MeeshyIcons.Remove, values.minusOpacity, values, solid = false, enabled, repeatsOnHold, { advance(-1) }, { value > range.first })
        Box(Modifier.widthIn(min = values.valueMinWidthDp.dp).decorative(), contentAlignment = Alignment.Center) {
            if (valueContent != null) {
                valueContent()
            } else {
                StepperValue(value, reduce)
            }
        }
        StepperDisc(MeeshyIcons.Add, values.plusOpacity, values, solid = true, enabled, repeatsOnHold, { advance(1) }, { value < range.last })
    }
}

@Composable
private fun StepperValue(value: Int, reduce: Boolean) {
    val text: @Composable (Int) -> Unit = {
        Text(
            it.toString(), color = MeeshyTheme.tokens.textPrimary, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold,
            style = TextStyle(fontFeatureSettings = "tnum"),
        )
    }
    if (reduce) {
        text(value)
    } else {
        AnimatedContent(
            targetState = value,
            transitionSpec = {
                val up = targetState > initialState
                (slideInVertically { if (up) it else -it } + fadeIn()) togetherWith (slideOutVertically { if (up) -it else it } + fadeOut())
            },
            label = "stepper-value",
        ) { text(it) }
    }
}

@Composable
@Suppress("LongParameterList")
private fun StepperDisc(
    icon: ImageVector,
    opacity: Float,
    values: MeeshyStepperValues,
    solid: Boolean,
    enabled: Boolean,
    repeatsOnHold: Boolean,
    onStep: () -> Unit,
    isActive: () -> Boolean,
) {
    var pressed by remember { mutableStateOf(false) }
    val reduce = LocalReduceMotion.current
    val currentStep = rememberUpdatedState(onStep)
    val currentActive = rememberUpdatedState(isActive)
    val tokens = MeeshyTheme.tokens
    val scale = if (pressed && !reduce) 0.94f else 1f
    Box(
        modifier = Modifier
            .size(values.tapTargetDp.dp.coerceAtLeast(values.discDiameterDp.dp))
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .alpha(opacity)
            .pointerInput(enabled, repeatsOnHold) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    if (!enabled) return@awaitEachGesture
                    val started = MeeshyStepperHoldLaw().press(currentActive.value())
                    if (!started.fires) {
                        if (waitForUpOrCancellation() != null) currentStep.value()
                        return@awaitEachGesture
                    }
                    pressed = true
                    try {
                        holdCadence(started.law, repeatsOnHold, currentActive, currentStep)
                    } finally {
                        pressed = false
                    }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(values.discDiameterDp.dp).clip(CircleShape).background(if (solid) tokens.controlFill else Color.Transparent),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = if (solid) tokens.textPrimary else tokens.textSecondary, modifier = Modifier.size(20.dp))
        }
    }
}

/**
 * La cadence d'un appui tenu, selon [MeeshyStepperHoldLaw] : un toucher avance au relâcher ; tenu, la cadence avance seule
 * et accélère ; un geste annulé ou un bouton éteint arrête tout, sans pas fantôme.
 */
private suspend fun AwaitPointerEventScope.holdCadence(
    pressedLaw: MeeshyStepperHoldLaw,
    repeatsOnHold: Boolean,
    isActive: State<() -> Boolean>,
    onStep: State<() -> Unit>,
) {
    var law = pressedLaw
    var tick = 0
    while (true) {
        val wait = MeeshyStepperRecipe.holdDelayMillis(tick).toLong()
        val up = if (repeatsOnHold) {
            withTimeoutOrNull(wait) { StepperLift(waitForUpOrCancellation() != null) }
        } else {
            StepperLift(waitForUpOrCancellation() != null)
        }
        if (up != null) {
            if (up.released && law.release(isActive.value()).fires) onStep.value()
            return
        }
        val beat = law.repeatTick(isActive.value())
        law = beat.law
        if (!beat.fires) return
        onStep.value()
        tick++
    }
}

/** Le doigt s'est levé ([released]) ou le geste a été annulé. */
private class StepperLift(val released: Boolean)
