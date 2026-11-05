package me.meeshy.app.stories

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.fullscreen.FullscreenChromeSymbol
import me.meeshy.sdk.model.story.StoryRailContour
import me.meeshy.sdk.model.story.StoryRailEmphasisAction
import me.meeshy.sdk.model.story.StoryViewerParticipation
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
    /** Ce lecteur a republié la story : « Republier » prend la teinte d'une participation, comme le cœur (#14443). */
    val reposted: Boolean = false,
)

/** Les gestes des boutons du rail qui n'ouvrent ni barre ni geste de balayage (#14313). */
class StoryRailTaps(
    val onSend: () -> Unit = {},
    val onRepost: () -> Unit = {},
    val onViews: () -> Unit = {},
    val onCompose: () -> Unit = {},
    /** « Imager » : la baguette du rail ouvre la vue Imager de la story (#16334). */
    val onImager: () -> Unit = {},
    val onComments: () -> Unit = {},
    val onToggleSound: () -> Unit = {},
    val onSave: () -> Unit = {},
)

/**
 * Ce que le rail dessine autour de ses boutons (iOS `outlineTint`) : le son coupé ou non, ce qui est ouvert, ce que le
 * lecteur a déjà fait, la couleur d'accent de l'auteur et l'enregistrement en cours.
 */
data class StoryRailEmphasis(
    val isMuted: Boolean = false,
    val live: StoryRailContour.Live = StoryRailContour.Live(),
    val participation: StoryViewerParticipation = StoryViewerParticipation.NONE,
    val authorAccent: Color = MeeshyPalette.Error,
    val saving: Boolean = false,
) {
    fun outline(action: StoryRailEmphasisAction): Color? =
        storyRailContourColor(StoryRailContour.resolve(action, live, participation), authorAccent)
}

private val RailSpacingNormal = MeeshySpacing.md
private val RailSpacingTight = MeeshySpacing.xsPlus

/**
 * Right-side action rail of the story viewer — Android mirror of the iOS `StoryActionSidebarView` : Son, Réagir,
 * Répondre, Envoyer, Republier ou Vues, Composer, Imager, Enregistrer, Commentaires, Traductions, dans l'ordre d'iOS.
 * Composer porte l'icône du post ; la baguette est Imager (#16334). Réagir et
 * Traductions carry two gesture layers: a plain tap and a longpress-then-drag that streams [StoryScrubEvent]s to the
 * screen, which owns the bars, the hit-testing and the flight animation. Le rail prend la densité qui tient : espacement
 * normal, puis resserré, puis défilement vertical ; le plan qu'on lui remet est figé par l'hôte à l'entrée de la slide.
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
    emphasis: StoryRailEmphasis = StoryRailEmphasis(),
) {
    AdaptiveRailLayout(modifier = modifier) {
        if (plan.showsSound) StoryRailSoundButton(emphasis, taps.onToggleSound)
        if (plan.showsReact) {
            StoryRailHeartButton(reactionCount, heartBouncePulse, emphasis, onTapHeart, onScrubEvent, onHeartBounds)
        }
        if (plan.showsReply) {
            StoryRailButton(
                icon = MeeshyIcons.Reply,
                caption = stringResource(R.string.stories_action_reply),
                accessibilityLabel = stringResource(R.string.stories_action_reply),
                onTap = onTapReply,
            )
        }
        StoryRailTapButtons(plan, counts, emphasis, taps)
        if (plan.showsComments) {
            StoryRailButton(
                icon = FullscreenChromeSymbol.Comments.icon,
                caption = counts.comments.toString(),
                accessibilityLabel = stringResource(R.string.stories_comments_open),
                value = counts.comments.toString(),
                isActive = emphasis.live.commentsOpen,
                outline = emphasis.outline(StoryRailEmphasisAction.COMMENTS),
                onTap = taps.onComments,
            )
        }
        if (plan.showsLanguage) {
            StoryRailLanguageButton(languageBadgeCode, emphasis, onTapLanguage, onScrubEvent, onLanguageBounds)
        }
    }
}

/**
 * La densité d'iOS (`ViewThatFits(in: .vertical)`) : l'espacement normal s'il tient dans la hauteur, sinon resserré, sinon
 * le rail défile. Une seule composition : les boutons sont mesurés une fois, et l'espacement ne se choisit qu'à la pose.
 */
@Composable
private fun AdaptiveRailLayout(modifier: Modifier, content: @Composable () -> Unit) {
    BoxWithConstraints(modifier) {
        val availablePx = constraints.maxHeight
        Box(Modifier.verticalScroll(rememberScrollState())) {
            Layout(content = content) { measurables, incoming ->
                val loose = Constraints(maxWidth = incoming.maxWidth)
                val items = measurables.map { it.measure(loose) }
                val gaps = (items.size - 1).coerceAtLeast(0)
                val stacked = items.sumOf { it.height }
                val normalGap = RailSpacingNormal.roundToPx()
                val tightGap = RailSpacingTight.roundToPx()
                val gap = when (StoryRailDensity.choose(availablePx, stacked + gaps * normalGap, stacked + gaps * tightGap)) {
                    StoryRailDensity.NORMAL -> normalGap
                    StoryRailDensity.TIGHT, StoryRailDensity.SCROLL -> tightGap
                }
                val width = items.maxOfOrNull { it.width } ?: 0
                layout(width, stacked + gaps * gap) {
                    var y = 0
                    items.forEach { item ->
                        item.place((width - item.width) / 2, y)
                        y += item.height + gap
                    }
                }
            }
        }
    }
}

