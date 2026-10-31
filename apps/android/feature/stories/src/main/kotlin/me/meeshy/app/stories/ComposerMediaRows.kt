package me.meeshy.app.stories

import androidx.compose.runtime.remember
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.foundation.selection.selectable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Wallpaper
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.UploadedMedia

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MediaPreviewRow(
    attachments: List<UploadedMedia>,
    pending: List<PendingMediaUpload>,
    mediaBaseUrl: String?,
    backgroundMediaId: String?,
    onRemove: (String) -> Unit,
    onToggleBackground: (String) -> Unit,
    selectedMediaId: String? = null,
    onSelect: ((String) -> Unit)? = null,
    placedMediaIds: Set<String> = emptySet(),
    onTogglePlaced: ((String) -> Unit)? = null,
    pendingPhase: (String) -> PendingUploadPhase = { PendingUploadPhase.OFFLINE },
    onRetryPending: ((String) -> Unit)? = null,
) {
    LazyRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(attachments, key = { it.id }) { media ->
            val isBackground = media.id == backgroundMediaId
            MediaThumbnail(
                model = ComposerPicture.of(media, mediaBaseUrl),
                isPending = false,
                isBackground = isBackground,
                selected = media.id == selectedMediaId,
                onSelect = onSelect?.let { select -> { select(media.id) } },
                onRemove = { onRemove(media.id) },
                onToggleBackground = { onToggleBackground(media.id) },
                isPlaced = media.id in placedMediaIds,
                onTogglePlaced = onTogglePlaced?.takeIf { !isBackground }?.let { toggle -> { toggle(media.id) } },
            )
        }
        items(pending, key = { it.cmid }) { upload ->
            val phase = pendingPhase(upload.cmid)
            MediaThumbnail(
                model = remember(upload.cmid) { ComposerPicture.of(upload.item) },
                isPending = true,
                pendingPhase = phase,
                onRemove = { onRemove(upload.cmid) },
                onSelect = onRetryPending?.takeIf { phase == PendingUploadPhase.FAILED }?.let { retry -> { retry(upload.cmid) } },
            )
        }
    }
}

/** La vignette d'un média : assez grande pour que ses quatre coins portent chacun une cible de 48 dp sans empiéter sur sa voisine. */
private val TILE_SIZE = 96.dp
private val TILE_ACTION_TARGET = 48.dp
private val TILE_ACTION_DISC = 24.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MediaThumbnail(
    model: Any?,
    isPending: Boolean,
    onRemove: () -> Unit,
    pendingPhase: PendingUploadPhase = PendingUploadPhase.OFFLINE,
    isBackground: Boolean = false,
    onToggleBackground: (() -> Unit)? = null,
    selected: Boolean = false,
    onSelect: (() -> Unit)? = null,
    isPlaced: Boolean = false,
    onTogglePlaced: (() -> Unit)? = null,
) {
    val selectLabel = if (isPending) pendingPhase.label() else stringResource(R.string.composer_column_media_select)
    Box {
        AsyncImage(
            model = rememberComposerPicture(model),
            contentDescription = if (onSelect != null) selectLabel else null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(TILE_SIZE)
                .clip(RoundedCornerShape(8.dp))
                .then(
                    if (selected) Modifier.border(2.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(8.dp)) else Modifier,
                )
                .then(
                    if (onSelect == null) Modifier
                    else Modifier.selectable(selected = selected, role = Role.Button, onClick = onSelect),
                ),
        )
        if (onToggleBackground != null) {
            TileAction(
                icon = Icons.Filled.Wallpaper,
                label = stringResource(
                    if (isBackground) R.string.stories_composer_background_media_clear else R.string.stories_composer_background_media_set,
                ),
                active = isBackground,
                onClick = onToggleBackground,
                modifier = Modifier.align(Alignment.BottomStart),
            )
        }
        if (onTogglePlaced != null) {
            TileAction(
                icon = Icons.Filled.Layers,
                label = stringResource(R.string.composer_audio_promote_action),
                active = isPlaced,
                onClick = onTogglePlaced,
                modifier = Modifier.align(Alignment.TopStart),
                role = Role.Switch,
                onClickLabel = if (isPlaced) stringResource(R.string.story_canvas_action_leaveScene) else null,
            )
        }
        if (isPending) {
            Surface(
                color = Color.Black.copy(alpha = 0.55f),
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth(),
            ) {
                Text(
                    text = pendingPhase.label(),
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 2.dp),
                )
            }
        }
        TileAction(
            icon = Icons.Filled.Close,
            label = stringResource(R.string.stories_composer_remove_media),
            active = false,
            onClick = onRemove,
            modifier = Modifier.align(Alignment.TopEnd),
        )
    }
}

/**
 * Une action d'un coin de la vignette : une pastille de 24 dp dans une cible de 48 dp. [role] [Role.Switch] en fait un
 * interrupteur dont TalkBack annonce l'état ([active]) ; [onClickLabel] dit alors ce que le double toucher fera.
 */
@Composable
private fun TileAction(
    icon: ImageVector,
    label: String,
    active: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    role: Role = Role.Button,
    onClickLabel: String? = null,
) {
    Box(
        modifier = modifier
            .size(TILE_ACTION_TARGET)
            .clickable(onClickLabel = onClickLabel, role = role, onClick = onClick)
            .semantics {
                contentDescription = label
                if (role == Role.Switch) toggleableState = ToggleableState(active)
            },
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            shape = CircleShape,
            color = if (active) MaterialTheme.colorScheme.primary else Color.Black.copy(alpha = 0.55f),
            modifier = Modifier.size(TILE_ACTION_DISC),
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = if (active) MaterialTheme.colorScheme.onPrimary else Color.White,
                modifier = Modifier.padding(4.dp),
            )
        }
    }
}

/** Ce que dit la vignette d'un média en file (#13959) : « Hors ligne » sans réseau, « Envoi… » quand il repart, sinon « Échec — Réessayer ». */
@Composable
internal fun PendingUploadPhase.label(): String = stringResource(
    when (this) {
        PendingUploadPhase.OFFLINE -> R.string.stories_composer_media_pending
        PendingUploadPhase.SENDING -> R.string.story_composer_upload_resending
        PendingUploadPhase.FAILED -> R.string.story_composer_upload_failed_retry
    },
)
