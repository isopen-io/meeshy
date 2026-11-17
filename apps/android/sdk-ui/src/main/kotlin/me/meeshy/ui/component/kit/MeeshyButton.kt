package me.meeshy.ui.component.kit

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.onClick as semanticsOnClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.accessibility.meeshyTapTarget
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyMotionHaptic
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val SPINNER_STROKE_DP = 2

/**
 * **Le bouton libellé** (K40) : une capsule qui porte un verbe et répond au doigt, sans savoir ce que le verbe déclenche. Sept
 * genres, quatre hauteurs, largeur ajustée ou pleine, glyphe de tête, emplacement de fin, et les formes [MeeshyButtonShape.Round]
 * (carré-arrondi de 56, rayon 18 sur Android) et [MeeshyButtonShape.Hold] (disque de 96 à maintenir).
 *
 * - [isPending] : l'indicateur prend la place du glyphe, la largeur ne bouge pas, un second toucher ne part pas.
 * - [enabled] faux : contenu à 45 %, ni action ni tic ; [disabledReason] s'écrit sous le bouton et se lit après son nom.
 * - [isDeferred] : le bouton reste actif, l'action est mise en file par l'app ; l'horloge dit « sera envoyé ».
 * - `hold` : [holdState] est remis par l'hôte, le bouton rapporte [onHoldChange] (maintenu ou relâché), rien d'autre.
 * - Le genre [MeeshyButtonKind.Glass] rend ici la surface tonale du thème (aucun flou sur Android).
 * - Le tic léger part au toucher par le site unique d'haptique ; [pressed] fige l'état pressé (catalogue).
 *
 * Jumeau iOS : `MeeshyButton`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyButton(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    kind: MeeshyButtonKind = MeeshyButtonKind.Primary,
    size: MeeshyButtonSize = MeeshyButtonSize.S50,
    shape: MeeshyButtonShape = MeeshyButtonShape.Capsule,
    width: MeeshyButtonWidth = MeeshyButtonWidth.Fit,
    tint: Color? = null,
    isDestructive: Boolean = false,
    isPending: Boolean = false,
    isDeferred: Boolean = false,
    enabled: Boolean = true,
    disabledReason: String? = null,
    pressed: Boolean? = null,
    holdState: MeeshyButtonHoldState = MeeshyButtonHoldState.Idle,
    onHoldChange: ((Boolean) -> Unit)? = null,
    haptics: MeeshyHaptics = rememberMeeshyHaptics(),
    glyph: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    badge: (@Composable () -> Unit)? = null,
) {
    val reduce = LocalReduceMotion.current
    val interaction = remember { MutableInteractionSource() }
    val livePressed by interaction.collectIsPressedAsState()
    val focused by interaction.collectIsFocusedAsState()
    val isHold = shape == MeeshyButtonShape.Hold
    val holdLaw = remember { MeeshyButtonHoldLaw() }
    val shownPressed = pressed ?: if (isHold) MeeshyButtonHoldRule.isHeld(holdState) else livePressed
    val values = MeeshyButtonRecipe.resolve(
        kind, size, shape, isPressed = shownPressed, isFocused = focused, isEnabled = enabled,
        isPending = isPending, isDestructive = isDestructive, hasTrailing = trailing != null, hasTint = tint != null,
    )
    val scale by animateFloatAsState(values.scale, MeeshyMotion.springFast(), label = "button-press")
    val colors = buttonColors(values, tint)
    val busyName = stringResource(R.string.kit_button_busy)
    val deferredName = stringResource(R.string.kit_button_deferred)
    val baseName = MeeshyButtonRecipe.spokenName(title, disabledReason, busyName, isPending, enabled)
    val spoken = if (isDeferred) "$baseName, $deferredName" else baseName
    val latestClick = rememberUpdatedState(onClick)
    val latestHold = rememberUpdatedState(onHoldChange)
    val latestPlaysHaptic = rememberUpdatedState(values.playsHaptic)
    fun play() {
        if (latestPlaysHaptic.value) MeeshyMotion.play(MeeshyMotionHaptic.Light, haptics)
    }
    fun report(edge: Boolean?) {
        edge?.let { latestHold.value?.invoke(it) }
    }
    if (isHold) {
        DisposableEffect(holdLaw) {
            onDispose { report(holdLaw.cancel()) }
        }
    }
    val clipShape = RoundedCornerShape(values.cornerRadiusDp.dp)

    Column(modifier = modifier.let { if (width == MeeshyButtonWidth.Fill) it.fillMaxWidth() else it }, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .let { if (width == MeeshyButtonWidth.Fill && !isHold) it.fillMaxWidth() else it }
                .meeshyTapTarget()
                .graphicsLayer { scaleX = scale; scaleY = scale }
                .let { m ->
                    if (isHold) {
                        m.pointerInput(enabled) {
                            if (!enabled) return@pointerInput
                            awaitEachGesture {
                                awaitFirstDown()
                                val began = holdLaw.press()
                                if (began != null) play()
                                report(began)
                                try {
                                    waitForUpOrCancellation()
                                } finally {
                                    report(holdLaw.release())
                                }
                            }
                        }.focusable(enabled, interaction)
                    } else {
                        m.clickable(
                            interactionSource = interaction,
                            indication = null,
                            enabled = enabled,
                            role = Role.Button,
                        ) {
                            if (values.firesAction) {
                                play()
                                latestClick.value()
                            }
                        }
                    }
                }
                .semantics(mergeDescendants = true) {
                    contentDescription = spoken
                    role = Role.Button
                    if (!enabled) disabled()
                    if (isHold && enabled) {
                        semanticsOnClick(label = null) {
                            report(holdLaw.toggle())
                            true
                        }
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            Row(
                modifier = Modifier
                    .let { if (values.widthDp != null) it.width(values.widthDp.dp) else it }
                    .let { if (width == MeeshyButtonWidth.Fill && !isHold) it.fillMaxWidth() else it }
                    .height(values.heightDp.dp)
                    .alpha(values.contentOpacity)
                    .clip(clipShape)
                    .background(colors.background)
                    .let { if (colors.border != null) it.border(MeeshyButtonRecipe.OUTLINE_DP.dp, colors.border, clipShape) else it }
                    .let { if (values.focusRingDp > 0) it.border(values.focusRingDp.dp, colors.ring, clipShape) else it }
                    .padding(start = values.horizontalPaddingDp.dp, end = values.endPaddingDp.dp),
                horizontalArrangement = Arrangement.spacedBy(MeeshyButtonRecipe.GAP_DP.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ButtonGlyph(values, colors.ink, icon, glyph, isPending)
                if (values.showsTitle) {
                    Text(
                        text = title,
                        color = colors.ink,
                        fontSize = values.titleSp.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Clip,
                        softWrap = false,
                    )
                }
                trailing?.let { Box(Modifier.decorative()) { it() } }
                when {
                    badge != null -> badge()
                    isDeferred -> Box(Modifier.decorative()) {
                        MeeshyBadge(MeeshyBadgeContent.Glyph, leading = MeeshyBadgeLeading.Icon(MeeshyIcons.Schedule), size = MeeshyBadgeSize.S18)
                    }
                }
            }
        }
        if (!enabled && !disabledReason.isNullOrBlank()) {
            Text(
                text = disabledReason,
                color = MeeshyTheme.tokens.textSecondary,
                fontSize = 12.5f.sp,
                modifier = Modifier.padding(top = 6.dp).decorative(),
            )
        }
    }
}

@Composable
private fun ButtonGlyph(values: MeeshyButtonValues, ink: Color, icon: ImageVector?, glyph: (@Composable () -> Unit)?, isPending: Boolean) {
    when {
        isPending -> CircularProgressIndicator(
            modifier = Modifier.size(values.glyphDp.dp).decorative(),
            color = ink,
            strokeWidth = SPINNER_STROKE_DP.dp,
        )
        glyph != null -> Box(Modifier.size(values.glyphDp.dp).decorative(), contentAlignment = Alignment.Center) { glyph() }
        icon != null -> Icon(icon, contentDescription = null, tint = ink, modifier = Modifier.size(values.glyphDp.dp).decorative())
    }
}

private data class ButtonColors(val background: Color, val ink: Color, val border: Color?, val ring: Color)

@Composable
private fun buttonColors(values: MeeshyButtonValues, tint: Color?): ButtonColors {
    val tokens = MeeshyTheme.tokens
    val accent = tint ?: if (values.kind == MeeshyButtonKind.Accent) MeeshyPalette.Indigo400 else MeeshyPalette.Indigo500
    val base = if (values.kind == MeeshyButtonKind.Danger) tokens.error else accent
    val ink = when (values.ink) {
        MeeshyButtonInk.OnSolid -> MeeshyPalette.White
        MeeshyButtonInk.Tint -> accent
        MeeshyButtonInk.Error -> tokens.error
        MeeshyButtonInk.Neutral -> tokens.textPrimary
    }
    val background = when (values.fill) {
        MeeshyButtonFill.Solid -> base
        MeeshyButtonFill.Soft -> base.copy(alpha = values.softAlpha)
        MeeshyButtonFill.Surface -> tokens.surfaceFill
        MeeshyButtonFill.Outline, MeeshyButtonFill.None -> Color.Transparent
    }
    val border = if (values.fill == MeeshyButtonFill.Outline) tokens.hairline else null
    return ButtonColors(background, ink, border, ink)
}

/** La paire : deux boutons sur une ligne, parts 1,6 et 1, même hauteur ; la police grande les empile, le principal en haut. */
@Composable
public fun MeeshyButtonPair(
    primary: @Composable (Modifier) -> Unit,
    secondary: @Composable (Modifier) -> Unit,
    modifier: Modifier = Modifier,
) {
    val fontScale = androidx.compose.ui.platform.LocalDensity.current.fontScale
    val gap = MeeshyButtonPairRule.GAP_DP.dp
    if (MeeshyButtonPairRule.stacks(fontScale)) {
        Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(gap)) {
            primary(Modifier.fillMaxWidth())
            secondary(Modifier.fillMaxWidth())
        }
    } else {
        Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(gap)) {
            primary(Modifier.weight(MeeshyButtonPairRule.PRIMARY_WEIGHT))
            secondary(Modifier.weight(MeeshyButtonPairRule.SECONDARY_WEIGHT))
        }
    }
}