@Composable
private fun StoryRailSoundButton(emphasis: StoryRailEmphasis, onToggle: () -> Unit) {
    val label = stringResource(if (emphasis.isMuted) R.string.stories_action_mute else R.string.stories_action_sound)
    StoryRailButton(
        icon = if (emphasis.isMuted) MeeshyIcons.VolumeOff else MeeshyIcons.VolumeUp,
        caption = label,
        accessibilityLabel = label,
        isActive = !emphasis.isMuted,
        outline = emphasis.outline(StoryRailEmphasisAction.SOUND),
        onTap = onToggle,
    )
}

@Composable
private fun StoryRailHeartButton(
    reactionCount: Int,
    heartBouncePulse: Int,
    emphasis: StoryRailEmphasis,
    onTap: () -> Unit,
    onScrubEvent: (StoryScrubEvent) -> Unit,
    onBounds: (Rect) -> Unit,
) {
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
    val react = stringResource(R.string.stories_action_react)
    StoryRailButton(
        icon = Icons.Filled.Favorite,
        caption = if (reactionCount > 0) reactionCount.toString() else react,
        accessibilityLabel = react,
        value = reactionCount.takeIf { it > 0 }?.toString(),
        isActive = emphasis.participation.hasReacted,
        outline = emphasis.outline(StoryRailEmphasisAction.REACT),
        scale = heartScale,
        scrubKind = StoryScrubKind.Reactions,
        onScrubEvent = onScrubEvent,
        onBounds = onBounds,
        onTap = onTap,
    )
}

@Composable
private fun StoryRailLanguageButton(
    badgeCode: String?,
    emphasis: StoryRailEmphasis,
    onTap: () -> Unit,
    onScrubEvent: (StoryScrubEvent) -> Unit,
    onBounds: (Rect) -> Unit,
) {
    Box {
        val label = stringResource(R.string.stories_action_translations)
        StoryRailButton(
            icon = Icons.Filled.Translate,
            caption = label,
            accessibilityLabel = label,
            value = badgeCode?.takeIf { it.isNotBlank() }?.uppercase(),
            isActive = emphasis.live.languagesOpen,
            outline = emphasis.outline(StoryRailEmphasisAction.TRANSLATIONS),
            scrubKind = StoryScrubKind.Languages,
            onScrubEvent = onScrubEvent,
            onBounds = onBounds,
            onTap = onTap,
        )
        if (!badgeCode.isNullOrBlank()) {
            Text(
                text = badgeCode.uppercase(),
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

@Composable
private fun StoryRailTapButtons(plan: StoryRailPlan, counts: StoryRailCounts, emphasis: StoryRailEmphasis, taps: StoryRailTaps) {
    if (plan.showsSend) {
        val send = stringResource(R.string.stories_action_send)
        StoryRailButton(
            icon = MeeshyIcons.Send,
            caption = countOr(counts.shares, send),
            accessibilityLabel = send,
            value = counts.shares.takeIf { it > 0 }?.toString(),
            outline = emphasis.outline(StoryRailEmphasisAction.FORWARD),
            onTap = taps.onSend,
        )
    }
    if (plan.showsRepost) {
        val repost = stringResource(R.string.stories_action_repost)
        StoryRailButton(
            icon = FullscreenChromeSymbol.Repost.icon,
            caption = countOr(counts.reposts, repost),
            accessibilityLabel = repost,
            value = counts.reposts.takeIf { it > 0 }?.toString(),
            isActive = counts.reposted || emphasis.participation.hasReposted,
            outline = emphasis.outline(StoryRailEmphasisAction.REPOST),
            onTap = taps.onRepost,
        )
    } else if (plan.showsViews) {
        val views = stringResource(R.string.stories_action_views)
        StoryRailButton(
            icon = MeeshyIcons.EyeFilled,
            caption = countOr(counts.views, views),
            accessibilityLabel = views,
            value = counts.views.takeIf { it > 0 }?.toString(),
            onTap = taps.onViews,
        )
    }
    if (plan.showsCompose) {
        val compose = stringResource(R.string.story_viewer_compose)
        StoryRailButton(icon = FullscreenChromeSymbol.Compose.icon, caption = compose, accessibilityLabel = compose, onTap = taps.onCompose)
    }
    if (plan.showsImager) {
        val imager = stringResource(R.string.stories_viewer_export_imager)
        StoryRailButton(icon = FullscreenChromeSymbol.Imager.icon, caption = imager, accessibilityLabel = imager, onTap = taps.onImager)
    }
    if (plan.showsExport) StoryRailSaveButton(emphasis.saving, taps.onSave)
}

/** « Enregistrer » (auteur) ; pendant l'export, l'anneau de progression prend sa place et reste muet au toucher. */
@Composable
private fun StoryRailSaveButton(saving: Boolean, onSave: () -> Unit) {
    val save = stringResource(R.string.stories_action_save)
    if (!saving) {
        StoryRailButton(icon = MeeshyIcons.Download, caption = save, accessibilityLabel = save, onTap = onSave)
        return
    }
    val busy = stringResource(R.string.stories_rail_saving)
    Column(
        modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = busy },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(modifier = Modifier.size(RailButtonSize), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(modifier = Modifier.size(28.dp), color = MeeshyPalette.Indigo400, strokeWidth = 3.dp)
        }
        Text(text = busy, style = MaterialTheme.typography.labelSmall, color = MeeshyPalette.White, maxLines = 1)
    }
}

private fun countOr(count: Int, label: String): String = if (count > 0) count.toString() else label
