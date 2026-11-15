package me.meeshy.ui.story.canvas

import android.content.Context
import android.os.Build
import coil.ImageLoader
import coil.decode.GifDecoder
import coil.decode.ImageDecoderDecoder
import coil.request.ImageRequest
import coil.size.Size

/**
 * La source d'un sticker image ou GIF/APNG : un chargeur Coil qui sait animer, et un budget de pixels borné
 * (un GIF décodé image par image coûte `côté² × 4` octets par image).
 */
public object StickerImageSource {

    public const val MAX_DECODE_SIDE: Int = 540

    /** Le côté décodé : celui qui est peint, plafonné pour borner la mémoire d'une animation. */
    public fun decodeSide(renderedSidePx: Int): Int = renderedSidePx.coerceIn(1, MAX_DECODE_SIDE)

    @Volatile
    private var loader: ImageLoader? = null

    public fun loader(context: Context): ImageLoader = loader ?: synchronized(this) {
        loader ?: ImageLoader.Builder(context.applicationContext)
            .components {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) add(ImageDecoderDecoder.Factory()) else add(GifDecoder.Factory())
            }
            .build()
            .also { loader = it }
    }

    public fun request(context: Context, url: String, renderedSidePx: Int): ImageRequest {
        val side = decodeSide(renderedSidePx)
        return ImageRequest.Builder(context).data(url).size(Size(side, side)).build()
    }
}
