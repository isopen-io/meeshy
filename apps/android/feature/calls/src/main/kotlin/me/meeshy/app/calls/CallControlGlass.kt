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
import androidx.compose.foundation.layout.BoxScope
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
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
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
import me.meeshy.sdk.model.call.CallButtonGlassRule
import me.meeshy.sdk.model.call.CallButtonGlassSurface
import me.meeshy.sdk.model.call.CallButtonGlassTreatment
import me.meeshy.sdk.model.call.CallButtonRole
import me.meeshy.sdk.model.call.CallChromeInteraction
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** The visual state of a pill button: active = solid white disc and dark glyph, End = red, auto-pause = amber glyph. */
internal enum class CallPillKind { Normal, Active, Destructive, Warning }

/** Le rôle de verre d'un bouton (`CallButtonGlassRule`) : la pause automatique est neutre, son ambre est celui du glyphe. */
internal fun CallPillKind.glassRole(): CallButtonRole = when (this) {
    CallPillKind.Normal, CallPillKind.Warning -> CallButtonRole.Neutral
    CallPillKind.Active -> CallButtonRole.Active
    CallPillKind.Destructive -> CallButtonRole.Destructive
}

/**
 * Ce qui habille le verre d'UN bouton (iOS `CallButtonFill` + `CallButtonGlassModifier`), plus le ton adaptatif de la
 * loi 3 que iOS ne porte pas encore. Le choix du verre vient de [CallButtonGlassRule] ; ici ne restent que les valeurs.
 */
internal object CallButtonFill {
    private val Pressed = Color.White.copy(alpha = 0.22f)

    const val PRESSED_SCALE: Float = 0.88f
    const val MIN_TARGET_DP: Float = 48f

    /** Le lavis du verre : clair sur une image, rouge pour Fin, aucun pour l'actif (son blanc plein le couvre) ni sur un écran reçu (son voile sombre). */
    fun glassTint(treatment: CallButtonGlassTreatment, tone: CallGlassTone = CallGlassTone.OverPicture): Color? = when {
        treatment.surface == CallButtonGlassSurface.ProminentRed -> MeeshyPalette.Error
        treatment.hasSolidWhiteBacking || tone.isDarkFill -> null
        else -> CallPalette.Ink
    }

    /**
     * Ce qui est posé SOUS le glyphe, dans le verre : le blanc plein de l'actif, le rouge plein de Fin, et sur un écran
     * REÇU le voile sombre d'un bouton inactif (loi 3). Sur une image, un bouton neutre n'a que son verre.
     */
    fun backing(treatment: CallButtonGlassTreatment, tone: CallGlassTone = CallGlassTone.OverPicture): Color = when {
        treatment.hasSolidWhiteBacking -> Color.White
        treatment.surface == CallButtonGlassSurface.ProminentRed -> MeeshyPalette.Error
        tone.isDarkFill -> tone.neutralFill
        else -> Color.Transparent
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

/**
 * The round glyph of a pill button, on ITS OWN glass disc (#17323) : [CallGlassButtonSurface] carries the treatment
 * [CallButtonGlassRule] picks. The glass does not answer the finger by itself, so it lightens under it.
 */
@Composable
internal fun CallPillGlyph(icon: ImageVector, kind: CallPillKind, diameter: Dp, isPressed: Boolean) {
    CallGlassButtonSurface(
        role = kind.glassRole(),
        shape = CircleShape,
        isPressed = isPressed,
        modifier = Modifier.size(diameter),
    ) {
        Icon(icon, contentDescription = null, tint = CallButtonFill.glyph(kind), modifier = Modifier.size(diameter * 0.45f))
    }
}

/** Un bouton refusé pendant une prise ou un film se lit atténué (SwiftUI `.disabled`). */
private const val DISABLED_ALPHA = 0.4f

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
    enabled: Boolean = true,
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
            .alpha(if (enabled) 1f else DISABLED_ALPHA)
            .clickable(enabled = enabled, interactionSource = source, indication = null, onClickLabel = hint, role = Role.Button, onClick = onClick)
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
 * LE verre de l'écran d'appel : l'unique entrée vers [MeeshyGlassSurface] de ce module, pour le bloc de la pilule,
 * le disque de chaque bouton et la capsule de l'en-tête. Trois besoins, un seul site de dessin.
 */
@Composable
internal fun CallGlassPlate(
    modifier: Modifier = Modifier,
    shape: Shape,
    tint: Color? = null,
    liquid: Boolean = false,
    content: @Composable BoxScope.() -> Unit,
) {
    MeeshyGlassSurface(modifier = modifier, shape = shape, tint = tint, liquid = liquid, content = content)
}

/**
 * #17323 — le verre de N'IMPORTE QUEL bouton de l'appel : disque de la pilule et de l'en-tête, mais aussi les boutons
 * voisins (« Non merci », « Refuser », « Message », puces d'ambiance, son et bascules de l'aperçu). La loi pure
 * [CallButtonGlassRule] choisit, [CallGlassPlate] dessine, le ton de la loi 3 ([LocalCallGlassTone]) habille, et le
 * verre s'éclaircit sous le doigt. Le contenu est centré ; la taille vient de [modifier] ou du contenu.
 */
@Composable
internal fun CallGlassButtonSurface(
    role: CallButtonRole,
    shape: Shape,
    isPressed: Boolean,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    val treatment = CallButtonGlassRule.treatment(role)
    val tone = LocalCallGlassTone.current
    CallGlassPlate(
        modifier = modifier,
        shape = shape,
        tint = CallButtonFill.glassTint(treatment, tone),
        liquid = treatment.isInteractive,
    ) {
        Box(
            Modifier
                .matchParentSize()
                .background(CallButtonFill.backing(treatment, tone))
                .background(CallButtonFill.pressedHighlight(isPressed && treatment.drawsPressHighlight)),
        )
        Box(Modifier.align(Alignment.Center), contentAlignment = Alignment.Center, content = content)
    }
}

/**
 * The glass block of the pill: ONE surface that grows with what it holds (open panel or family
 * rows, then the base row). A dark veil under it keeps the captions legible over a bright picture, denser over a received
 * screen ([LocalCallGlassTone], law 3) ; each button inside is its own glass disc ([CallPillGlyph]), which keeps the
 * light tone ([CallGlassTone.withinVeiledBlock]). The same block, capsule-shaped, is each rail of a duo (#17327).
 */
@Composable
internal fun CallControlsGlass(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(CALL_PILL_RADIUS),
    content: @Composable ColumnScope.() -> Unit,
) {
    CallGlassPlate(modifier = modifier, shape = shape) {
        val tone = LocalCallGlassTone.current
        CompositionLocalProvider(LocalCallGlassTone provides tone.withinVeiledBlock) {
            Column(Modifier.fillMaxWidth().background(tone.veil(tone.veilAlpha), shape).clip(shape), content = content)
        }
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
