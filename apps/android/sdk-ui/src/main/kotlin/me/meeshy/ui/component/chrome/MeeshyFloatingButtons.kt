package me.meeshy.ui.component.chrome

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.chrome.FloatingButtonPosition
import me.meeshy.sdk.model.chrome.applyDragDelta
import me.meeshy.sdk.model.chrome.snapToNearestEdge
import me.meeshy.ui.compatibility.systemBarsInsetsCompat
import kotlin.math.roundToInt

/** Diametre d'un bouton flottant, aligne sur la cible tactile minimale d'Android. */
public val FloatingButtonSize: androidx.compose.ui.unit.Dp = 56.dp

/**
 * Les deux boutons flottants qui pilotent le routage — portage du
 * `FreeFloatingButtonsContainer` iOS (MeeshyUI/Primitives/FloatingButtons.swift).
 *
 * NE PAS remettre dans le slot `Scaffold(floatingActionButton = )` : ce slot
 * positionne LUI-MEME son contenu, ce qui est structurellement incompatible avec un
 * bouton deplacable. Les boutons se posent dans un Box par-dessus le NavHost.
 *
 * Purete SDK : aucune route, aucun singleton produit ici. Positions et actions
 * arrivent par parametre, l'appelant decide de ce que chaque geste declenche. Toute
 * la geometrie vit dans `core:model` (unites pures testees) ; ce composable dessine
 * et delegue, rien de plus.
 */
