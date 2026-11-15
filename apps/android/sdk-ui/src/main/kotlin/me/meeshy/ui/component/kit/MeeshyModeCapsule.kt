package me.meeshy.ui.component.kit

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Ce que l'en-tête dit à ses capsules quand il ne tient plus : la capsule qui a un glyphe n'en montre que lui, et les
 * libellés peuvent descendre à 80 % avant de se tronquer. Au repos : rien ne se réduit.
 */
@Immutable
internal data class MeeshyModeCapsuleFit(val reducesToGlyph: Boolean = false, val labelScale: Float = 1f)

internal val LocalMeeshyModeFit: ProvidableCompositionLocal<MeeshyModeCapsuleFit> = compositionLocalOf { MeeshyModeCapsuleFit() }

/**
 * Un appui figé, pour la tuile « pressée » du catalogue et des instantanés (un doigt ne se tient pas hors écran) : il
 * prime sur le doigt. `null` : c'est le doigt qui parle. Pendant iOS : `meeshyModeFixedPress`.
 */
public val LocalMeeshyModeFixedPress: ProvidableCompositionLocal<Boolean?> = compositionLocalOf { null }

private val CapsuleShape = RoundedCornerShape(percent = 50)

/**
 * **Une capsule à libellé d'un mode plein écran** (K16) : « Quitter » ou le centre sur verre `dense` de K01, la
 * validation en plein blanc (fond, encre et ombre de l'actif de K02). Le nom est toujours dit au lecteur d'écran, même
 * réduite à la coche ; jamais de légende dessous.
 *
 * - Toucher : [onClick] part une fois, au relâcher ; rien si [enabled] est faux ou si elle est [busy]. UN impact léger par
 *   le site unique de K02 ([MeeshyGlassButtonHaptic.None] quand l'hôte joue le sien).
 * - Occupée : la roue du système remplace le glyphe (ou le titre), la largeur est gardée, la valeur dite est « En cours ».
 * - Hauteur visible 44 dp, cible tactile 48 dp.
 *
 * Pendant iOS : `MeeshyModeCapsule`.
 */
@Composable
public fun MeeshyModeCapsule(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    kind: MeeshyModeCapsuleKind = MeeshyModeCapsuleKind.Glass,
    display: MeeshyModeCapsuleDisplay = MeeshyModeCapsuleDisplay.Title,
    busy: Boolean = false,
    enabled: Boolean = true,
    hint: String? = null,
    haptic: MeeshyGlassButtonHaptic = MeeshyGlassButtonHaptic.Light,
) {
    require(title.isNotEmpty()) { "MeeshyModeCapsule : le nom est obligatoire et non vide, même en coche" }
    val values = remember(title, icon, display, hint, enabled, busy, haptic) {
        MeeshyModeActionValues(title, icon, display, hint, enabled, busy, haptic)
    }
    MeeshyModeCapsuleContent(values = values, kind = kind, onClick = onClick, modifier = modifier)
}

