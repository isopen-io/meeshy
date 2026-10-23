package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import java.io.File
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.composer.PendingAttachment
import me.meeshy.sdk.model.composer.PendingAttachmentPhase
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La rangée des pièces en attente au-dessus du champ de saisie : une vignette par pièce
 * (anneau de préparation tant qu'elle se prépare) et un bouton de retrait. Projection
 * mince de l'état du plateau — le décor final du plateau appartient à un autre lot.
 */
@Composable
internal fun ComposerPendingStrip(
    items: List<PendingAttachment>,
    onRemove: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (items.isEmpty()) return
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        items.forEach { item -> PendingChip(item = item, onRemove = { onRemove(item.id) }) }
    }
}

@Composable
private fun PendingChip(item: PendingAttachment, onRemove: () -> Unit) {
    val name = item.fileName.orEmpty()
    val removeLabel = stringResource(R.string.chat_tray_remove, name)
    val preparingLabel = stringResource(R.string.chat_tray_preparing, name)
    Box(modifier = Modifier.size(CHIP_SIZE)) {
        Box(
            modifier = Modifier
                .size(CHIP_SIZE)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(MeeshyTheme.tokens.backgroundTertiary),
            contentAlignment = Alignment.Center,
        ) {
            val thumbnail = item.thumbnailPath ?: item.localPath.takeIf { item.type == PendingAttachmentType.IMAGE }
            when {
                item.phase is PendingAttachmentPhase.Preparing -> CircularProgressIndicator(
                    modifier = Modifier
                        .size(24.dp)
                        .semantics { contentDescription = preparingLabel },
                    strokeWidth = 2.dp,
                )
                thumbnail != null -> AsyncImage(
                    model = File(thumbnail),
                    contentDescription = name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(CHIP_SIZE),
                )
                else -> Icon(
                    imageVector = when (item.type) {
                        PendingAttachmentType.AUDIO -> Icons.Filled.Mic
                        PendingAttachmentType.VIDEO -> Icons.Filled.PlayCircle
                        else -> Icons.AutoMirrored.Filled.InsertDriveFile
                    },
                    contentDescription = name,
                    tint = MeeshyTheme.tokens.textSecondary,
                )
            }
        }
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .size(REMOVE_TARGET)
                .clickable(onClick = onRemove)
                .semantics {
                    contentDescription = removeLabel
                    role = Role.Button
                },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier
                    .size(16.dp)
                    .clip(RoundedCornerShape(50))
                    .background(MeeshyTheme.tokens.backgroundSecondary),
            )
        }
    }
}

private val CHIP_SIZE = 64.dp
private val REMOVE_TARGET = 48.dp

/** Le plateau d'un écran qui n'a pas reçu de contrôleur : aucune pièce en attente. */
internal val NO_PENDING: kotlinx.coroutines.flow.StateFlow<me.meeshy.sdk.model.composer.PendingAttachmentsState> =
    kotlinx.coroutines.flow.MutableStateFlow(me.meeshy.sdk.model.composer.PendingAttachmentsState())
