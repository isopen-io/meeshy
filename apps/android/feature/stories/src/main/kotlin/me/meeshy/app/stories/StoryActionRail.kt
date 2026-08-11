package me.meeshy.app.stories

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Translate
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.stories.R
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** Which scrubbable bar a rail longpress opens. */
enum class StoryScrubKind { Reactions, Languages }

/** Raw scrub gesture stream from a rail button, in ROOT coordinates. */
sealed interface StoryScrubEvent {
    data class Started(val kind: StoryScrubKind, val rootPosition: Offset) : StoryScrubEvent
    data class Moved(val rootPosition: Offset) : StoryScrubEvent
    data object Ended : StoryScrubEvent
    data object Cancelled : StoryScrubEvent
}

/**
 * Right-side action rail of the story viewer — Android mirror of the iOS
 * `StoryActionSidebarView` for the react + language buttons. Each button
 * carries two gesture layers: a plain tap (instant ❤️ / language-bar toggle)
 * and a longpress-then-drag that streams [StoryScrubEvent]s to the screen,
 * which owns the bars, the hit-testing and the flight animation.
 */
@Composable
fun StoryActionRail(
    plan: StoryRailPlan,
    reactionCount: Int,
    hasReacted: Boolean,
    languageBadgeCode: String?,
    heartBouncePulse: Int,
    onTapHeart: () -> Unit,
    onTapLanguage: () -> Unit,
    onScrubEvent: (StoryScrubEvent) -> Unit,
    onHeartBounds: (Rect) -> Unit,
    onLanguageBounds: (Rect) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (plan.showsReact) {
            var bounceTarget by remember { mutableStateOf(1f) }
            LaunchedEffect(heartBouncePulse) {
                if (heartBouncePulse == 0) return@LaunchedEffect
                bounceTarget = 1.35f
                delay(160)
                bounceTarget = 1f
            }
            val heartScale by animateFloatAsState(
                targetValue = bounceTarget,
                animationSpec = MeeshyMotion.bouncySpring(),
                label = "heartScale",
            )
            RailButton(
                icon = Icons.Filled.Favorite,
                label = if (reactionCount > 0) reactionCount.toString()
                else stringResource(R.string.stories_action_react),
                tint = if (hasReacted) MeeshyPalette.Indigo400 else MeeshyPalette.White,
                scale = heartScale,
                onTap = onTapHeart,
                scrubKind = StoryScrubKind.Reactions,
                onScrubEvent = onScrubEvent,
                onBounds = onHeartBounds,
            )
        }
        if (plan.showsLanguage) {
            Box {
                RailButton(
                    icon = Icons.Filled.Translate,
                    label = stringResource(R.string.stories_action_translations),
                    tint = MeeshyPalette.White,
                    scale = 1f,
                    onTap = onTapLanguage,
                    scrubKind = StoryScrubKind.Languages,
                    onScrubEvent = onScrubEvent,
                    onBounds = onLanguageBounds,
                )
                if (!languageBadgeCode.isNullOrBlank()) {
                    Text(
                        text = languageBadgeCode.uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MeeshyPalette.White,
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .clip(CircleShape)
                            .background(MeeshyPalette.Indigo500)
                            .padding(horizontal = 5.dp, vertical = 1.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun RailButton(
    icon: ImageVector,
    label: String,
    tint: Color,
    scale: Float,
    onTap: () -> Unit,
    scrubKind: StoryScrubKind,
    onScrubEvent: (StoryScrubEvent) -> Unit,
    onBounds: (Rect) -> Unit,
) {
    var coords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .size(46.dp)
                .onGloballyPositioned {
                    coords = it
                    onBounds(it.boundsInRoot())
                }
                .graphicsLayer { scaleX = scale; scaleY = scale }
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.35f))
                .pointerInput(Unit) {
                    detectTapGestures { onTap() }
                }
                .pointerInput(scrubKind) {
                    detectDragGesturesAfterLongPress(
                        onDragStart = { offset ->
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
                }
                .semantics { contentDescription = label },
            contentAlignment = Alignment.Center,
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyPalette.White,
        )
    }
}
