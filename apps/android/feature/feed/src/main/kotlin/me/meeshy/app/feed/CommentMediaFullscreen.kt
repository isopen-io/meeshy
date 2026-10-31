package me.meeshy.app.feed

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.ui.component.video.MeeshyVideoViewer
import me.meeshy.ui.component.viewer.ImageViewerExit
import me.meeshy.ui.component.viewer.MeeshyImageViewer

/** Lance l'export d'une scène par le moteur des stories (#13896) : la scène, et la sortie voulue. */
typealias SceneItemExport = (item: StoryItem, mode: StoryExportMode) -> Unit

/**
 * Monte le moteur d'export des stories, que le fil ne connaît pas : l'application le fournit. [key] distingue l'export de
 * cet hôte de celui d'un autre du même écran (le menu d'un post à scène), chacun suivant sa propre course.
 */
typealias SceneItemExportHost = @Composable (key: String) -> SceneItemExport

val LocalSceneItemExportHost = staticCompositionLocalOf<SceneItemExportHost?> { null }

/** Ouvre le plein écran sur un média d'un commentaire : ses médias, et l'index de celui qu'on touche. */
internal val LocalCommentMediaOpener = staticCompositionLocalOf<((List<CommentMediaPreview>, Int) -> Unit)?> { null }

/** Ce qu'ouvre le toucher d'un média de commentaire : la visionneuse sur ses photos, ou la vidéo plein écran. */
sealed interface CommentMediaOpening {
    data class Images(val pieces: List<CommentMediaPreview>, val startIndex: Int) : CommentMediaOpening
    data class Video(val piece: CommentMediaPreview) : CommentMediaOpening
}

/**
 * **UN MÉDIA DE COMMENTAIRE S'OUVRE EN PLEIN ÉCRAN** (#13915, miroir de `CommentMediaView` iOS et `comment-media-viewer`
 * web) : une photo dans la visionneuse des photos du commentaire, sur celle qu'on touche ; une vidéo dans la vidéo plein
 * écran. Une pièce sans fichier n'ouvre rien. L'export d'une vidéo la rend entière, comme le fond d'une scène vide, par le
 * moteur des stories.
 */
object CommentMediaViewing {

    fun open(media: List<CommentMediaPreview>, index: Int): CommentMediaOpening? {
        val touched = media.getOrNull(index)?.takeIf { it.url != null } ?: return null
        if (touched.isVideo) return CommentMediaOpening.Video(touched)
        val photos = media.filter { !it.isVideo && it.url != null }
        return CommentMediaOpening.Images(photos, photos.indexOf(touched))
    }

    /** La scène qu'on exporte : la pièce seule, en fond — une vidéo s'y joue entière, son compris. */
    fun exportItem(piece: CommentMediaPreview): StoryItem = StoryItem(
        id = "$EXPORT_PREFIX${piece.id}",
        media = listOf(
            FeedMedia(
                id = piece.id,
                type = if (piece.isVideo) FeedMediaType.VIDEO else FeedMediaType.IMAGE,
                url = piece.url,
                thumbnailUrl = piece.thumbnailUrl,
                width = piece.width,
                height = piece.height,
                duration = piece.durationMillis?.let { it / MILLIS_PER_SECOND },
            ),
        ),
    )

    fun mode(exit: ImageViewerExit): StoryExportMode = when (exit) {
        ImageViewerExit.Save -> StoryExportMode.SAVE
        ImageViewerExit.Share -> StoryExportMode.SHARE
    }

    private const val EXPORT_PREFIX = "comment-media-"
    private const val MILLIS_PER_SECOND = 1000
}

/**
 * Le plein écran des médias des commentaires de [content] : il tient l'ouverture et l'export, qui survit à la visionneuse —
 * lancer un export la referme, sa progression et sa remise se suivant sur l'écran des commentaires.
 */
@Composable
internal fun CommentMediaFullscreen(content: @Composable () -> Unit) {
    var opening by remember { mutableStateOf<CommentMediaOpening?>(null) }
    val export = LocalSceneItemExportHost.current?.invoke(COMMENT_MEDIA_EXPORT_KEY)
    val opener = remember { { media: List<CommentMediaPreview>, index: Int -> opening = CommentMediaViewing.open(media, index) } }
    CompositionLocalProvider(LocalCommentMediaOpener provides opener, content = content)
    opening?.let { shown -> CommentMediaViewer(shown, export, onDismiss = { opening = null }) }
}

@Composable
private fun CommentMediaViewer(opening: CommentMediaOpening, export: SceneItemExport?, onDismiss: () -> Unit) {
    when (opening) {
        is CommentMediaOpening.Images -> CommentImagesViewer(opening, onDismiss)
        is CommentMediaOpening.Video -> {
            val piece = opening.piece
            val url = piece.url ?: return
            MeeshyVideoViewer(
                mediaUrl = url,
                onDismiss = onDismiss,
                exits = if (export == null) emptyList() else VIDEO_EXITS,
                onExit = { exit ->
                    onDismiss()
                    export?.invoke(CommentMediaViewing.exportItem(piece), CommentMediaViewing.mode(exit))
                },
            )
        }
    }
}

/**
 * Les photos : enregistrées et partagées comme images par la visionneuse elle-même. « Imager » n'est pas une sortie du
 * média : sur iOS il compose la carte du commentaire, depuis son menu (#13922).
 */
@Composable
private fun CommentImagesViewer(opening: CommentMediaOpening.Images, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val savedMessage = stringResource(R.string.feed_media_saved)
    val saveFailedMessage = stringResource(R.string.feed_media_save_failed)
    MeeshyImageViewer(
        imageUrls = opening.pieces.mapNotNull { it.url },
        initialIndex = opening.startIndex,
        onDismiss = onDismiss,
        thumbnailUrls = opening.pieces.map { it.thumbnailUrl },
        onImageSaved = { result ->
            Toast.makeText(context, if (result.isSuccess) savedMessage else saveFailedMessage, Toast.LENGTH_SHORT).show()
        },
    )
}

private const val COMMENT_MEDIA_EXPORT_KEY = "comment-media-export"
private val VIDEO_EXITS = listOf(ImageViewerExit.Save, ImageViewerExit.Share)
