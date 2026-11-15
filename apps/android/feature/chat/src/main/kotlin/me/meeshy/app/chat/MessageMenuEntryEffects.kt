package me.meeshy.app.chat

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import kotlinx.coroutines.launch
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.MimeTypeResolver
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.viewer.GalleryImageSaver

/** The gallery source of the bubble's ONLY photo or video: its address and the type the gallery files it under. */
internal data class GallerySource(val url: String, val mimeHint: String?)

internal val BubbleContent.onlyGallerySource: GallerySource?
    get() {
        if (menuPieces.size != 1) return null
        images.singleOrNull()?.let { return GallerySource(it.url, null) }
        val video = files.singleOrNull()?.takeIf { it.isVideo } ?: return null
        val url = video.url ?: return null
        return GallerySource(url, MimeTypeResolver.resolve(null, video.name ?: url))
    }

/**
 * « Enregistrer » (iOS `.saveMedia`) : la seule photo ou vidéo du message part dans la galerie par [GalleryImageSaver],
 * hors de la feuille d'actions qui se referme ; le résultat se dit par un toast, comme la visionneuse.
 */
@Composable
internal fun rememberSaveMessageMedia(): (BubbleContent) -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val saved = stringResource(R.string.image_saved_to_gallery)
    val failed = stringResource(R.string.image_save_failed)
    return remember(context, scope, saved, failed) {
        { bubble ->
            val source = bubble.onlyGallerySource
            if (source == null || !GalleryImageSaver.isSupported) {
                Toast.makeText(context, failed, Toast.LENGTH_SHORT).show()
            } else {
                scope.launch {
                    val result = GalleryImageSaver.save(context, source.url, source.mimeHint)
                    Toast.makeText(context, if (result.isSuccess) saved else failed, Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}

/** « Partager » le texte d'un message (iOS `.share`) : la feuille de partage du système. */
internal fun shareMessageText(context: Context, text: String, chooserTitle: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    try {
        context.startActivity(Intent.createChooser(send, chooserTitle))
    } catch (_: ActivityNotFoundException) {
        Unit
    }
}
