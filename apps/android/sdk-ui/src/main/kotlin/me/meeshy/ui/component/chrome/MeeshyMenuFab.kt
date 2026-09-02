package me.meeshy.ui.component.chrome

import androidx.compose.animation.core.EaseOutBack
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.util.lerp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import me.meeshy.sdk.model.chrome.MenuAnchorBounds
import me.meeshy.sdk.model.chrome.menuPopupOffset
import me.meeshy.sdk.model.chrome.unreadBadgeLabel
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** One action in the [MeeshyMenuFab] — an icon, a label, an accent colour, and an
 *  optional unread/pending badge. Opaque data so the atom stays product-agnostic. */
public data class RadialMenuItem(
    val icon: ImageVector,
    val label: String,
    val color: Color,
    val badgeCount: Int = 0,
    val onSelect: () -> Unit,
)

/**
 * The floating action menu (parity plan §4.2 "menu radial"), version ancree :
 * le bouton reste une pastille 56dp deplacable, et le menu deploye vit dans un
 * [Popup] positionne par la geometrie PURE de `core:model` ([menuPopupOffset]).
 *
 * Pourquoi un Popup et non une colonne debordante : le bouton est colle a un bord
 * par l'aimantation, donc une colonne qui deborde de son gabarit sort de l'ecran —
 * observe sur emulateur, tous les libelles etaient coupes. Le Popup recoit la
 * taille reelle du menu et la taille de la fenetre, et la geometrie le RAMENE
 * entierement dans le viewport, quel que soit l'endroit ou l'utilisateur a laisse
 * la pastille.
 *
 * Le menu se deploie a l'ECHELLE (0.3 -> 1, fondu, -30 degres -> 0) avec le stagger
 * signature (0.04 s x index), vers le haut ou vers le bas selon la moitie d'ecran
 * ou vit la pastille — [unfoldUpward] — et les libelles regardent l'interieur de
 * l'ecran — [growRightward].
 *
 * SDK-pure : [items] porte des icones/couleurs/actions opaques ; l'etat est HISSE
 * ([expanded]/[onExpandedChange]) pour que le premier tap du conteneur ouvre le
 * menu d'un coup, comme sur iOS.
 *
 * Le [Popup] deploye est `focusable = true` : Compose lui retire alors
 * `FLAG_NOT_TOUCH_MODAL`, donc sa fenetre intercepte TOUT toucher de l'ecran, meme
 * hors de son propre contenu (c'est ce qui rend `dismissOnClickOutside` possible).
 * Consequence : tant que le menu est deploye, un second tap sur l'ancre elle-meme
 * (rendue par [collapsedContent] dans la fenetre applicative NORMALE, en dessous)
 * n'atteint jamais son `combinedClickable` — la fenetre du Popup l'avale avant.
 * [onAnchorTapWhileExpanded] existe pour CE geste precis : un second Popup, non
 * modal, pose APRES le premier (donc au-dessus dans la pile de fenetres) et
 * exactement dimensionne/positionne sur l'ancre mesuree, re-intercepte le tap a
 * cet endroit precis et le route vers l'appelant — sans toucher au premier Popup,
 * dont le comportement (deploiement, dismiss-outside) reste inchange.
 */
