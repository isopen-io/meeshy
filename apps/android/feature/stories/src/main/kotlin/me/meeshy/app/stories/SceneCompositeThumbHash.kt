package me.meeshy.app.stories

import android.graphics.Bitmap
import java.nio.ByteBuffer
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.ThumbHashPreparation
import me.meeshy.sdk.model.media.ThumbHash
import me.meeshy.sdk.net.api.CreateStoryRequest

/**
 * The ThumbHash (about 28 bytes) of a slide's composite, for the draft and the publication (iOS `StorySlideRenderer`
 * composite hash). Computed on [dispatcher], never on the main thread; any failure is `null` — a missing placeholder never
 * blocks a save or a publish.
 */
internal object SceneCompositeThumbHash {

    suspend fun of(composite: Bitmap, dispatcher: CoroutineDispatcher = Dispatchers.Default): String? = withContext(dispatcher) {
        try {
            encode(composite)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }
    }

    internal fun encode(composite: Bitmap): String? {
        if (composite.width <= 0 || composite.height <= 0) return null
        val plan = ThumbHash.sourcePlan(composite.width, composite.height)
        val small = if (plan.downscaled) Bitmap.createScaledBitmap(composite, plan.width, plan.height, true) else composite
        return try {
            val pixels = IntArray(small.width * small.height)
            small.getPixels(pixels, 0, small.width, 0, 0, small.width, small.height)
            val rgba = ByteBuffer.allocate(pixels.size * 4)
            pixels.forEach { argb ->
                rgba.put((argb shr 16).toByte()).put((argb shr 8).toByte()).put(argb.toByte()).put((argb ushr 24).toByte())
            }
            ThumbHashPreparation.encodeBase64(small.width, small.height, rgba.array())
        } finally {
            if (small !== composite) small.recycle()
        }
    }

    /** The request with [hash] on its scene, unless the author's scene already carries one; no scene or no hash leaves it as is. */
    fun attach(request: CreateStoryRequest, hash: String?): CreateStoryRequest {
        val effects = request.storyEffects ?: return request
        if (hash.isNullOrBlank() || !effects.thumbHash.isNullOrBlank()) return request
        return request.copy(storyEffects = effects.copy(thumbHash = hash))
    }
}
