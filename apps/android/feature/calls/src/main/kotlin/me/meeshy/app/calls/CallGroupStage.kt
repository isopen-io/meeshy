package me.meeshy.app.calls

import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.call.GroupStageTapOutcome
import me.meeshy.sdk.model.call.GroupStageTapRule
import me.meeshy.sdk.model.call.group.CallInviteCandidates
import me.meeshy.sdk.model.call.group.GroupCallGridLayout
import me.meeshy.sdk.model.call.group.GroupCallSpotlight
import me.meeshy.sdk.model.call.group.GroupCallSpotlightChoice
import me.meeshy.sdk.model.call.group.GroupCallStageFocus
import me.meeshy.sdk.model.call.group.GroupCallStageLaw
import me.meeshy.sdk.model.call.group.GroupCallStageTile
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import org.webrtc.EglBase
import org.webrtc.VideoTrack

/** `true` quand la scène de groupe remplace celle du duo (#13740) : deux membres distants, ou un membre du maillage. */
internal fun groupStageShown(state: CallUiState, mesh: GroupCallMeshUi): Boolean =
    state.showsConnectedLayout && GroupCallStageLaw.isShown(mesh.isActive, mesh.roster)

/**
 * La scène d'un appel de groupe (iOS `GroupCallStageView`), posée ENTRE l'en-tête et la pilule. Grille par défaut :
 * ma vignette d'abord, puis les membres dans l'ordre d'arrivée — la grille ne se réagence jamais. Toucher une vignette
 * la met à la une avec la pellicule des autres ([GroupCallSpotlight]) ; un partage d'écran d'un membre y monte seul ;
 * « Revenir à la grille » rend la grille. Le choix reste LOCAL, jamais partagé.
 */
@Composable
internal fun CallGroupStage(
    state: CallUiState,
    mesh: GroupCallMeshUi,
    localTrack: VideoTrack?,
    primaryTrack: VideoTrack?,
    eglContext: EglBase.Context,
    isChromeVisible: Boolean,
    isFullScreen: Boolean,
    onFullScreenChange: (Boolean) -> Unit,
    onStageTap: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val tiles = GroupCallStageLaw.tiles(
        roster = mesh.roster,
        localName = stringResource(R.string.call_group_tile_you),
        isLocalMicMuted = state.isMuted,
        isLocalVideoEnabled = state.isVideoCall && state.isCameraOn && localTrack != null,
        isPrimaryVideoActive = primaryTrack != null && !state.isPeerCameraOff,
    )
    var choice by remember { mutableStateOf<GroupCallSpotlightChoice?>(null) }
    val sharer = GroupCallSpotlight.sharerId(tiles)
    val lastSharer = remember { mutableStateOf(sharer) }
    LaunchedEffect(sharer) {
        if (sharer != lastSharer.value) {
            choice = GroupCallSpotlight.choiceAfterSharerChanged(choice, lastSharer.value, sharer)
            lastSharer.value = sharer
        }
    }
    val focus = GroupCallSpotlight.focus(tiles, choice)
    var zoom by remember { mutableFloatStateOf(1f) }
    val fullScreenChange by rememberUpdatedState(onFullScreenChange)
    val fullScreenNow by rememberUpdatedState(isFullScreen)
    LaunchedEffect(focus) {
        zoom = 1f
        if (focus == GroupCallStageFocus.Grid && fullScreenNow) fullScreenChange(false)
    }
    DisposableEffect(Unit) { onDispose { if (fullScreenNow) fullScreenChange(false) } }

    val haptics = LocalHapticFeedback.current
    val choose: (GroupCallSpotlightChoice) -> Unit = { next ->
        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        choice = next
    }
    val scope = CallGroupStageScope(
        trackOf = { tile ->
            when {
                !tile.showsVideo -> null
                tile.isLocal -> localTrack
                tile.id == mesh.primaryUserId && !mesh.isPrimaryVacated -> primaryTrack
                else -> mesh.videoTracks[tile.id]
            }
        },
        eglContext = eglContext,
        mirrorsLocal = state.isFrontCamera,
        onTileTap = { tile ->
            when (GroupStageTapRule.outcome(isChromeVisible)) {
                GroupStageTapOutcome.RevealChrome -> onStageTap?.invoke()
                GroupStageTapOutcome.Spotlight -> choose(GroupCallSpotlightChoice.Tile(tile.id))
            }
        },
    )
    val stageLabel = stringResource(R.string.call_group_stage)
    val stageModifier = modifier.semantics { contentDescription = stageLabel }
    val spotlight = focus as? GroupCallStageFocus.Spotlight
    val featured = spotlight?.let { focused -> tiles.firstOrNull { it.id == focused.tileId } }
    if (spotlight == null || featured == null) {
        CallGroupGrid(tiles, scope, onStageTap, stageModifier)
    } else {
        CallGroupSpotlightStage(
            tiles = tiles,
            featured = featured,
            isScreenShare = spotlight.isScreenShare,
            isFullScreen = isFullScreen,
            zoom = zoom,
            onPinch = { factor -> zoom = GroupCallSpotlight.clampedZoom(zoom * factor) },
            onResetZoom = { zoom = 1f },
            onGrid = { choose(GroupCallSpotlightChoice.Grid) },
            onToggleFullScreen = { onFullScreenChange(!isFullScreen) },
            onStageTap = onStageTap,
            scope = scope,
            modifier = stageModifier,
        )
    }
}

