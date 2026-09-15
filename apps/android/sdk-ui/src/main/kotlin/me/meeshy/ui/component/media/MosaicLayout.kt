package me.meeshy.ui.component.media

import me.meeshy.sdk.model.MosaicLayoutMode

public data class MosaicTile(
    val index: Int,
    val x: Float,
    val y: Float,
    val width: Float,
    val height: Float,
    val overflow: Int = 0,
)

public sealed interface MosaicArrangement {
    public data object Empty : MosaicArrangement
    public data object Single : MosaicArrangement
    public data class Paged(val pageCount: Int) : MosaicArrangement
    public data class Tiled(
        val mode: MosaicLayoutMode,
        val tiles: List<MosaicTile>,
        val aspectRatio: Float,
    ) : MosaicArrangement {
        val span: Float get() = 0f
    }
}

public object MosaicLayout {
    public fun arrange(count: Int, mode: MosaicLayoutMode): MosaicArrangement = MosaicArrangement.Empty

    public fun tileCarriesCaption(mode: MosaicLayoutMode, index: Int, count: Int): Boolean = false

    public fun captionWordLimit(mode: MosaicLayoutMode, count: Int, tileWidth: Float): Int = 0

    public fun truncateWords(text: String, limit: Int): String = ""
}
