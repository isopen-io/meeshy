package me.meeshy.app.stories

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.Constraints
import me.meeshy.sdk.model.StoryMediaCrop
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Peint la source ENTIÈRE derrière le cadre qui n'en montre que [crop] (#13849, iOS `StoryMediaObject.crop`) : la source est
 * mesurée plus grande que le cadre et décalée, le cadre la coupe. Aucune image n'est réécrite — le même fichier sert
 * l'original et chaque recadrage. `null` ou la source entière : la source remplit le cadre.
 */
internal fun Modifier.croppedSource(crop: StoryMediaCrop?): Modifier {
    if (crop == null || crop.isFull) return fillMaxSize()
    return layout { measurable, constraints ->
        val width = constraints.maxWidth
        val height = constraints.maxHeight
        if (width == Constraints.Infinity || height == Constraints.Infinity) {
            val placeable = measurable.measure(constraints)
            return@layout layout(placeable.width, placeable.height) { placeable.place(0, 0) }
        }
        val source = crop.layoutIn(width.toDouble(), height.toDouble())
        val placeable = measurable.measure(
            Constraints.fixed(max(1, source.sourceWidth.roundToInt()), max(1, source.sourceHeight.roundToInt())),
        )
        layout(width, height) { placeable.place(source.offsetX.roundToInt(), source.offsetY.roundToInt()) }
    }
}

/** La taille à laquelle décoder la source d'un cadre de [frameWidth] × [frameHeight] recadré à [crop]. */
internal fun croppedDecodeSize(frameWidth: Float, frameHeight: Float, crop: StoryMediaCrop?): Pair<Int, Int> {
    if (crop == null || crop.isFull) return max(1, frameWidth.roundToInt()) to max(1, frameHeight.roundToInt())
    val source = crop.layoutIn(frameWidth.toDouble(), frameHeight.toDouble())
    return max(1, source.sourceWidth.roundToInt()) to max(1, source.sourceHeight.roundToInt())
}
