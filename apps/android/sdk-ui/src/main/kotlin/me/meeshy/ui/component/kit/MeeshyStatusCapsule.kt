package me.meeshy.ui.component.kit

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import kotlin.math.abs
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.launch
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.motion.meeshySpec
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **La capsule qui dit un refus, une limite ou une panne** (K14) : une capsule de verre, une icône, un message sur deux
 * lignes au plus, un détail, une seule action. La FACE est pure : elle ne vibre pas à l'apparition, ne s'annonce pas, ne se
 * retire pas seule — l'hôte ([MeeshyStatusCapsuleHost]) joue haptique, annonce et minuteur. Le verre est celui de K01 :
 * dense, jamais interactif.
 *
 * - [message] vide ⇒ rien n'est rendu. Ni icône, ni détail, ni action, ni ✕ sans leur paramètre. [kind] ne colore rien.
 * - [leading] prend la place de l'icône (anneau, drapeau, point d'état).
 * - ✕ n'est dessiné que si [closeLabel] ET [onDismiss] sont passés ; avec [onDismiss], glisser de 24 dp vers [edge] ferme
 *   aussi, comme Échap quand le focus est dedans et l'action « Fermer » du lecteur d'écran.
 * - Sans action ni [onDismiss], elle ne prend aucun doigt : le toucher traverse jusqu'à la scène.
 * - [pressed] fige l'action pressée (catalogue). Le retour léger du doigt sur l'action est joué par [haptics].
 * - Lue tant qu'elle est visible : le texte (« message, détail », région vivante, assertive pour un échec), l'action, ✕.
 * - Grande police : le message passe à quatre lignes et l'action sous le texte, alignée à la fin ; RTL : l'icône au début,
 *   l'action à la fin.
 *
 * Paramètres stables, aucun état de rendu : seul le glisser et l'appui de l'action se jouent en phase de dessin.
 * Pendant iOS : `MeeshyStatusCapsule`.
 */
@Composable
public fun MeeshyStatusCapsule(
    message: String,
    modifier: Modifier = Modifier,
    detail: String? = null,
    icon: ImageVector? = null,
    kind: MeeshyStatusCapsuleKind = MeeshyStatusCapsuleKind.Info,
    action: MeeshyStatusCapsuleAction? = null,
    closeLabel: String? = null,
    onDismiss: (() -> Unit)? = null,
    edge: MeeshyStatusCapsuleEdge = MeeshyStatusCapsuleEdge.Bottom,
    tone: MeeshyGlassTone? = null,
    tint: Color? = null,
    pressed: Boolean? = null,
    haptics: MeeshyHaptics = rememberMeeshyHaptics(),
    leading: (@Composable () -> Unit)? = null,
) {
    if (!MeeshyStatusCapsuleRecipe.isVisible(message)) return
    val resolvedTone = tone ?: LocalMeeshyGlassTone.current
    val ink = if (resolvedTone == MeeshyGlassTone.Theme) MeeshyTheme.tokens.textPrimary else MeeshyMediaChromeColors.OnMedia
    val detailInk = ink.copy(alpha = MeeshyStatusCapsuleRecipe.detailInkOpacity(resolvedTone))
    val fontScale = LocalDensity.current.fontScale
    val below = action != null && MeeshyStatusCapsuleRecipe.actionIsBelowText(fontScale)
    val closeName = stringResource(R.string.common_close)
    val latestDismiss = rememberUpdatedState(onDismiss)
    val drag = rememberDismissDrag(edge = edge, isDismissible = onDismiss != null) { latestDismiss.value?.invoke() }

    Box(
        modifier = modifier
            .widthIn(max = MeeshyStatusCapsuleRecipe.maxWidth)
            .graphicsLayer { translationY = drag.offset.value }
            .then(drag.gesture)
            .then(if (onDismiss != null) Modifier.dismissOnEscapeKey { latestDismiss.value?.invoke() } else Modifier)
            .then(
                if (onDismiss != null) {
                    Modifier.semantics {
                        customActions = listOf(CustomAccessibilityAction(closeName) { latestDismiss.value?.invoke(); true })
                    }
                } else {
                    Modifier
                },
            ),
    ) {
        MeeshyGlass(
            shape = RoundedCornerShape(MeeshyStatusCapsuleRecipe.radius),
            tone = resolvedTone,
            density = MeeshyGlassDensity.Dense,
            tint = tint,
        ) {
            Box(
                Modifier.padding(
                    horizontal = MeeshyStatusCapsuleRecipe.paddingHorizontal,
                    vertical = MeeshyStatusCapsuleRecipe.paddingVertical,
                ),
            ) {
                val row: @Composable (trailingAction: MeeshyStatusCapsuleAction?, fill: Boolean) -> Unit = { trailing, fill ->
                    CapsuleRow(
                        message = message,
                        detail = detail,
                        icon = icon,
                        kind = kind,
                        trailingAction = trailing,
                        closeLabel = closeLabel,
                        isDismissible = onDismiss != null,
                        onClose = { latestDismiss.value?.invoke() },
                        fillWidth = fill,
                        ink = ink,
                        detailInk = detailInk,
                        fontScale = fontScale,
                        pressed = pressed,
                        haptics = haptics,
                        leading = leading,
                    )
                }
                if (below && action != null) {
                    Column(
                        horizontalAlignment = Alignment.End,
                        verticalArrangement = Arrangement.spacedBy(MeeshyStatusCapsuleRecipe.gap),
                    ) {
                        row(null, true)
                        ActionCapsule(action = action, pressed = pressed, haptics = haptics)
                    }
                } else {
                    row(action, false)
                }
            }
        }
    }
}

