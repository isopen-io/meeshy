package me.meeshy.app.calls

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.call.CallChromeInteraction
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** The visual state of a pill button: active = solid white disc and dark glyph, End = red, auto-pause = amber glyph. */
internal enum class CallPillKind { Normal, Active, Destructive, Warning }

/** The flat disc of ONE button of the glass block (mirrors iOS `CallButtonFill`). */
internal object CallButtonFill {
    private val Neutral = Color.White.copy(alpha = 0.16f)
    private val Pressed = Color.White.copy(alpha = 0.22f)

    const val PRESSED_SCALE: Float = 0.88f
    const val MIN_TARGET_DP: Float = 48f

    fun color(kind: CallPillKind): Color = when (kind) {
        CallPillKind.Normal, CallPillKind.Warning -> Neutral
        CallPillKind.Active -> Color.White
        CallPillKind.Destructive -> MeeshyPalette.Error
    }

    fun glyph(kind: CallPillKind): Color = when (kind) {
        CallPillKind.Normal, CallPillKind.Destructive -> Color.White
        CallPillKind.Active -> MeeshyPalette.Indigo950
        CallPillKind.Warning -> MeeshyPalette.Warning
    }

    fun pressedHighlight(isPressed: Boolean): Color = if (isPressed) Pressed else Color.Transparent

    fun pressScale(isPressed: Boolean, reduceMotion: Boolean): Float =
        if (isPressed && !reduceMotion) PRESSED_SCALE else 1f
}

/** Where a button reports the finger put down / lifted, to arm or hold the chrome. `null` = nobody listens. */
internal val LocalCallChromeInteraction = staticCompositionLocalOf<((CallChromeInteraction) -> Unit)?> { null }

/** The round glyph of a pill button, on its flat disc. */
@Composable
internal fun CallPillGlyph(icon: ImageVector, kind: CallPillKind, diameter: Dp, isPressed: Boolean) {
    Box(
        modifier = Modifier
            .size(diameter)
            .clip(CircleShape)
            .background(CallButtonFill.color(kind))
            .background(CallButtonFill.pressedHighlight(isPressed)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = CallButtonFill.glyph(kind), modifier = Modifier.size(diameter * 0.45f))
    }
}

/**
 * One button of the pill: glyph + optional caption. The target stays at least 48 dp, the press
 * shrinks the disc to 0.88 (a plain lightening with « reduce animations »), a light haptic marks
 * the finger down, and the label / hint / toggle state are announced as one element.
 */
@Composable
internal fun CallPillButton(
    icon: ImageVector,
    kind: CallPillKind,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    caption: String? = null,
    hint: String? = null,
    toggleState: Boolean? = null,
    diameter: Dp = 48.dp,
) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val reduceMotion = rememberCallReduceMotion()
    val scale by animateFloatAsState(
        targetValue = CallButtonFill.pressScale(pressed, reduceMotion),
        animationSpec = if (pressed) tween(0) else spring(dampingRatio = 0.7f, stiffness = 400f),
        label = "callPillPress",
    )
    val haptics = LocalHapticFeedback.current
    val report = LocalCallChromeInteraction.current
    LaunchedEffect(pressed) {
        if (pressed) haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        report?.invoke(if (pressed) CallChromeInteraction.TouchBegan else CallChromeInteraction.TouchEnded)
    }
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = modifier
            .defaultMinSize(minWidth = CallButtonFill.MIN_TARGET_DP.dp, minHeight = CallButtonFill.MIN_TARGET_DP.dp)
            .clickable(interactionSource = source, indication = null, onClickLabel = hint, role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) {
                contentDescription = label
                toggleState?.let { toggleableState = ToggleableState(it) }
            },
    ) {
        Box(Modifier.scale(scale).clearAndSetSemantics { }) {
            CallPillGlyph(icon, kind, diameter, pressed)
        }
        if (caption != null) {
            Text(
                text = caption,
                color = MeeshyMediaChromeColors.OnMediaSecondary,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier.clearAndSetSemantics { },
            )
        }
    }
}

/**
 * The glass block of the pill: ONE surface that grows with what it holds (open panel or family
 * rows, then the base row). A dark veil under it keeps the captions legible over a bright picture.
 */
@Composable
internal fun CallControlsGlass(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(CALL_PILL_RADIUS)
    MeeshyGlassSurface(modifier = modifier, shape = shape) {
        Column(Modifier.fillMaxWidth().background(Color.Black.copy(alpha = 0.2f), shape).clip(shape), content = content)
    }
}

/** The fine line between the unfolded rows and the base row. */
@Composable
internal fun CallPillHairline() {
    Spacer(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg)
            .height(0.5.dp)
            .background(Color.White.copy(alpha = 0.14f))
            .clearAndSetSemantics { },
    )
}

internal val CALL_PILL_RADIUS: Dp = 32.dp
