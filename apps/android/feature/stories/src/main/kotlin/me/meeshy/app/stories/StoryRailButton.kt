package me.meeshy.app.stories

import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.story.StoryRailContour
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette

/** Cible tactile minimale d'un bouton du rail (iOS : 44 pt ; Android : 48 dp). */
internal val RailButtonSize = 48.dp

/**
 * Ce que le contour d'un bouton dit (iOS `outlineTint`) : [StoryRailContour.LIVE] = indigo400, l'état est ouvert ;
 * [StoryRailContour.PARTICIPATED] = la couleur d'accent de l'auteur, le geste est déjà fait.
 */
internal fun storyRailContourColor(contour: StoryRailContour, authorAccent: Color): Color? = when (contour) {
    StoryRailContour.NONE -> null
    StoryRailContour.LIVE -> MeeshyPalette.Indigo400
    StoryRailContour.PARTICIPATED -> authorAccent
}

/** Un bouton du rail : cellule de verre, glyphe, légende, contour d'emphase, et les traits TalkBack (libellé, état, action). */
@Composable
internal fun StoryRailButton(
    icon: ImageVector,
    caption: String?,
    accessibilityLabel: String,
    modifier: Modifier = Modifier,
    value: String? = null,
    isActive: Boolean = false,
    tint: Color = MeeshyPalette.White,
    outline: Color? = null,
    scale: Float = 1f,
    scrubKind: StoryScrubKind? = null,
    onScrubEvent: (StoryScrubEvent) -> Unit = {},
    onBounds: (Rect) -> Unit = {},
    onTap: () -> Unit,
) {
    var coords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    var scrubStartedThisGesture by remember { mutableStateOf(false) }
    val activeState = stringResource(R.string.stories_rail_state_active)
    val stateText = listOfNotNull(value, activeState.takeIf { isActive }).joinToString(", ").ifEmpty { null }
    Column(
        modifier = modifier.semantics(mergeDescendants = true) {
            contentDescription = accessibilityLabel
            role = Role.Button
            stateText?.let { stateDescription = it }
            onClick(label = accessibilityLabel) { onTap(); true }
        },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(RailButtonSize)
                .onGloballyPositioned {
                    coords = it
                    onBounds(it.boundsInRoot())
                }
                .graphicsLayer { scaleX = scale; scaleY = scale }
                .then(
                    if (outline == null) Modifier
                    else Modifier
                        .shadow(7.dp, CircleShape, ambientColor = outline.copy(alpha = 0.55f), spotColor = outline.copy(alpha = 0.55f))
                        .border(2.dp, outline, CircleShape),
                )
                .pointerInput(Unit) {
                    detectTapGestures(
                        onPress = { scrubStartedThisGesture = false },
                        onTap = { if (!scrubStartedThisGesture) onTap() },
                    )
                }
                .pointerInput(scrubKind) {
                    if (scrubKind == null) return@pointerInput
                    detectDragGesturesAfterLongPress(
                        onDragStart = { offset: Offset ->
                            scrubStartedThisGesture = true
                            val root = coords?.localToRoot(offset) ?: offset
                            onScrubEvent(StoryScrubEvent.Started(scrubKind, root))
                        },
                        onDrag = { change, _ ->
                            change.consume()
                            val root = coords?.localToRoot(change.position) ?: change.position
                            onScrubEvent(StoryScrubEvent.Moved(root))
                        },
                        onDragEnd = { onScrubEvent(StoryScrubEvent.Ended) },
                        onDragCancel = { onScrubEvent(StoryScrubEvent.Cancelled) },
                    )
                },
            contentAlignment = Alignment.Center,
        ) {
            MeeshyGlassSurface(modifier = Modifier.size(RailButtonSize), shape = CircleShape) {}
            Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        }
        if (!caption.isNullOrEmpty()) {
            Text(
                text = caption,
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyPalette.White,
                maxLines = 1,
            )
        }
    }
}
