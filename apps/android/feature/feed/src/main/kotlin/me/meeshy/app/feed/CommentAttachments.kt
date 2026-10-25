package me.meeshy.app.feed

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.feature.feed.R
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.ui.component.retouch.RetouchVideoProbe
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val PieceShape = RoundedCornerShape(MeeshyRadius.md)
private val PieceSize = 56.dp
private val MediaSize = 120.dp

/** Les médias d'un commentaire, sous son texte : une vignette par pièce, une vidéo marquée comme telle. */
@Composable
internal fun CommentMediaStrip(media: List<CommentMediaPreview>) {
    if (media.isEmpty()) return
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        media.forEach { item ->
            Box(Modifier.size(MediaSize).clip(PieceShape).background(MeeshyTheme.tokens.backgroundTertiary), contentAlignment = Alignment.Center) {
                item.thumbnailUrl?.let { AsyncImage(model = it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
                if (item.isVideo) Icon(MeeshyIcons.PlayCircleFilled, contentDescription = null, tint = Color.White, modifier = Modifier.size(32.dp))
            }
        }
    }
}

/**
 * Le bandeau des pièces du composeur (#12972) : une vignette par pièce ; la toucher l'ouvre dans la retouche
 * unique (#12735), (x) la retire ; une pièce qui se téléverse porte son indicateur.
 */
@Composable
internal fun CommentAttachmentBar(tray: CommentAttachmentTray, onEdit: (CommentPendingPiece) -> Unit, onRemove: (String) -> Unit) {
    if (!tray.hasMedia) return
    val removeLabel = stringResource(R.string.feed_composer_remove_media)
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        tray.pieces.forEach { piece ->
            val editLabel = stringResource(R.string.post_comments_edit_media, piece.item.fileName)
            Box(Modifier.size(PieceSize)) {
                Box(
                    Modifier.size(PieceSize).clip(PieceShape).background(MeeshyTheme.tokens.inputBackground)
                        .clickable(onClickLabel = editLabel, role = Role.Button) { onEdit(piece) },
                    contentAlignment = Alignment.Center,
                ) {
                    PieceThumbnail(piece)
                    if (piece.uploaded == null) CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                }
                IconButton(
                    onClick = { onRemove(piece.id) },
                    modifier = Modifier.size(20.dp).align(Alignment.TopEnd).background(Color.Black.copy(alpha = 0.6f), CircleShape),
                ) {
                    Icon(MeeshyIcons.Close, contentDescription = removeLabel, tint = MeeshyPalette.White, modifier = Modifier.size(12.dp))
                }
            }
        }
    }
}

@Composable
private fun PieceThumbnail(piece: CommentPendingPiece) {
    if (piece.isVideo) {
        Icon(MeeshyIcons.Video, contentDescription = null, tint = MeeshyPalette.Indigo500)
        return
    }
    val bitmap = remember(piece.item) {
        val options = BitmapFactory.Options().apply { inSampleSize = 8 }
        runCatching { BitmapFactory.decodeByteArray(piece.item.bytes, 0, piece.item.bytes.size, options) }.getOrNull()
    }
    bitmap?.let { Image(it.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
}

/** Le bouton « joindre » du composeur : la galerie, photo ou vidéo ; ce qui se lit part au bandeau. */
@Composable
internal fun CommentAttachButton(enabled: Boolean, onPicked: (MediaUploadItem) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch { withContext(Dispatchers.IO) { context.contentResolver.readMediaUploadItem(uri) }?.let(onPicked) }
    }
    IconButton(
        onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)) },
        enabled = enabled,
    ) {
        Icon(MeeshyIcons.PhotoFilled, contentDescription = stringResource(R.string.feed_composer_attach_media),
            tint = if (enabled) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textMuted)
    }
}

/**
 * **UNE PIÈCE DU COMMENTAIRE S'OUVRE DANS LA RETOUCHE UNIQUE** (#12735) — miroir de `CommentSceneRetouch` (iOS) :
 * une photo dans la retouche photo, une vidéo dans la retouche vidéo ; « Terminé » la remplace à sa place, une
 * pièce intouchée ne bouge pas. Rend le geste « Éditer » du bandeau.
 */
@Composable
internal fun rememberCommentPieceRetouch(onReplace: (String, MediaUploadItem) -> Unit): (CommentPendingPiece) -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var photo by remember { mutableStateOf<Pair<String, FeedRetouchPending>?>(null) }
    var video by remember { mutableStateOf<Pair<String, FeedVideoRetouchPending>?>(null) }
    photo?.let { (id, pending) ->
        FeedCaptureRetouchHost(pending, onDeliver = { item -> photo = null; if (item !== pending.item) onReplace(id, item) }, onDismiss = { photo = null })
    }
    video?.let { (id, pending) ->
        FeedVideoRetouchHost(
            pending,
            onDeliver = { item -> video = null; item?.takeIf { it.fileName != pending.fileName }?.let { onReplace(id, it) } },
            onDismiss = { pending.discard(); video = null },
        )
    }
    return { piece ->
        scope.launch {
            if (piece.isVideo) {
                commentVideoPending(context, piece.item)?.let { video = piece.id to it }
            } else {
                withContext(Dispatchers.Default) { FeedRetouchPending.of(piece.item) }?.let { photo = piece.id to it }
            }
        }
    }
}

/** La vidéo d'une pièce, posée dans le dossier de prises le temps de sa retouche ; `null` si elle ne se lit pas. */
private suspend fun commentVideoPending(context: Context, item: MediaUploadItem): FeedVideoRetouchPending? = withContext(Dispatchers.IO) {
    val dir = File(context.cacheDir, "captures").apply { mkdirs() }
    val now = System.currentTimeMillis()
    val source = File(dir, "comment_video_source_$now.mp4")
    val probe = runCatching { source.writeBytes(item.bytes) }.getOrNull()?.let { RetouchVideoProbe.of(source) }
    if (probe == null) {
        source.delete()
        return@withContext null
    }
    FeedVideoRetouchPending(source, File(dir, "comment_video_retouche_$now.mp4"), probe, item.fileName.ifBlank { "video.mp4" })
}