@Composable
private fun CapsuleRow(
    message: String,
    detail: String?,
    icon: ImageVector?,
    kind: MeeshyStatusCapsuleKind,
    trailingAction: MeeshyStatusCapsuleAction?,
    closeLabel: String?,
    isDismissible: Boolean,
    onClose: () -> Unit,
    fillWidth: Boolean,
    ink: Color,
    detailInk: Color,
    fontScale: Float,
    pressed: Boolean?,
    haptics: MeeshyHaptics,
    leading: (@Composable () -> Unit)?,
) {
    Row(
        modifier = if (fillWidth) Modifier.fillMaxWidth() else Modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshyStatusCapsuleRecipe.gap),
    ) {
        if (leading != null) {
            Box(Modifier.decorative()) { leading() }
        } else if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = ink,
                modifier = Modifier.size(MeeshyStatusCapsuleRecipe.iconSize),
            )
        }
        CapsuleTexts(
            message = message,
            detail = detail,
            kind = kind,
            ink = ink,
            detailInk = detailInk,
            lines = MeeshyStatusCapsuleRecipe.messageLines(fontScale),
            modifier = Modifier.weight(1f, fill = false),
        )
        if (trailingAction != null) ActionCapsule(action = trailingAction, pressed = pressed, haptics = haptics)
        if (closeLabel != null && isDismissible) CloseButton(label = closeLabel, ink = ink, onClose = onClose)
    }
}