@Composable
@OptIn(ExperimentalFoundationApi::class)
public fun MeeshyMenuFab(
    items: List<RadialMenuItem>,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    unfoldUpward: Boolean,
    growRightward: Boolean,
    modifier: Modifier = Modifier,
    fabIcon: ImageVector = Icons.Filled.Add,
    collapsedContent: (@Composable (expanded: Boolean) -> Unit)? = null,
    onAnchorTapWhileExpanded: (() -> Unit)? = null,
) {
    val fabRotation by animateFloatAsState(
        targetValue = if (expanded) 45f else 0f,
        animationSpec = tween(260, easing = EaseOutBack),
        label = "menu-fab-rotation",
    )

    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        if (collapsedContent != null) {
            collapsedContent(expanded)
        } else {
            FloatingGradientFab(
                onClick = { onExpandedChange(!expanded) },
                icon = fabIcon,
                contentDescription = null,
                modifier = Modifier.graphicsLayer { rotationZ = fabRotation },
            )
        }

        if (expanded) {
            val spacingPx = with(LocalDensity.current) { MeeshySpacing.md.roundToPx() }
            var lastAnchorBounds by remember { mutableStateOf<IntRect?>(null) }
            val positionProvider = remember(spacingPx) {
                MenuFabPositionProvider(spacingPx) { bounds -> lastAnchorBounds = bounds }
            }
            Popup(
                popupPositionProvider = positionProvider,
                onDismissRequest = { onExpandedChange(false) },
                properties = PopupProperties(focusable = true),
            ) {
                MenuItemStack(
                    items = items,
                    unfoldUpward = unfoldUpward,
                    growRightward = growRightward,
                    onSelect = { item ->
                        onExpandedChange(false)
                        item.onSelect()
                    },
                )
            }

            if (collapsedContent != null) {
                lastAnchorBounds?.let { bounds ->
                    val density = LocalDensity.current
                    Popup(
                        popupPositionProvider = remember(bounds) {
                            FixedOffsetPositionProvider(bounds.left, bounds.top)
                        },
                        onDismissRequest = { onExpandedChange(false) },
                        properties = PopupProperties(focusable = false, dismissOnClickOutside = false),
                    ) {
                        Box(
                            modifier = with(density) {
                                Modifier.size(
                                    width = (bounds.right - bounds.left).toDp(),
                                    height = (bounds.bottom - bounds.top).toDp(),
                                )
                            }.combinedClickable(
                                onClick = {
                                    onExpandedChange(false)
                                    onAnchorTapWhileExpanded?.invoke()
                                },
                                onLongClick = {
                                    onExpandedChange(false)
                                    onAnchorTapWhileExpanded?.invoke()
                                },
                            ),
                        ) {
                            collapsedContent(true)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Ancre le menu contre la pastille et le garde DANS la fenetre. Toute la regle vit
 * dans [menuPopupOffset] (core:model), testee en JVM pur — ici on ne fait que
 * traduire les types Compose.
 */
private class MenuFabPositionProvider(
    private val spacingPx: Int,
    private val onAnchorMeasured: (IntRect) -> Unit,
) : PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize,
    ): IntOffset {
        onAnchorMeasured(anchorBounds)
        val offset = menuPopupOffset(
            anchor = MenuAnchorBounds(
                left = anchorBounds.left,
                top = anchorBounds.top,
                right = anchorBounds.right,
                bottom = anchorBounds.bottom,
            ),
            menuWidthPx = popupContentSize.width,
            menuHeightPx = popupContentSize.height,
            windowWidthPx = windowSize.width,
            windowHeightPx = windowSize.height,
            spacingPx = spacingPx,
        )
        return IntOffset(offset.xPx, offset.yPx)
    }
}

/**
 * Position FIXE, en pixels fenetre — utilisee par le Popup non modal qui reprend
 * le tap sur l'ancre pendant que le menu est deploye : l'ancre est deja mesuree
 * (par [MenuFabPositionProvider] ci-dessus), aucune geometrie a recalculer ici.
 */
private class FixedOffsetPositionProvider(private val xPx: Int, private val yPx: Int) : PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize,
    ): IntOffset = IntOffset(xPx, yPx)
}

@Composable
private fun MenuItemStack(
    items: List<RadialMenuItem>,
    unfoldUpward: Boolean,
    growRightward: Boolean,
    onSelect: (RadialMenuItem) -> Unit,
) {
    // Le Popup apparait deja compose : sans cette bascule differee, chaque item
    // naitrait directement a l'etat final et l'effet d'echelle n'existerait pas.
    var appeared by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { appeared = true }

    Column(
        // Respiration contre le bord d'ancrage : sans elle, les pastilles du menu
        // touchent le bord physique de l'ecran quand la bulle y est aimantee.
        modifier = Modifier.padding(horizontal = MeeshySpacing.sm),
        horizontalAlignment = if (growRightward) Alignment.Start else Alignment.End,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        // item[0] pop en premier ET reste adjacent a la pastille : rendu inverse
        // quand le menu monte, rendu naturel quand il descend.
        val renderOrder = if (unfoldUpward) items.indices.reversed() else items.indices.toList()
        for (index in renderOrder) {
            val item = items[index]
            val progress by animateFloatAsState(
                targetValue = if (appeared) 1f else 0f,
                animationSpec = tween(
                    durationMillis = 260,
                    delayMillis = index * 40,
                    easing = EaseOutBack,
                ),
                label = "menu-item-$index",
            )
            MenuItemRow(
                item = item,
                iconLeading = growRightward,
                onClick = { onSelect(item) },
                modifier = Modifier.graphicsLayer {
                    val scale = lerp(0.3f, 1f, progress)
                    scaleX = scale
                    scaleY = scale
                    alpha = progress.coerceIn(0f, 1f)
                    rotationZ = lerp(-30f, 0f, progress)
                    // L'echelle part du coin ou vit la pastille : c'est ce qui donne
                    // l'impression que le menu SORT du bouton au lieu d'apparaitre.
                    transformOrigin = TransformOrigin(
                        pivotFractionX = if (growRightward) 0f else 1f,
                        pivotFractionY = if (unfoldUpward) 1f else 0f,
                    )
                },
            )
        }
    }
}

@Composable
private fun MenuItemRow(
    item: RadialMenuItem,
    iconLeading: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptic = LocalHapticFeedback.current
    Row(
        modifier = modifier.clickable {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            onClick()
        },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (iconLeading) {
            MenuItemIcon(item)
            Spacer(Modifier.width(MeeshySpacing.md))
            MenuItemLabel(item)
        } else {
            MenuItemLabel(item)
            Spacer(Modifier.width(MeeshySpacing.md))
            MenuItemIcon(item)
        }
    }
}

@Composable
private fun MenuItemLabel(item: RadialMenuItem) {
    val tokens = MeeshyTheme.tokens
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(tokens.backgroundSecondary)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
    ) {
        Text(
            text = item.label,
            style = MaterialTheme.typography.labelLarge,
            color = tokens.textPrimary,
        )
    }
}

@Composable
private fun MenuItemIcon(item: RadialMenuItem) {
    Box(contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .size(46.dp)
                .clip(CircleShape)
                .background(item.color),
            contentAlignment = Alignment.Center,
        ) {
            Icon(imageVector = item.icon, contentDescription = item.label, tint = MeeshyPalette.White)
        }
        if (item.badgeCount > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .defaultMinSize(minWidth = 18.dp, minHeight = 18.dp)
                    .clip(CircleShape)
                    .background(MeeshyPalette.ErrorStrong)
                    .padding(horizontal = 4.dp, vertical = 2.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = unreadBadgeLabel(item.badgeCount),
                    style = MaterialTheme.typography.labelSmall,
                    color = MeeshyPalette.White,
                    maxLines = 1,
                )
            }
        }
    }
}
