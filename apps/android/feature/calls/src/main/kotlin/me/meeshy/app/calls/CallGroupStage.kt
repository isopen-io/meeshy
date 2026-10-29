package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.call.group.CallInviteCandidates
import me.meeshy.sdk.model.call.group.GroupCallGridLayout
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
 * La scène d'un appel de groupe (iOS `GroupCallStageView`, grille), posée ENTRE l'en-tête et la pilule : ma
 * vignette d'abord, puis les membres dans l'ordre d'arrivée — la grille ne se réagence jamais. Une vignette sans
 * vidéo montre l'avatar ; toucher la scène rallume ou éteint le chrome, comme partout sur l'écran d'appel.
 */
@Composable
internal fun CallGroupStage(
    state: CallUiState,
    mesh: GroupCallMeshUi,
    localTrack: VideoTrack?,
    primaryTrack: VideoTrack?,
    eglContext: EglBase.Context,
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
    val stageLabel = stringResource(R.string.call_group_stage)
    BoxWithConstraints(modifier.semantics { contentDescription = stageLabel }) {
        val layout = GroupCallGridLayout.layout(tiles.size, isLandscape = maxWidth > maxHeight)
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(GRID_SPACING)) {
            tiles.chunked(layout.columns).forEach { row ->
                Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(GRID_SPACING)) {
                    row.forEach { tile ->
                        val track = when {
                            tile.isLocal -> localTrack
                            tile.id == mesh.primaryUserId && !mesh.isPrimaryVacated -> primaryTrack
                            else -> mesh.videoTracks[tile.id]
                        }
                        CallGroupTile(
                            tile = tile,
                            track = track.takeIf { tile.showsVideo },
                            eglContext = eglContext,
                            mirror = tile.isLocal && state.isFrontCamera,
                            onTap = onStageTap,
                            modifier = Modifier.weight(1f).fillMaxSize(),
                        )
                    }
                    repeat(layout.columns - row.size) { Box(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
private fun CallGroupTile(
    tile: GroupCallStageTile,
    track: VideoTrack?,
    eglContext: EglBase.Context,
    mirror: Boolean,
    onTap: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val name = tile.displayName.ifBlank { stringResource(R.string.call_group_tile_unknown) }
    Box(
        modifier
            .clip(RoundedCornerShape(TILE_RADIUS))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .alpha(if (tile.isReconnecting) RECONNECTING_ALPHA else 1f)
            .then(if (onTap != null) Modifier.clickable(onClick = onTap) else Modifier)
            .semantics(mergeDescendants = true) {},
    ) {
        if (track != null) {
            VideoRenderer(track = track, eglContext = eglContext, mirror = mirror, modifier = Modifier.fillMaxSize())
        } else {
            MeeshyAvatar(name = name, imageUrl = tile.avatarUrl, size = AVATAR_SIZE, modifier = Modifier.align(Alignment.Center))
        }
        Row(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(MeeshySpacing.sm)
                .clip(RoundedCornerShape(TILE_RADIUS))
                .background(MaterialTheme.colorScheme.scrim.copy(alpha = LABEL_SCRIM_ALPHA))
                .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            if (tile.isMicMuted) {
                Icon(MeeshyIcons.MicOff, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(14.dp))
            }
            Text(
                text = name,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
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

private val GRID_SPACING = 8.dp
private val TILE_RADIUS = 16.dp
private val AVATAR_SIZE = 72.dp
private const val RECONNECTING_ALPHA = 0.6f
private const val LABEL_SCRIM_ALPHA = 0.55f
