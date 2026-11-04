package me.meeshy.app.stories

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.chrome.CollapsibleHeaderMetrics
import me.meeshy.sdk.model.story.MyStoryAvatarAction
import me.meeshy.sdk.model.story.PinnedBandReveal
import me.meeshy.sdk.model.story.StoryTrayActionResolver
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/** Le compte courant, pour la première cellule quand il n'a (plus) aucun anneau : son avatar, jamais un « + ». */
data class PinnedBandSelf(
    val displayName: String,
    val avatarUrl: String?,
    val accentHex: String,
)

/**
 * La bande compacte qui PREND LA PLACE DU TITRE de l'en-tête repliable — iOS `PinnedStoryTrailBand`. Anneaux de
 * [PinnedBandReveal.RING_DP] sans libellé, mêmes données que le grand plateau ([StoriesViewModel]). Première cellule
 * = l'utilisateur : appui = son lecteur (ou, sans story vivante, « Mes stories » / le composeur selon
 * [StoryTrayActionResolver]), appui long = « Gérer mes stories ». PAS de « + » : la composition passe par le grand
 * plateau et par cet avatar.
 *
 * Au repos rien n'est composé (garde de performance) ; l'OPACITÉ appartient à l'en-tête, qui tient les deux moitiés
 * du fondu titre vers bande sur la même courbe ; ici la hauteur suit la révélation et les gestes ne passent qu'au-delà
 * de 0,6.
 */
@Composable
fun PinnedStoryTrailBand(
    reveal: Float,
    onOpenStory: (String) -> Unit,
    onManageStories: () -> Unit,
    onAddStory: () -> Unit,
    modifier: Modifier = Modifier,
    self: PinnedBandSelf? = null,
    moodEmojiOf: (String) -> String? = { null },
    viewModel: StoriesViewModel = hiltViewModel(),
    impressions: StoryTrayImpressionsViewModel = hiltViewModel(),
) {
    val band = PinnedBandReveal(reveal)
    if (!band.isMaterialized) return
    val state by viewModel.state.collectAsStateWithLifecycle()
    DisposableEffect(Unit) { onDispose(impressions::flush) }
    val tray = state.tray
    val own = tray.self ?: tray.ownHistory
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(band.heightDp.dp)
            .clipToBounds(),
        contentAlignment = Alignment.TopStart,
    ) {
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                start = MeeshySpacing.lg,
                end = CollapsibleHeaderMetrics.ACCESSORY_TRAILING_CLEARANCE.dp,
            ),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.height(PinnedBandReveal.BAND_HEIGHT_DP.dp),
        ) {
            item(key = "self", contentType = CELL_TYPE) {
                PinnedSelfCell(
                    own = own,
                    live = tray.self != null,
                    hasHistory = state.hasStoryHistory,
                    self = self,
                    moodEmoji = (own?.userId ?: "").let(moodEmojiOf),
                    onOpenStory = onOpenStory,
                    onManageStories = onManageStories,
                    onAddStory = onAddStory,
                )
            }
            items(PinnedBandReveal.visibleOthers(tray.others), key = { it.userId }, contentType = { CELL_TYPE }) { ring ->
                LaunchedEffect(ring.displayedStoryId) { impressions.onRingAppeared(ring.displayedStoryId) }
                PinnedRingCell(ring = ring, moodEmoji = moodEmojiOf(ring.userId), onOpen = { onOpenStory(ring.userId) })
            }
        }
        if (!band.acceptsTouches) TouchShield()
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PinnedSelfCell(
    own: StoryRing?,
    live: Boolean,
    hasHistory: Boolean,
    self: PinnedBandSelf?,
    moodEmoji: String?,
    onOpenStory: (String) -> Unit,
    onManageStories: () -> Unit,
    onAddStory: () -> Unit,
) {
    val haptics = rememberMeeshyHaptics()
    var menuOpen by remember { mutableStateOf(false) }
    val tapsToManage = StoryTrayActionResolver.avatarTap(hasMyStory = live, hasAnyStory = hasHistory) ==
        MyStoryAvatarAction.ManageStories
    val onTap: () -> Unit = when {
        live && own != null -> ({ onOpenStory(own.userId) })
        tapsToManage -> onManageStories
        else -> onAddStory
    }
    val tapLabel = when {
        live -> stringResource(R.string.stories_open, stringResource(R.string.stories_my_story))
        tapsToManage -> stringResource(R.string.stories_tray_manage)
        else -> stringResource(R.string.story_tray_a11y_createStory)
    }
    Box(
        modifier = Modifier
            .size(CELL_TARGET)
            .combinedClickable(
                onClick = { haptics.medium(); onTap() },
                onLongClick = { haptics.light(); menuOpen = true },
            )
            .semantics { role = Role.Button; contentDescription = tapLabel },
        contentAlignment = Alignment.Center,
    ) {
        val name = own?.displayName ?: self?.displayName ?: stringResource(R.string.stories_my_story)
        val accent = own?.accentHex ?: self?.accentHex
        MeeshyAvatar(
            name = name,
            size = PinnedBandReveal.RING_DP.dp,
            containerColor = accent?.let { hexColor(it) } ?: MeeshyPalette.Indigo500,
            imageUrl = own?.avatarUrl ?: self?.avatarUrl,
            storyRing = own?.takeIf { live }?.let(::ringState) ?: StoryRingState.None,
            moodEmoji = moodEmoji?.takeIf { it.isNotEmpty() },
        )
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.stories_tray_manage)) },
                onClick = { menuOpen = false; onManageStories() },
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PinnedRingCell(ring: StoryRing, moodEmoji: String?, onOpen: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    val presence = rememberPresence(ring.userId, ring.servedPresence)
    val description = stringResource(R.string.stories_open, ring.displayName)
    Box(
        modifier = Modifier
            .size(CELL_TARGET)
            .clip(CircleShape)
            .combinedClickable(onClick = { haptics.medium(); onOpen() })
            .semantics { role = Role.Button; contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        MeeshyAvatar(
            name = ring.displayName,
            size = PinnedBandReveal.RING_DP.dp,
            containerColor = hexColor(ring.accentHex),
            imageUrl = ring.avatarUrl,
            storyRing = ringState(ring),
            presence = presence,
            moodEmoji = moodEmoji?.takeIf { it.isNotEmpty() },
        )
    }
}

internal fun ringState(ring: StoryRing): StoryRingState = when (ring.style.emphasis) {
    StoryRingEmphasis.Unread -> StoryRingState.Unread
    StoryRingEmphasis.Read -> StoryRingState.Read
    StoryRingEmphasis.None -> StoryRingState.None
}

/** Tant que la bascule n'a pas passé 0,6, la bande se voit mais n'attrape aucun geste (iOS `allowsHitTesting`). */
@Composable
private fun TouchShield() {
    Box(
        Modifier
            .fillMaxWidth()
            .height(PinnedBandReveal.BAND_HEIGHT_DP.dp)
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                    down.consume()
                }
            },
    )
}

private val CELL_TARGET = 48.dp
private const val CELL_TYPE = "pinned-ring"
