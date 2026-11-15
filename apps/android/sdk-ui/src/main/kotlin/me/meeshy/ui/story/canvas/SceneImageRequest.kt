package me.meeshy.ui.story.canvas

import android.content.Context
import android.os.Build
import coil.decode.GifDecoder
import coil.decode.ImageDecoderDecoder
import coil.request.ImageRequest
import coil.size.Size
import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.scene.SceneMediaLayerRules

/**
 * La requête de chargement d'une image de premier plan : décodée hors du fil principal par Coil, jamais au-delà de
 * 1080 px sur son grand côté ([SceneMediaLayerRules.decodeEdge]), l'orientation EXIF respectée, et le décodeur animé
 * pour un GIF / APNG. Un cadre rogné décode la source ENTIÈRE à la taille qui remplit le rognage.
 */
internal fun sceneImageRequest(context: Context, url: String, frameWidthPx: Int, crop: StoryMediaCrop?, version: Long = 0L): ImageRequest {
    val edge = SceneMediaLayerRules.decodeEdge(frameWidthPx, crop)
    return ImageRequest.Builder(context)
        .data(url)
        .size(Size(edge, edge))
        .crossfade(false)
        .apply { if (version > 0L) memoryCacheKey(SceneEditedBitmapBridge.cacheKey(url, version)) }
        .apply {
            if (SceneMediaLayerRules.isAnimated(url)) {
                decoderFactory(if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) ImageDecoderDecoder.Factory() else GifDecoder.Factory())
            }
        }
        .build()
}
