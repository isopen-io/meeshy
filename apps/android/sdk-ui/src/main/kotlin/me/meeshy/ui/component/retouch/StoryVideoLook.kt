package me.meeshy.ui.component.retouch

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.platform.LocalContext
import androidx.core.graphics.drawable.toBitmap
import coil.imageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import java.io.File
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.max
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.RetouchVideoEffects
import me.meeshy.sdk.media.RetouchVideoExporter
import me.meeshy.sdk.media.RetouchVideoLook
import me.meeshy.ui.component.media.ComposerLiveEffects
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.composer.look.ComposerLookCanvas
import me.meeshy.sdk.model.composer.look.ComposerPhotoFrame
import me.meeshy.sdk.model.composer.look.ComposerVideoEdit
import me.meeshy.sdk.model.composer.look.StoryMediaLookMapping

/**
 * **LE LOOK D'UNE VIDÉO DE LA SCÈNE, PAR LES EFFETS DE LA RETOUCHE** (#13841, miroir de `StoryVideoAdjustmentsProcessor`
 * et `StoryPublicationLookBake.bakedVideo` iOS) : le cadrage, le filtre puis le cadre, posés par les MÊMES effets Media3
 * sur le lecteur vivant de la scène et sur le rendu de la publication ([RetouchVideoEffects]) — ce qu'on voit est ce qui
 * part. Une vidéo ne peint ni l'effet de visage ni rien d'autre que [StoryMediaLookMapping.videoLook].
 */
public object StoryVideoLook {

    /**
     * Les effets qui peignent [look] sur une vidéo de [width] × [height] (debout) ; [still], une image de la vidéo, donne
     * le fond que certains cadres tirent de la prise. `null` quand le look ne peint rien ou que son cadre ne se peint pas.
     */
    public fun effects(look: StoryMediaLook?, author: ComposerLookAuthor, width: Int, height: Int, still: Bitmap?): ComposerLiveEffects? =
        painted(look, author, width, height, still)?.let { ComposerLiveEffects(RetouchVideoEffects.of(it.cropNdc, it.look)) }

    /** Le look prêt pour le GPU : le recadrage du cadrage (bornes du GPU), puis la couleur et le cadre. */
    internal class Painted(val cropNdc: FloatArray?, val look: RetouchVideoLook)

    internal fun painted(look: StoryMediaLook?, author: ComposerLookAuthor, width: Int, height: Int, still: Bitmap?): Painted? {
        if (!StoryMediaLookMapping.videoPaints(look)) return null
        val crop = StoryMediaLookMapping.framingCrop(look?.framing)
        val (renderedWidth, renderedHeight) = renderedVideoSize(width, height, crop)
        val framed = still?.let { ComposerLookPainter.cropped(it, crop) }
        val painted = RetouchVideoLookPainter.paint(StoryMediaLookMapping.videoLook(look), author, renderedWidth, renderedHeight, framed) ?: return null
        return Painted(crop?.let(RetouchVideoExporter::ndc), painted)
    }

    /**
     * La vidéo [source] cuite dans [output] avec son [look], entière et avec son son, comme la scène la montrait ;
     * `false` si elle ne se lit pas ou ne se rend pas (la publication le dit, elle ne publie pas l'original).
     */
    public suspend fun bake(context: Context, source: File, look: StoryMediaLook, author: ComposerLookAuthor, output: File): Boolean {
        try {
            val probe = withContext(Dispatchers.IO) { RetouchVideoProbe.of(source) } ?: return false
            val crop = StoryMediaLookMapping.framingCrop(look.framing)
            val painted = withContext(Dispatchers.Default) {
                val frames = StoryMediaLookMapping.videoLook(look).frame != ComposerPhotoFrame.None
                val still = if (frames) RetouchVideoStill.of(source, 0, max(probe.width, probe.height)) else null
                val (width, height) = probe.rendered(crop)
                val framed = still?.let { ComposerLookPainter.cropped(it, crop) }
                RetouchVideoLookPainter.paint(StoryMediaLookMapping.videoLook(look), author, width, height, framed)
            } ?: return false
            RetouchVideoExporter.export(context, source, ComposerVideoEdit(probe.durationSeconds, crop = crop), output, look = painted)
            return output.length() > 0
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            return false
        }
    }
}

/**
 * Les effets que le lecteur vivant de la scène pose sur une vidéo réglée : `null` sans look qui peigne (aucun pipeline
 * d'effets n'est ouvert), une liste vide le temps de peindre, puis les effets. [size] : la vidéo debout quand elle est
 * connue, sinon lue dans le fichier de l'appareil ([videoUrl] en `file:`) ; [poster] : son affiche, chargée seulement
 * pour un cadre qui tire son fond de la prise ; [author] : la personne que les cadres écrivent.
 */
@Composable
public fun rememberStoryVideoLookEffects(
    look: StoryMediaLook?,
    videoUrl: String,
    size: Pair<Int, Int>?,
    poster: Any?,
    author: ComposerLookAuthor,
): ComposerLiveEffects? {
    if (!StoryMediaLookMapping.videoPaints(look)) return null
    val context = LocalContext.current
    val effects by produceState(ComposerLiveEffects.PENDING, look, videoUrl, size, poster, author) {
        val (width, height) = size ?: withContext(Dispatchers.IO) { probedSize(videoUrl) } ?: return@produceState
        val frames = StoryMediaLookMapping.videoLook(look).frame != ComposerPhotoFrame.None
        val still = if (frames) posterBitmap(context, poster) else null
        value = withContext(Dispatchers.Default) { StoryVideoLook.effects(look, author, width, height, still) } ?: ComposerLiveEffects.PENDING
    }
    return effects
}

private fun probedSize(videoUrl: String): Pair<Int, Int>? {
    val uri = Uri.parse(videoUrl)
    if (uri.scheme != "file") return null
    val probe = uri.path?.let { RetouchVideoProbe.of(File(it)) } ?: return null
    return probe.width to probe.height
}

private suspend fun posterBitmap(context: Context, poster: Any?): Bitmap? {
    if (poster == null) return null
    if (poster is Bitmap) return poster
    val request = ImageRequest.Builder(context).data(poster).size(ComposerLookCanvas.PREVIEW_LONG_SIDE).allowHardware(false).build()
    return runCatching { (context.imageLoader.execute(request) as? SuccessResult)?.drawable?.toBitmap() }.getOrNull()
}
