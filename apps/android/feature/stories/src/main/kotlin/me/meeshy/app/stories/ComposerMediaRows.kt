package me.meeshy.app.stories

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.filled.Loop
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
    backgroundMediaId: String?,
    backgroundIsVideo: Boolean,
    backgroundLoop: Boolean,
    onRemove: (String) -> Unit,
    onToggleBackground: (String) -> Unit,
    onToggleBackgroundLoop: () -> Unit,
) {
    LazyRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(attachments, key = { it.id }) { media ->
            val isBackground = media.id == backgroundMediaId
            MediaThumbnail(
                model = media.thumbnailUrl ?: media.url,
                isPending = false,
                isBackground = isBackground,
                onRemove = { onRemove(media.id) },
                onToggleBackground = { onToggleBackground(media.id) },
                // The loop toggle appears only on the designated background VIDEO — the
                // one media whose looping is authorable — so the control is never a no-op.
                backgroundLoop = if (isBackground && backgroundIsVideo) backgroundLoop else null,
                onToggleBackgroundLoop = onToggleBackgroundLoop,
            )
        }
        items(pending, key = { it.cmid }) { upload ->
            MediaThumbnail(
                model = upload.item.bytes,
                isPending = true,
                onRemove = { onRemove(upload.cmid) },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MediaThumbnail(
    model: Any?,
    isPending: Boolean,
    onRemove: () -> Unit,
    isBackground: Boolean = false,
    onToggleBackground: (() -> Unit)? = null,
    backgroundLoop: Boolean? = null,
    onToggleBackgroundLoop: (() -> Unit)? = null,
) {
    Box {
        AsyncImage(
            model = model,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(72.dp)
                .clip(RoundedCornerShape(8.dp)),
        )
        if (onToggleBackground != null) {
            Surface(
                onClick = onToggleBackground,
                shape = RoundedCornerShape(50),
                color = if (isBackground) {
                    MaterialTheme.colorScheme.primary
                } else {
                    Color.Black.copy(alpha = 0.55f)
                },
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(2.dp)
                    .size(22.dp),
            ) {
                Icon(
                    Icons.Filled.Wallpaper,
                    contentDescription = stringResource(
                        if (isBackground) {
                            R.string.stories_composer_background_media_clear
                        } else {
                            R.string.stories_composer_background_media_set
                        },
                    ),
                    tint = if (isBackground) MaterialTheme.colorScheme.onPrimary else Color.White,
                    modifier = Modifier.padding(3.dp),
                )
            }
        }
        if (backgroundLoop != null && onToggleBackgroundLoop != null) {
            Surface(
                onClick = onToggleBackgroundLoop,
                shape = RoundedCornerShape(50),
                color = if (backgroundLoop) {
                    MaterialTheme.colorScheme.primary
                } else {
                    Color.Black.copy(alpha = 0.55f)
                },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(2.dp)
                    .size(22.dp),
            ) {
                Icon(
                    Icons.Filled.Loop,
                    contentDescription = stringResource(
                        if (backgroundLoop) {
                            R.string.stories_composer_background_loop_on
                        } else {
                            R.string.stories_composer_background_loop_off
                        },
                    ),
                    tint = if (backgroundLoop) MaterialTheme.colorScheme.onPrimary else Color.White,
                    modifier = Modifier.padding(3.dp),
                )
            }
        }
        if (isPending) {
            Surface(
                color = Color.Black.copy(alpha = 0.55f),
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth(),
            ) {
                Text(
                    text = stringResource(R.string.stories_composer_media_pending),
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 2.dp),
                )
            }
        }
        Surface(
            onClick = onRemove,
            shape = RoundedCornerShape(50),
            color = Color.Black.copy(alpha = 0.55f),
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(2.dp)
                .size(22.dp),
        ) {
            Icon(
                Icons.Filled.Close,
                contentDescription = stringResource(R.string.stories_composer_remove_media),
                tint = Color.White,
                modifier = Modifier.padding(3.dp),
            )
        }
    }
}