@Composable
private fun CapsuleTexts(
    message: String,
    detail: String?,
    kind: MeeshyStatusCapsuleKind,
    ink: Color,
    detailInk: Color,
    lines: Int,
    modifier: Modifier,
) {
    val shownDetail = MeeshyStatusCapsuleRecipe.visibleDetail(detail)
    val spoken = MeeshyStatusCapsuleRecipe.spokenText(message = message, detail = detail)
    val urgent = kind.announcesUrgently
    Column(
        modifier = modifier.clearAndSetSemantics {
            contentDescription = spoken
            liveRegion = if (urgent) LiveRegionMode.Assertive else LiveRegionMode.Polite
        },
    ) {
        Text(
            text = message,
            style = TextStyle(
                fontSize = MeeshyStatusCapsuleRecipe.messageSize,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Start,
            ),
            color = ink,
            maxLines = lines,
            overflow = TextOverflow.Ellipsis,
        )
        if (shownDetail != null) {
            Text(
                text = shownDetail,
                style = TextStyle(
                    fontSize = MeeshyStatusCapsuleRecipe.detailSize,
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Start,
                ),
                color = detailInk,
                maxLines = lines,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * L'action : blanc plein de 36 dp, encre `Indigo950`, à 78 % sous le doigt ; le relâcher joue un retour léger puis appelle
 * [MeeshyStatusCapsuleAction.onClick] une seule fois. L'appui se peint en phase de dessin : l'action ne se recompose pas.
 * La zone sensible est élargie à 48 dp par la plateforme (`minimumTouchTargetSize`) sans rien changer au dessin.
 */
@Composable
private fun ActionCapsule(action: MeeshyStatusCapsuleAction, pressed: Boolean?, haptics: MeeshyHaptics) {
    val source = remember { MutableInteractionSource() }
    val isPressed = source.collectIsPressedAsState()
    val latest = rememberUpdatedState(action)
    Row(
        modifier = Modifier
            .heightIn(min = MeeshyStatusCapsuleRecipe.actionHeight)
            .clip(CircleShape)
            .drawBehind {
                val alpha = if (pressed ?: isPressed.value) MeeshyStatusCapsuleRecipe.ACTION_PRESSED_OPACITY else 1f
                drawRect(MeeshyMediaChromeColors.OnMedia.copy(alpha = alpha))
            }
            .clickable(interactionSource = source, indication = null, role = Role.Button) {
                haptics.light()
                latest.value.onClick()
            }
            .padding(horizontal = MeeshyStatusCapsuleRecipe.actionPaddingHorizontal),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshyStatusCapsuleRecipe.actionGap, Alignment.CenterHorizontally),
    ) {
        action.icon?.let { glyph ->
            Icon(
                imageVector = glyph,
                contentDescription = null,
                tint = MeeshyPalette.Indigo950,
                modifier = Modifier.size(MeeshyStatusCapsuleRecipe.actionGlyphSize),
            )
        }
        Text(
            text = action.label,
            style = TextStyle(fontSize = MeeshyStatusCapsuleRecipe.actionSize, fontWeight = FontWeight.Bold),
            color = MeeshyPalette.Indigo950,
        )
    }
}

/** ✕ : dessiné en 28 dp, touché en 48 ; son nom accessible est [label]. */
@Composable
private fun CloseButton(label: String, ink: Color, onClose: () -> Unit) {
    Box(
        modifier = Modifier
            .size(MeeshyStatusCapsuleRecipe.closeSize)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClose)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = MeeshyIcons.Close,
            contentDescription = null,
            tint = ink,
            modifier = Modifier.size(MeeshyStatusCapsuleRecipe.closeGlyphSize),
        )
    }
}

/** Échap, quand le focus est dans la capsule (l'action ou ✕) : la touche ferme. Aucun arrêt de focus ajouté. */
private fun Modifier.dismissOnEscapeKey(onDismiss: () -> Unit): Modifier = onPreviewKeyEvent { event ->
    val isEscape = event.key == Key.Escape && event.type == KeyEventType.KeyUp
    if (isEscape) onDismiss()
    isEscape
}

/**
 * Le glisser pour fermer : elle suit le doigt vers son bord seulement, se ferme au seuil de 24 dp, revient par le ressort
 * rapide en dessous (posée d'un coup sous « réduire les animations »). Le décalage se lit en phase de dessin.
 */
private class DismissDrag(val offset: Animatable<Float, AnimationVector1D>, val gesture: Modifier)

@Composable
private fun rememberDismissDrag(edge: MeeshyStatusCapsuleEdge, isDismissible: Boolean, onDismiss: () -> Unit): DismissDrag {
    val offset = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val reduceMotion = LocalReduceMotion.current
    val latestDismiss = rememberUpdatedState(onDismiss)
    val gesture = if (!isDismissible) {
        Modifier
    } else {
        Modifier.pointerInput(edge, density.density, reduceMotion) {
            var total = 0f
            var seeded = false
            val slop = viewConfiguration.touchSlop
            val restore: () -> Unit = {
                scope.launch { offset.animateTo(0f, meeshySpec(reduce = reduceMotion, full = MeeshyMotion.springFast())) }
            }
            detectVerticalDragGestures(
                onDragStart = {
                    total = 0f
                    seeded = false
                },
                onDragEnd = {
                    val translationDp = abs(MeeshyStatusCapsuleRecipe.dragOffset(total, edge)) / density.density
                    if (translationDp >= MeeshyStatusCapsuleRecipe.dismissThreshold.value) latestDismiss.value() else restore()
                },
                onDragCancel = restore,
                onVerticalDrag = { change, amount ->
                    change.consume()
                    if (!seeded) {
                        total = if (amount >= 0f) slop else -slop
                        seeded = true
                    }
                    total += amount
                    scope.launch(start = CoroutineStart.UNDISPATCHED) {
                        offset.snapTo(MeeshyStatusCapsuleRecipe.dragOffset(total, edge))
                    }
                },
            )
        }
    }
    return remember(offset, gesture) { DismissDrag(offset, gesture) }
}
