package me.meeshy.ui.story.canvas

import android.content.ComponentCallbacks2
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.util.LruCache
import me.meeshy.sdk.model.scene.SceneStickerFrame

/**
 * Rasterise un emoji UNE fois par (emoji, côté entier) : le sticker est peint en bitmap net à la taille rendue,
 * pas en texte redimensionné (miroir de `StoryStickerRasterizer`, iOS). Le cache est borné en nombre ET en octets ;
 * il est vidé quand le système demande de la mémoire ([onTrimMemory]).
 */
public class StickerEmojiRasterizer(countLimit: Int = DEFAULT_COUNT_LIMIT, byteLimit: Int = DEFAULT_BYTE_LIMIT) {

    private val countCap = countLimit
    private val cache = object : LruCache<String, Bitmap>(byteLimit) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }
    private val keys = LinkedHashSet<String>()

    /** Le bitmap de [emoji] à [side] pixels (carré), ou `null` s'il n'y a rien à peindre. */
    @Synchronized
    public fun bitmap(emoji: String, side: Int): Bitmap? {
        if (emoji.isBlank() || side <= 0) return null
        val size = side.coerceAtMost(MAX_SIDE)
        val key = cacheKey(emoji, size)
        cache.get(key)?.let { return it }
        val drawn = draw(emoji, size)
        cache.put(key, drawn)
        keys.add(key)
        while (keys.size > countCap) {
            val oldest = keys.first()
            keys.remove(oldest)
            cache.remove(oldest)
        }
        return drawn
    }

    @Synchronized
    public fun cached(emoji: String, side: Int): Bitmap? = cache.get(cacheKey(emoji, side.coerceAtMost(MAX_SIDE)))

    @Synchronized
    public fun clear() {
        cache.evictAll()
        keys.clear()
    }

    /**
     * Vide le cache quand la mémoire manque vraiment : appli en cours à court critique, ou processus relégué à l'arrière-plan.
     * `TRIM_MEMORY_UI_HIDDEN` (20) et les paliers « running » légers ne vident rien : l'écran revient dans l'instant.
     */
    public fun onTrimMemory(level: Int) {
        if (level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL || level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND) clear()
    }

    private fun draw(emoji: String, side: Int): Bitmap {
        val bitmap = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = side * GLYPH_FRACTION }
        val width = paint.measureText(emoji)
        val metrics = paint.fontMetrics
        Canvas(bitmap).drawText(emoji, (side - width) / 2f, side / 2f - (metrics.ascent + metrics.descent) / 2f, paint)
        return bitmap
    }

    public companion object {
        public const val DEFAULT_COUNT_LIMIT: Int = 100
        public const val DEFAULT_BYTE_LIMIT: Int = 10 * 1024 * 1024
        private const val MAX_SIDE = 1024
        private const val GLYPH_FRACTION = 0.8f

        /** La clé de cache : `emoji|côté entier`. */
        public fun cacheKey(emoji: String, side: Int): String = "$emoji|$side"

        /** Le cache de l'application, partagé par toutes les scènes. */
        public val shared: StickerEmojiRasterizer = StickerEmojiRasterizer()

        public fun sideOf(renderedSide: Double): Int = SceneStickerFrame.rasterSide(renderedSide)
    }
}
