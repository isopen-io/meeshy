package me.meeshy.ui.component.chrome

import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
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
            travelXPx = travelXPx,
            travelYPx = travelYPx,
            content = rightContent,
        )
    }
}

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
) {
    // Position vivante pendant le glissement. La source de verite n'est notifiee
    // qu'au relachement : notifier a chaque pixel parcouru declencherait une
    // ecriture DataStore par image.
    var dragged by remember { mutableStateOf<FloatingButtonPosition?>(null) }
    val shown = dragged ?: position

    Box(
        modifier = Modifier
            // Pas de .align ici : TopStart est deja le defaut du Box, et align
            // n'existe que dans son scope.
            .offset {
                IntOffset(
                    x = (shown.x * travelXPx).roundToInt(),
                    y = (shown.y * travelYPx).roundToInt(),
                )
            }
            .size(FloatingButtonSize)
            .semantics { this.contentDescription = contentDescription }
            .pointerInput(Unit) {
                detectTapGestures(onTap = { onTap() }, onLongPress = { onLongPress() })
            }
            .pointerInput(travelXPx, travelYPx) {
                detectDragGestures(
                    onDragEnd = {
                        // Aimantation au bord, uniquement au relachement.
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