/** La capsule sur ses VALEURS : l'en-tête la monte ainsi, et ne la recompose pas à valeurs égales. */
@Composable
internal fun MeeshyModeCapsuleContent(
    values: MeeshyModeActionValues,
    kind: MeeshyModeCapsuleKind,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val fit = LocalMeeshyModeFit.current
    val fixedPress = LocalMeeshyModeFixedPress.current
    val hostTone = LocalMeeshyGlassTone.current
    val source = remember { MutableInteractionSource() }
    val haptics = rememberMeeshyHaptics()
    val play: (MeeshyGlassButtonHaptic) -> Unit = remember(haptics) { { _ -> haptics.light() } }
    val latestClick by rememberUpdatedState(onClick)
    val rest = remember(kind, values.enabled, values.busy) {
        MeeshyModeCapsuleStyle.resolve(kind, isPressed = false, isEnabled = values.enabled, isBusy = values.busy)
    }
    val pressedStyle = remember(kind, values.enabled, values.busy) {
        MeeshyModeCapsuleStyle.resolve(kind, isPressed = true, isEnabled = values.enabled, isBusy = values.busy)
    }
    val sourcePressed = source.collectIsPressedAsState()
    val display = MeeshyModeChromeRecipe.effectiveDisplay(
        if (fit.reducesToGlyph && values.icon != null) MeeshyModeCapsuleDisplay.Glyph else values.display,
        hasGlyph = values.icon != null,
    )
    val ink = when {
        kind == MeeshyModeCapsuleKind.Solid -> MeeshyPalette.Indigo950
        hostTone == MeeshyGlassTone.Theme -> MeeshyTheme.tokens.textPrimary
        else -> MeeshyMediaChromeColors.OnMedia
    }
    val busyWord = if (values.busy) stringResource(R.string.kit_progress_ring_busy) else null

    val gesture = Modifier
        .clickable(
            interactionSource = source,
            indication = null,
            enabled = values.enabled,
            onClickLabel = values.hint,
            role = Role.Button,
            onClick = { values.perform(play) { latestClick() } },
        )
        .semantics(mergeDescendants = true) {
            contentDescription = values.title
            if (busyWord != null) stateDescription = busyWord
        }

    Box(
        modifier = modifier.minimumInteractiveComponentSize().then(gesture),
        contentAlignment = Alignment.Center,
    ) {
        val face = Modifier
            .heightIn(min = MeeshyModeChromeRecipe.capsuleHeight.dp)
            .widthIn(min = MeeshyModeChromeRecipe.capsuleHeight.dp)
            .then(if (rest.opacity < 1f) Modifier.alpha(rest.opacity) else Modifier)
        when (kind) {
            MeeshyModeCapsuleKind.Glass -> MeeshyGlass(
                modifier = face,
                shape = CapsuleShape,
                density = MeeshyGlassDensity.Dense,
                interactionSource = if (rest.respondsToTouch) source else null,
                pressed = if (rest.respondsToTouch) fixedPress else null,
            ) {
                CapsuleContent(values, display, fit.labelScale, ink)
            }
            MeeshyModeCapsuleKind.Solid -> Box(
                modifier = face
                    .then(solidShadow(rest))
                    .drawBehind {
                        val live = if (fixedPress ?: sourcePressed.value) pressedStyle else rest
                        drawRoundRect(
                            color = MeeshyMediaChromeColors.OnMedia.copy(alpha = live.fillOpacity),
                            cornerRadius = CornerRadius(size.minDimension / 2f),
                        )
                    },
                contentAlignment = Alignment.Center,
            ) {
                CapsuleContent(values, display, fit.labelScale, ink)
            }
        }
    }
}

@Composable
private fun solidShadow(style: MeeshyModeCapsuleStyle): Modifier {
    val shadow = style.shadow ?: return Modifier
    val color: Color = MeeshyMediaChromeColors.MediaBackdrop.copy(alpha = shadow.opacity)
    return Modifier.shadow(elevation = shadow.radiusDp.dp, shape = CapsuleShape, clip = false, ambientColor = color, spotColor = color)
}

/** Le glyphe et le titre, ou la roue du système quand la capsule est occupée : la largeur est gardée. */
@Composable
private fun CapsuleContent(values: MeeshyModeActionValues, display: MeeshyModeCapsuleDisplay, labelScale: Float, ink: Color) {
    val hasGlyph = display != MeeshyModeCapsuleDisplay.Title
    val hasTitle = display != MeeshyModeCapsuleDisplay.Glyph
    Box(
        modifier = Modifier.padding(horizontal = MeeshyModeChromeRecipe.capsuleMargin.dp).clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        if (values.busy && !hasGlyph) {
            CapsuleTitle(values.title, labelScale, ink, Modifier.alpha(0f))
            Spinner(MeeshyModeChromeRecipe.glyphSize, ink)
        } else {
            Row(
                horizontalArrangement = Arrangement.spacedBy(MeeshyModeChromeRecipe.glyphGap.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (hasGlyph) CapsuleGlyph(values, display, ink)
                if (hasTitle) CapsuleTitle(values.title, labelScale, ink, Modifier)
            }
        }
    }
}

@Composable
private fun CapsuleGlyph(values: MeeshyModeActionValues, display: MeeshyModeCapsuleDisplay, ink: Color) {
    val side = if (display == MeeshyModeCapsuleDisplay.Glyph) MeeshyModeChromeRecipe.checkSize else MeeshyModeChromeRecipe.glyphSize
    if (values.busy) {
        Spinner(side, ink)
    } else {
        values.icon?.let { Icon(imageVector = it, contentDescription = null, modifier = Modifier.size(side.dp), tint = ink) }
    }
}

@Composable
private fun CapsuleTitle(title: String, labelScale: Float, ink: Color, modifier: Modifier) {
    Text(
        text = title,
        modifier = modifier,
        color = ink,
        fontSize = MeeshyFontSize.body * labelScale,
        fontWeight = FontWeight.Bold,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
private fun Spinner(side: Float, ink: Color) {
    CircularProgressIndicator(modifier = Modifier.size(side.dp), color = ink, strokeWidth = SPINNER_STROKE)
}

private val SPINNER_STROKE = 2.dp
