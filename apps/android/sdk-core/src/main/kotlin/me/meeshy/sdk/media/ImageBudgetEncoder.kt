package me.meeshy.sdk.media

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import java.io.ByteArrayOutputStream
import me.meeshy.sdk.model.media.ImageByteBudget
import me.meeshy.sdk.model.media.ImageByteBudgetLadder
import me.meeshy.sdk.model.media.ImageCompressionPlanner

/**
 * La boucle de compression d'une photo d'entité sur un Bitmap DÉJÀ orienté : plafond de dimension du contexte du
 * budget, puis [ImageByteBudgetLadder] (huit passes au plus), arrêt à la première passe sous le budget, dernière
 * passe rendue sinon. Annulable entre deux passes par [checkActive] (lève la CancellationException). À appeler depuis un dispatcher de calcul (jamais le fil principal).
 */
public object ImageBudgetEncoder {

    public fun encode(bitmap: Bitmap, budget: ImageByteBudget, checkActive: () -> Unit = {}): ByteArray {
        val flat = flattenAlpha(bitmap)
        try {
            val base = ImageCompressionPlanner.plan(budget.context, flat.width, flat.height, ImageByteBudgetLadder.START_QUALITY)
            var last = ByteArray(0)
            for (step in ImageByteBudgetLadder.steps) {
                checkActive()
                val width = ImageByteBudgetLadder.scaled(base.targetWidthPx, step.dimensionFactor)
                val height = ImageByteBudgetLadder.scaled(base.targetHeightPx, step.dimensionFactor)
                last = jpeg(flat, width, height, step.quality)
                if (budget.admits(last.size.toLong())) break
            }
            return last
        } finally {
            if (flat !== bitmap) flat.recycle()
        }
    }

    private fun jpeg(source: Bitmap, width: Int, height: Int, quality: Int): ByteArray {
        val scaled = if (source.width == width && source.height == height) source else Bitmap.createScaledBitmap(source, width, height, true)
        return try {
            ByteArrayOutputStream().also { scaled.compress(Bitmap.CompressFormat.JPEG, quality, it) }.toByteArray()
        } finally {
            if (scaled !== source) scaled.recycle()
        }
    }

    private fun flattenAlpha(bitmap: Bitmap): Bitmap {
        if (!bitmap.hasAlpha()) return bitmap
        val flat = Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.ARGB_8888)
        Canvas(flat).apply {
            drawColor(Color.WHITE)
            drawBitmap(bitmap, 0f, 0f, null)
        }
        return flat
    }
}
