package me.meeshy.app.feed

import android.content.Context
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.feature.feed.R
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.CommentPieceKind
import me.meeshy.ui.component.bubble.BubbleFile
import me.meeshy.ui.component.comments.CommentAttachmentsTray
import me.meeshy.ui.component.comments.CommentTrayLabels
import me.meeshy.ui.component.comments.CommentTrayTile
import me.meeshy.ui.component.bubble.BubbleFileRow
import me.meeshy.ui.component.composer.PieceRemoveBadge
import me.meeshy.ui.component.composer.PieceRemoveBadgeGeometry
import me.meeshy.ui.component.retouch.RetouchSourceDecoder
import me.meeshy.ui.component.retouch.RetouchVideoProbe
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val PieceShape = RoundedCornerShape(MeeshyRadius.md)
private val PieceSize = 56.dp
private val MediaSize = 120.dp

/** Assez pour une vignette de 56 dp nette, l'orientation EXIF cuite : une prise de l'objectif n'y arrive pas couchée. */
private const val PIECE_THUMBNAIL_LONG_SIDE = 256

/**
 * Les médias d'un commentaire, sous son texte : une vignette par pièce, une vidéo marquée comme telle. Toucher une pièce
 * l'ouvre en plein écran (#13915) quand un [CommentMediaFullscreen] l'entoure.
 */
@Composable
internal fun CommentMediaStrip(media: List<CommentMediaPreview>) {
    if (media.isEmpty()) return
    media.filter { it.isAudio }.forEach { CommentAudioChip(it) }
    media.filter { it.isFile }.forEach { CommentFileRow(it) }
    val visual = media.filter { it.kind.isVisual }
    if (visual.isEmpty()) return
    CommentVisualStrip(visual)
}

/**
 * #14386 — un fichier joint se lit comme dans une conversation ([BubbleFileRow] : trombone, nom, taille) ; le toucher
 * l'ouvre hors de Meeshy (le navigateur ou l'application qui sait le lire le télécharge).
 */
@Composable
private fun CommentFileRow(item: CommentMediaPreview) {
    val uriHandler = LocalUriHandler.current
    val url = item.url
    BubbleFileRow(
        file = BubbleFile(attachmentId = item.id, name = item.fileName, sizeBytes = item.fileSize, url = url),
        onColor = MeeshyTheme.tokens.textPrimary,
        onClick = url?.let { { runCatching { uriHandler.openUri(it) } } },
        modifier = Modifier.padding(top = MeeshySpacing.xs),
    )
}