/** La grille — iOS `GroupCallStageView.grid` ; l'espace entre les vignettes rallume ou éteint le chrome. */
@Composable
private fun CallGroupGrid(
    tiles: List<GroupCallStageTile>,
    scope: CallGroupStageScope,
    onStageTap: (() -> Unit)?,
    modifier: Modifier,
) {
    val stageTap = if (onStageTap != null) {
        Modifier.pointerInput(onStageTap) { detectTapGestures(onTap = { onStageTap() }) }
    } else {
        Modifier
    }
    BoxWithConstraints(modifier.then(stageTap)) {
        val layout = GroupCallGridLayout.layout(tiles.size, isLandscape = maxWidth > maxHeight)
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(STAGE_SPACING)) {
            tiles.chunked(layout.columns).forEach { row ->
                Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(STAGE_SPACING)) {
                    row.forEach { tile -> CallGroupSelectableTile(tile, scope, Modifier.weight(1f).fillMaxSize()) }
                    repeat(layout.columns - row.size) { Box(Modifier.weight(1f)) }
                }
            }
        }
    }
}

/**
 * « Ajouter à l'appel » (iOS `CallAddPeopleSheet`) : les amis acceptés qu'on peut encore faire sonner — ni moi,
 * ni ceux déjà dans l'appel, ni ceux qui sonnent déjà. Un toucher fait sonner l'ami et referme la feuille.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CallAddPeopleSheet(
    selfId: String?,
    primaryUserId: String?,
    mesh: GroupCallMeshUi,
    onDismiss: () -> Unit,
    viewModel: CallInviteViewModel = hiltViewModel(),
) {
    val invite by viewModel.state.collectAsStateWithLifecycle()
    val excluded = CallInviteCandidates.excludedIds(selfId, primaryUserId, mesh.roster, invite.ringing)
    val candidates = CallInviteCandidates.filter(invite.friends, excluded) { it.id }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = MeeshySpacing.lg)) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.call_moderation_cancel)) }
                Text(
                    text = stringResource(R.string.call_invite_sheet_title),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f).padding(horizontal = MeeshySpacing.md),
                )
            }
            if (invite.isLoaded && candidates.isEmpty()) {
                Text(
                    text = stringResource(R.string.call_invite_sheet_empty),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.xl),
                )
            } else {
                LazyColumn {
                    items(candidates, key = { it.id }) { friend ->
                        CallInviteRow(friend) {
                            viewModel.invite(friend.id)
                            onDismiss()
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CallInviteRow(friend: FriendRequestUser, onClick: () -> Unit) {
    val name = friend.displayName?.takeIf { it.isNotBlank() } ?: friend.username
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 56.dp)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = MeeshySpacing.xl, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(name = name, imageUrl = friend.avatar, size = 40.dp)
        Text(name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Icon(MeeshyIcons.PersonAdd, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
    }
}

