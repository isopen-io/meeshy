package me.meeshy.app.chat

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Renders [download]'s current state as a compact banner at the bottom of the
 * conversation — the visible half of "tap → download with progress → open" for a
 * FILE attachment ([MessageAction.OpenFile]/[MessageAction.ShareFile]). `null` = no
 * download in flight, renders nothing.
 *
 * On [FileAttachmentDownloadState.Completed] this fires the `ACTION_VIEW`/`ACTION_SEND`
 * intent itself (it owns the [LocalContext]) and dismisses — the ViewModel only ever
 * sees "downloaded", never "opened".
 */
@Composable
internal fun FileAttachmentDownloadOverlay(
    download: FileAttachmentDownloadUiState?,
    onDismiss: () -> Unit,
    onRetry: (FileAttachmentDownloadUiState) -> Unit,
) {
    val context = LocalContext.current
    val openFailedMessage = stringResource(R.string.chat_file_open_failed)

    LaunchedEffect(download?.state, download?.attachmentId) {
        val completed = (download?.state as? FileAttachmentDownloadState.Completed) ?: return@LaunchedEffect
        val uri = completed.localUri.toUri()
        val intent = if (download.openWhenDone) {
            FileAttachmentIntentResolver.viewIntent(uri, completed.mimeType, download.fileName)
        } else {
            FileAttachmentIntentResolver.shareIntent(uri, completed.mimeType, download.fileName)
        }
        val launched = runCatching { context.startActivity(intent) }.isSuccess
        if (!launched) {
            Toast.makeText(context, openFailedMessage, Toast.LENGTH_SHORT).show()
        }
        onDismiss()
    }

    // `fillMaxSize` (not just width) so `align(BottomCenter)` below has vertical room to
    // work with — this overlay is a screen-wide sibling of `Scaffold`, not nested inside
    // one of its own layout slots.
    Box(modifier = Modifier.fillMaxSize()) {
        AnimatedVisibility(
            visible = download != null && download.state !is FileAttachmentDownloadState.Completed,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(MeeshySpacing.md),
        ) {
            if (download == null) return@AnimatedVisibility
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = MeeshyTheme.tokens.backgroundSecondary,
                tonalElevation = 4.dp,
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                ) {
                    FileAttachmentDownloadStatusIcon(download.state)
                    Text(
                        text = fileAttachmentDownloadLabel(download),
                        color = MeeshyTheme.tokens.textPrimary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    val failure = (download.state as? FileAttachmentDownloadState.Failed)?.reason
                    if (failure == FileAttachmentDownloadFailure.NetworkError ||
                        failure == FileAttachmentDownloadFailure.ServerError
                    ) {
                        TextButton(onClick = { onRetry(download) }) {
                            Text(stringResource(R.string.chat_retry))
                        }
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = stringResource(R.string.chat_file_download_dismiss),
                            tint = MeeshyTheme.tokens.textSecondary,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FileAttachmentDownloadStatusIcon(state: FileAttachmentDownloadState) {
    when (state) {
        is FileAttachmentDownloadState.InProgress -> {
            val percent = state.progressPercent
            if (percent != null) {
                LinearProgressIndicator(
                    progress = { percent / 100f },
                    modifier = Modifier.width(28.dp),
                )
            } else {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            }
        }
        is FileAttachmentDownloadState.Failed -> Icon(
            imageVector = Icons.Filled.InsertDriveFile,
            contentDescription = null,
            tint = MeeshyTheme.tokens.error,
        )
        is FileAttachmentDownloadState.Completed -> Unit
    }
}

@Composable
private fun fileAttachmentDownloadLabel(download: FileAttachmentDownloadUiState): String = when (val s = download.state) {
    is FileAttachmentDownloadState.InProgress -> s.progressPercent?.let {
        stringResource(R.string.chat_file_download_progress, download.fileName, it)
    } ?: stringResource(R.string.chat_file_download_progress_indeterminate, download.fileName)
    is FileAttachmentDownloadState.Failed -> when (s.reason) {
        FileAttachmentDownloadFailure.Expired -> stringResource(R.string.chat_file_download_expired)
        FileAttachmentDownloadFailure.NotAvailable -> stringResource(R.string.chat_file_download_not_available)
        FileAttachmentDownloadFailure.NetworkError -> stringResource(R.string.chat_file_download_failed_network)
        FileAttachmentDownloadFailure.ServerError -> stringResource(R.string.chat_file_download_failed_server)
    }
    is FileAttachmentDownloadState.Completed -> ""
}