@Composable
private fun CommentVisualStrip(media: List<CommentMediaPreview>) {
    val open = LocalCommentMediaOpener.current
    val photoLabel = stringResource(R.string.post_comments_media_image)
    val videoLabel = stringResource(R.string.post_comments_media_video)
    val enlarge = stringResource(R.string.post_comments_media_open)
    val play = stringResource(R.string.post_comments_media_play)
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        media.forEachIndexed { index, item ->
            val touch = if (open != null && item.url != null) {
                Modifier.clickable(onClickLabel = if (item.isVideo) play else enlarge, role = Role.Button) { open(media, index) }
            } else {
                Modifier
            }
            Box(
                Modifier.size(MediaSize).clip(PieceShape).background(MeeshyTheme.tokens.backgroundTertiary)
                    .then(touch)
                    .semantics(mergeDescendants = true) { contentDescription = if (item.isVideo) videoLabel else photoLabel },
                contentAlignment = Alignment.Center,
            ) {
                item.thumbnailUrl?.let { AsyncImage(model = it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
                if (item.isVideo) Icon(MeeshyIcons.PlayCircleFilled, contentDescription = null, tint = Color.White, modifier = Modifier.size(32.dp))
            }
        }
    }
}

/**
 * Le bandeau des pièces du composeur (#12972) : la zone commune [CommentAttachmentsTray] (sdk-ui, mêmes tuiles que le
 * message) ; la vignette, elle, vient d'ici — la zone ne lit aucun fichier.
 */
@Composable
internal fun CommentAttachmentBar(tray: CommentAttachmentTray, onEdit: (CommentPendingPiece) -> Unit, onRemove: (String) -> Unit) {
    val labels = CommentTrayLabels(
        edit = stringResource(R.string.post_comments_edit_media),
        remove = stringResource(R.string.feed_composer_remove_media),
        preparing = stringResource(R.string.comment_tray_preparing),
    )
    val tiles = tray.pieces.map { CommentTrayTile(it.id, CommentPieceKind.of(it.item.mimeType), it.item.fileName, isLoading = it.uploaded == null) }
    CommentAttachmentsTray(tiles, labels, onEdit = { tile -> tray.piece(tile.id)?.let(onEdit) }, onRemove = onRemove) { tile ->
        tray.piece(tile.id)?.let { PieceThumbnail(it) }
    }
}

@Composable
private fun PieceThumbnail(piece: CommentPendingPiece) {
    if (piece.isFile) {
        PieceFileThumbnail(piece)
        return
    }
    if (piece.isVideo || piece.isAudio) {
        Icon(if (piece.isAudio) MeeshyIcons.Mic else MeeshyIcons.Video, contentDescription = null, tint = MeeshyPalette.Indigo500)
        return
    }
    val bitmap = remember(piece.item) {
        runCatching { RetouchSourceDecoder.decode(piece.item.bytes, longSide = PIECE_THUMBNAIL_LONG_SIDE) }.getOrNull()
    }
    bitmap?.let { Image(it.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
}

/** Un fichier du bandeau (#14386) : le trombone et le nom, qui se lit sous le pouce. */
@Composable
private fun PieceFileThumbnail(piece: CommentPendingPiece) {
    androidx.compose.foundation.layout.Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.padding(MeeshySpacing.xxs).semantics(mergeDescendants = true) { contentDescription = piece.item.fileName },
    ) {
        Icon(MeeshyIcons.AttachFile, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(20.dp))
        androidx.compose.material3.Text(
            text = piece.item.fileName,
            style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textSecondary,
            maxLines = 1,
            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
        )
    }
}

/**
 * **UNE PIÈCE DU COMMENTAIRE S'OUVRE DANS LA RETOUCHE UNIQUE** (#12735) — miroir de `CommentSceneRetouch` (iOS) :
 * une photo dans la retouche photo, une vidéo dans la retouche vidéo ; « Terminé » la remplace à sa place, une
 * pièce intouchée ne bouge pas. Rend le geste « Éditer » du bandeau.
 */
@Composable
internal fun rememberCommentPieceRetouch(onReplace: (String, MediaUploadItem, CommentPieceRetouch?) -> Unit): (CommentPendingPiece) -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var photo by remember { mutableStateOf<Pair<String, FeedRetouchPending>?>(null) }
    var video by remember { mutableStateOf<Pair<String, FeedVideoRetouchPending>?>(null) }
    photo?.let { (id, pending) ->
        FeedCaptureRetouchHost(pending, onDeliver = { piece -> photo = null; piece?.let { onReplace(id, it.item, it.retouch) } }, onDismiss = { photo = null })
    }
    video?.let { (id, pending) ->
        FeedVideoRetouchHost(
            pending,
            onDeliver = { item -> video = null; item?.takeIf { it.fileName != pending.fileName }?.let { onReplace(id, it, null) } },
            onDismiss = { pending.discard(); video = null },
        )
    }
    return { piece ->
        if (!piece.isFile) scope.launch {
            if (piece.isVideo) {
                commentVideoPending(context, piece.item)?.let { video = piece.id to it }
            } else {
                withContext(Dispatchers.Default) { FeedRetouchPending.of(piece.source, piece.retouch) }?.let { photo = piece.id to it }
            }
        }
    }
}

/** La vidéo d'une pièce, posée dans le dossier de prises le temps de sa retouche ; `null` si elle ne se lit pas. */
private suspend fun commentVideoPending(context: Context, item: MediaUploadItem): FeedVideoRetouchPending? = withContext(Dispatchers.IO) {
    val dir = File(context.cacheDir, "captures").apply { mkdirs() }
    val now = System.currentTimeMillis()
    val source = File(dir, "comment_video_source_$now.mp4")
    val probe = runCatching { item.source.open().use { input -> source.outputStream().use { input.copyTo(it) } } }.getOrNull()?.let { RetouchVideoProbe.of(source) }
    if (probe == null) {
        source.delete()
        return@withContext null
    }
    FeedVideoRetouchPending(source, File(dir, "comment_video_retouche_$now.mp4"), probe, item.fileName.ifBlank { "video.mp4" })
}
