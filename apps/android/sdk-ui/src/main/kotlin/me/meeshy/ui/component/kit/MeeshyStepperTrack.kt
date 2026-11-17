package me.meeshy.ui.component.kit

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyTheme

private const val TRACE_MILLIS = 600
private const val HALO_ALPHA = 0.12f
private val InkOnAccent = Color(0xFF0B0B12)

/** Les repères d'une piste de crans : un disque par arrêt, le choisi cerclé et nimbé, la colonne entière est la cible. */
@Composable
@Suppress("LongParameterList", "LongMethod")
internal fun StepperTrack(
    values: MeeshyStepperValues,
    stops: List<MeeshyStepperStop>,
    label: String,
    spoken: String,
    accent: Color,
    enabled: Boolean,
    onChange: (Int) -> Unit,
    onBound: (() -> Unit)?,
) {
    val haptics = rememberMeeshyHaptics()
    val tokens = MeeshyTheme.tokens
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .selectableGroup()
            .semantics { contentDescription = label; stateDescription = spoken }
            .drawBehind {
                val trackHeight = values.trackHeightDp.dp.toPx()
                val cell = size.width / stops.size
                val centerY = values.markCellDp.dp.toPx() / 2f
                fun x(index: Int) = (if (isRtl) size.width - (index + 0.5f) * cell else (index + 0.5f) * cell)
                drawLine(tokens.hairline, Offset(x(0), centerY), Offset(x(stops.lastIndex), centerY), trackHeight, StrokeCap.Round)
                if (values.selectedIndex > 0) {
                    drawLine(accent, Offset(x(0), centerY), Offset(x(values.selectedIndex), centerY), trackHeight, StrokeCap.Round)
                }
            },
    ) {
        stops.forEachIndexed { index, stop ->
            val selected = index == values.selectedIndex
            val position = stringResource(R.string.kit_stepper_position, index + 1, stops.size)
            Column(
                modifier = Modifier
                    .weight(1f)
                    .widthIn(min = values.tapTargetDp.dp)
                    .selectable(selected = selected, enabled = values.acceptsGesture, role = Role.RadioButton) {
                        if (selected) {
                            onBound?.invoke()
                        } else {
                            haptics.light()
                            onChange(index)
                        }
                    }
                    .semantics { contentDescription = "${stop.title}, $position" },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(values.markLabelGapDp.dp),
            ) {
                val mark = MeeshyStepperRecipe.markDiameter(stop.markSize?.value).dp
                Box(Modifier.size(values.markCellDp.dp), contentAlignment = Alignment.Center) {
                    if (selected) Box(Modifier.size(mark + 14.dp).clip(CircleShape).background(accent.copy(alpha = HALO_ALPHA)).decorative())
                    Box(
                        Modifier
                            .size(mark)
                            .clip(CircleShape)
                            .background(if (selected) accent else tokens.inputBackground)
                            .border(if (selected) 2.dp else 1.dp, if (selected) accent else tokens.hairline, CircleShape),
                    )
                }
                Text(
                    stop.title, color = if (selected) tokens.textPrimary else tokens.textSecondary, fontSize = 13.5.sp,
                    fontWeight = if (selected) FontWeight.ExtraBold else FontWeight.SemiBold, textAlign = TextAlign.Center, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, modifier = Modifier.decorative(),
                )
            }
        }
    }
}

/** Les jalons en lecture seule : disques reliés par une trace, à faire, fait, courant ; la trace se dessine une fois. */
@Composable
@Suppress("LongParameterList", "LongMethod")
internal fun StepperMilestones(
    values: MeeshyStepperValues,
    stops: List<MeeshyStepperStop>,
    label: String,
    accent: Color,
    animatesOnAppear: Boolean,
) {
    val reduce = LocalReduceMotion.current
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val tokens = MeeshyTheme.tokens
    val target = values.fillFraction
    val drawn = remember { Animatable(if (animatesOnAppear && !reduce) 0f else target) }
    LaunchedEffect(target, reduce) {
        if (reduce) drawn.snapTo(target) else drawn.animateTo(target, tween(TRACE_MILLIS, easing = LinearOutSlowInEasing))
    }
    val done = stringResource(R.string.kit_stepper_milestone_done)
    val current = stringResource(R.string.kit_stepper_milestone_current)
    val todo = stringResource(R.string.kit_stepper_milestone_todo)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .semantics { contentDescription = label }
            .drawBehind {
                val trackHeight = values.milestoneTraceHeightDp.dp.toPx()
                val cell = this.size.width / stops.size
                val y = values.milestoneTraceInsetDp.dp.toPx()
                fun x(fraction: Float) = (0.5f + fraction * (stops.size - 1)) * cell
                fun mirrored(x: Float) = if (isRtl) this.size.width - x else x
                drawLine(tokens.hairline, Offset(mirrored(x(0f)), y), Offset(mirrored(x(1f)), y), trackHeight, StrokeCap.Round)
                if (drawn.value > 0f) drawLine(accent, Offset(mirrored(x(0f)), y), Offset(mirrored(x(drawn.value)), y), trackHeight, StrokeCap.Round)
            },
    ) {
        stops.forEachIndexed { index, stop ->
            val state = MeeshyStepperMilestoneState.of(index, values.selectedIndex)
            val stateWord = when (state) {
                MeeshyStepperMilestoneState.Done -> done
                MeeshyStepperMilestoneState.Current -> current
                MeeshyStepperMilestoneState.Todo -> todo
            }
            val disc = values.discDiameterDp.dp
            Column(
                modifier = Modifier
                    .weight(1f)
                    .semantics(mergeDescendants = true) {
                        contentDescription = listOfNotNull(stop.title, stop.caption, stateWord).joinToString(", ")
                    },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(
                    Modifier
                        .size(disc)
                        .clip(CircleShape)
                        .background(if (state == MeeshyStepperMilestoneState.Current) accent else tokens.inputBackground)
                        .border(1.5.dp, if (state == MeeshyStepperMilestoneState.Todo) tokens.hairline else accent, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    stop.icon?.let {
                        Icon(
                            it, contentDescription = null, modifier = Modifier.size(22.dp),
                            tint = when (state) {
                                MeeshyStepperMilestoneState.Current -> InkOnAccent
                                MeeshyStepperMilestoneState.Done -> accent
                                MeeshyStepperMilestoneState.Todo -> tokens.textMuted
                            },
                        )
                    }
                }
                Text(
                    stop.title, color = tokens.textPrimary, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center,
                    maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.heightIn(min = 32.dp).padding(horizontal = 2.dp),
                )
                stop.caption?.let { Text(it, color = tokens.textSecondary, fontSize = 11.5.sp, textAlign = TextAlign.Center, maxLines = 1) }
            }
        }
    }
}