@Composable
public fun MeeshyFloatingButtons(
    leftPosition: FloatingButtonPosition,
    rightPosition: FloatingButtonPosition,
    onLeftPositionChange: (FloatingButtonPosition) -> Unit,
    onRightPositionChange: (FloatingButtonPosition) -> Unit,
    onLeftTap: () -> Unit,
    onLeftLongPress: () -> Unit,
    onRightTap: () -> Unit,
    onRightLongPress: () -> Unit,
    leftContentDescription: String,
    rightContentDescription: String,
    leftStateDescription: String? = null,
    rightStateDescription: String? = null,
    leftAccessibilityActions: List<Pair<String, () -> Unit>> = emptyList(),
    rightAccessibilityActions: List<Pair<String, () -> Unit>> = emptyList(),
    modifier: Modifier = Modifier,
    leftContent: @Composable () -> Unit,
    rightContent: @Composable () -> Unit,
) {
    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            // targetSdk 36 impose l'edge-to-edge : sans ces marges, un bouton colle
            // en bas tomberait SOUS la barre de gestes, ou il est materiellement
            // inatteignable.
            .padding(systemBarsInsetsCompat()),
    ) {
        val density = LocalDensity.current
        val buttonPx = with(density) { FloatingButtonSize.toPx() }
        // La course utile, pas la largeur d'ecran : sinon le bouton deborderait
        // d'une demi-largeur a chaque extremite.
        val travelXPx = with(density) { maxWidth.toPx() } - buttonPx
        val travelYPx = with(density) { maxHeight.toPx() } - buttonPx

        DraggableFloatingButton(
            position = leftPosition,
            onPositionChange = onLeftPositionChange,
            onTap = onLeftTap,
            onLongPress = onLeftLongPress,
            contentDescription = leftContentDescription,
            stateDescription = leftStateDescription,
            accessibilityActions = leftAccessibilityActions,
            travelXPx = travelXPx,
            travelYPx = travelYPx,
            content = leftContent,
        )

        DraggableFloatingButton(
            position = rightPosition,
            onPositionChange = onRightPositionChange,
            onTap = onRightTap,
            onLongPress = onRightLongPress,
            contentDescription = rightContentDescription,
            stateDescription = rightStateDescription,
            accessibilityActions = rightAccessibilityActions,
            travelXPx = travelXPx,
            travelYPx = travelYPx,
            content = rightContent,
        )
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun DraggableFloatingButton(
    position: FloatingButtonPosition,
    onPositionChange: (FloatingButtonPosition) -> Unit,
    onTap: () -> Unit,
    onLongPress: () -> Unit,
    contentDescription: String,
    travelXPx: Float,
    travelYPx: Float,
    content: @Composable () -> Unit,
    stateDescription: String? = null,
    accessibilityActions: List<Pair<String, () -> Unit>> = emptyList(),
) {
    val haptic = LocalHapticFeedback.current
    // Position vivante pendant le glissement. La source de verite n'est notifiee
    // qu'au relachement : notifier a chaque pixel parcouru declencherait une
    // ecriture DataStore par image.
    var dragged by remember { mutableStateOf<FloatingButtonPosition?>(null) }
    val shown = dragged ?: position

    // Sous le doigt la position est INSTANTANEE (snap) ; au relachement elle
    // rejoint le bord aimante par un ressort — le saut sec du bouton vers le bord
    // etait le principal marqueur "non fini" du composant.
    val followSpec = if (dragged != null) {
        snap<Float>()
    } else {
        spring(dampingRatio = 0.72f, stiffness = Spring.StiffnessMediumLow)
    }
    val animatedX by animateFloatAsState(shown.x, followSpec, label = "fab-x")
    val animatedY by animateFloatAsState(shown.y, followSpec, label = "fab-y")

    // Retour d'appui : la pastille s'ecrase legerement sous le doigt. Remplace le
    // ripple (une onde rectangulaire sous un cercle deborde) par un geste plus
    // proche des bulles de chat systeme.
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val pressScale by animateFloatAsState(
        targetValue = if (pressed) 0.88f else 1f,
        animationSpec = spring(dampingRatio = 0.55f, stiffness = Spring.StiffnessMedium),
        label = "fab-press-scale",
    )

    Box(
        modifier = Modifier
            // Pas de .align ici : TopStart est deja le defaut du Box, et align
            // n'existe que dans son scope.
            .offset {
                IntOffset(
                    x = (animatedX * travelXPx).roundToInt(),
                    y = (animatedY * travelYPx).roundToInt(),
                )
            }
            // Taille MINIMALE, pas fixe : le contenu garde sa cible tactile de
            // 56dp mais un avatar legerement plus grand ne se fait pas clipper.
            // Le menu deploye ne vit plus ici : il est ancre dans un Popup
            // (MeeshyMenuFab), qui le positionne et le CLAMPE dans la fenetre.
            .defaultMinSize(minWidth = FloatingButtonSize, minHeight = FloatingButtonSize)
            .graphicsLayer {
                scaleX = pressScale
                scaleY = pressScale
            }
            .semantics {
                this.contentDescription = contentDescription
                stateDescription?.let { this.stateDescription = it }
                if (accessibilityActions.isNotEmpty()) {
                    customActions = accessibilityActions.map { (label, action) ->
                        CustomAccessibilityAction(label) { action(); true }
                    }
                }
            }
            // combinedClickable et NON un second detectTapGestures : deux
            // pointerInput concurrents se disputent le meme evenement, et un simple
            // tap finissait par etre traite comme un glissement — observe sur
            // emulateur, les deux boutons derivaient de leur place a chaque appui.
            // combinedClickable applique le touch slop standard, et apporte en prime
            // l'activation au clavier. indication = null : le retour visuel est
            // porte par l'echelle d'appui, pas par un ripple.
            .combinedClickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    onTap()
                },
                onLongClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    onLongPress()
                },
            )
            .pointerInput(travelXPx, travelYPx) {
                detectDragGestures(
                    onDragEnd = {
                        // Aimantation au bord, uniquement au relachement, et
                        // uniquement si le doigt a REELLEMENT parcouru quelque
                        // chose : sans cette garde, un effleurement reecrit la
                        // position stockee.
                        dragged?.let { onPositionChange(snapToNearestEdge(it)) }
                        dragged = null
                    },
                    onDragCancel = { dragged = null },
                ) { change, delta ->
                    change.consume()
                    dragged = applyDragDelta(
                        current = dragged ?: position,
                        deltaXPx = delta.x,
                        deltaYPx = delta.y,
                        travelXPx = travelXPx,
                        travelYPx = travelYPx,
                    )
                }
            },
        contentAlignment = Alignment.Center,
        content = { content() },
    )
}
