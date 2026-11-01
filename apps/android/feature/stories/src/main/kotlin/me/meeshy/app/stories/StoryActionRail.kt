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
import me.meeshy.sdk.model.fullscreen.FullscreenChromeSymbol
import me.meeshy.ui.component.fullscreen.icon
import me.meeshy.ui.icons.MeeshyIcons
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

/** Les compteurs servis avec la story, figés à l'entrée du slide (iOS : le label est le compte quand il est > 0). */
data class StoryRailCounts(
    val comments: Int = 0,
    val shares: Int = 0,
    val reposts: Int = 0,
    val views: Int = 0,
)

/** Les gestes des boutons du rail qui n'ouvrent ni barre ni geste de balayage (#14313). */
class StoryRailTaps(
    val onSend: () -> Unit = {},
    val onRepost: () -> Unit = {},
    val onViews: () -> Unit = {},
    val onCompose: () -> Unit = {},
    val onComments: () -> Unit = {},
)

/**
 * Right-side action rail of the story viewer — Android mirror of the iOS `StoryActionSidebarView` (#14313) : Réagir,
 * Répondre, Envoyer, Republier ou Vues, Composer, Commentaires, Traductions, dans l'ordre d'iOS. Réagir et Traductions
 * carry two gesture layers: a plain tap (instant ❤️ / language-bar toggle) and a longpress-then-drag that streams
 * [StoryScrubEvent]s to the screen, which owns the bars, the hit-testing and the flight animation.
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
    onTapReply: () -> Unit,
    onScrubEvent: (StoryScrubEvent) -> Unit,
    onHeartBounds: (Rect) -> Unit,
    onLanguageBounds: (Rect) -> Unit,
    modifier: Modifier = Modifier,
    counts: StoryRailCounts = StoryRailCounts(),
    taps: StoryRailTaps = StoryRailTaps(),
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
        if (plan.showsReply) {
            RailButton(
                icon = MeeshyIcons.Reply,
                label = stringResource(R.string.stories_action_reply),
                tint = MeeshyPalette.White,
                scale = 1f,
                onTap = onTapReply,
                scrubKind = null,
                onScrubEvent = onScrubEvent,
                onBounds = {},
            )
        }
        StoryRailTapButtons(plan, counts, taps)
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
private fun StoryRailTapButtons(plan: StoryRailPlan, counts: StoryRailCounts, taps: StoryRailTaps) {
    if (plan.showsSend) {
        TapRailButton(MeeshyIcons.Send, countOr(counts.shares, stringResource(R.string.stories_action_send)), stringResource(R.string.stories_action_send), taps.onSend)
    }
    if (plan.showsRepost) {
        TapRailButton(FullscreenChromeSymbol.Repost.icon, countOr(counts.reposts, stringResource(R.string.stories_action_repost)), stringResource(R.string.stories_action_repost), taps.onRepost)
    } else if (plan.showsViews) {
        TapRailButton(MeeshyIcons.EyeFilled, countOr(counts.views, stringResource(R.string.stories_action_views)), stringResource(R.string.stories_action_views), taps.onViews)
    }
    if (plan.showsCompose) {
        TapRailButton(MeeshyIcons.MagicWand, stringResource(R.string.story_viewer_compose), stringResource(R.string.story_viewer_compose), taps.onCompose)
    }
    if (plan.showsComments) {
        TapRailButton(FullscreenChromeSymbol.Comments.icon, counts.comments.toString(), stringResource(R.string.stories_comments_open), taps.onComments)
    }
}

private fun countOr(count: Int, label: String): String = if (count > 0) count.toString() else label

@Composable
private fun TapRailButton(icon: ImageVector, caption: String, accessibilityLabel: String, onTap: () -> Unit) {
    RailButton(
        icon = icon,
        label = caption,
        tint = MeeshyPalette.White,
        scale = 1f,
        onTap = onTap,
        scrubKind = null,
        onScrubEvent = {},
        onBounds = {},
        accessibilityLabel = accessibilityLabel,
    )
}

@Composable
private fun RailButton(
    icon: ImageVector,
    label: String,
    tint: Color,
    scale: Float,
    onTap: () -> Unit,
    scrubKind: StoryScrubKind?,
    onScrubEvent: (StoryScrubEvent) -> Unit,
    onBounds: (Rect) -> Unit,
    accessibilityLabel: String = label,
) {
    var coords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    var scrubStartedThisGesture by remember { mutableStateOf(false) }
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
                    detectTapGestures(
                        onPress = { scrubStartedThisGesture = false },
                        onTap = { if (!scrubStartedThisGesture) onTap() },
                    )
                }
                .pointerInput(scrubKind) {
                    if (scrubKind == null) return@pointerInput
                    detectDragGesturesAfterLongPress(
                        onDragStart = { offset ->
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
                }
                .semantics { contentDescription = accessibilityLabel },
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
