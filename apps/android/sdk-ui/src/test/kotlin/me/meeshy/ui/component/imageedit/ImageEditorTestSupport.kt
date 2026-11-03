package me.meeshy.ui.component.imageedit

import android.graphics.Bitmap
import me.meeshy.sdk.model.imageedit.AdjustmentKind
import me.meeshy.sdk.model.imageedit.ImageEditState
import me.meeshy.sdk.model.imageedit.ImageEditorMode
import me.meeshy.sdk.model.imageedit.ImageEffect
import me.meeshy.sdk.model.imageedit.ImageFilter

internal class FakeImageEditorRenderer : ImageEditorRenderer {
    val renders = mutableListOf<Pair<Bitmap, ImageEditState>>()
    val geometries = mutableListOf<Boolean>()
    var thumbnailCalls = 0

    override fun render(source: Bitmap, state: ImageEditState, instanceId: String?, referenceLongSide: Int): Bitmap {
        renders += source to state
        return Bitmap.createBitmap(4, 4, Bitmap.Config.ARGB_8888)
    }

    override fun geometry(source: Bitmap, state: ImageEditState, applyCrop: Boolean): Bitmap {
        geometries += applyCrop
        return Bitmap.createBitmap(4, 4, Bitmap.Config.ARGB_8888)
    }

    override fun thumbnails(source: Bitmap): Map<ImageFilter, Bitmap> {
        thumbnailCalls++
        return ImageFilter.entries.associateWith { Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888) }
    }

    override fun downscaled(source: Bitmap, maxPixel: Int): Bitmap = source
}

internal object FakeImageEditorLabels : ImageEditorLabels {
    override val reset = "Réinitialisation"
    override val resetAdjust = "Ajustements réinitialisés"
    override val rotation = "Rotation"
    override val flip = "Miroir"
    override val cropApplied = "Recadrage"
    override fun filter(filter: ImageFilter) = filter.name
    override fun effect(effect: ImageEffect) = effect.name
    override fun adjustment(kind: AdjustmentKind) = kind.name
}

internal class FakeImageEditorModeStore(var mode: ImageEditorMode = ImageEditorMode.SIMPLE) : ImageEditorModeStore {
    var saves = 0
    override fun load(): ImageEditorMode = mode
    override fun save(mode: ImageEditorMode) {
        this.mode = mode
        saves++
    }
}
