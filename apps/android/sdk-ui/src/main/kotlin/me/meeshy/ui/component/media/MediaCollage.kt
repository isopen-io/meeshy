package me.meeshy.ui.component.media

/**
 * One media tile in a collage. [index] points into the media list; [widthWeight] is the
 * tile's share of its row's width; [overflowCount] > 0 marks the last visible tile with a
 * `+N` overlay hiding the remaining media (only ever set on the final cell past the cap).
 */
public data class CollageCell(
    val index: Int,
    val widthWeight: Float,
    val overflowCount: Int = 0,
)

/**
 * A horizontal band of the collage. [cells] are laid left-to-right sharing the row width by
 * their [CollageCell.widthWeight]; [heightWeight] is the row's share of the collage height.
 */
public data class CollageRow(
    val cells: List<CollageCell>,
    val heightWeight: Float,
)

/**
 * The resolved collage as a vertical stack of [rows]. [isSingle] flags the lone-image case so
 * the renderer can use the image's real aspect ratio instead of a fixed grid height. An empty
 * layout ([isEmpty]) has no media to show.
 */
public data class CollageLayout(
    val rows: List<CollageRow>,
    val isSingle: Boolean,
) {
    public val isEmpty: Boolean get() = rows.isEmpty()
}

/**
 * Pure adaptive collage solver — the Android take on iOS `FeedPostCard+Media.mediaPreview`
 * (and the message-bubble `visualMediaGrid`). Maps a media [count] to a deterministic
 * row/cell layout, so every layout decision is testable and the Compose renderer stays a thin
 * reader of the result. Stateless and content-agnostic (it knows only the count), so it lives
 * in `:sdk-ui` as one collage rule shared by every media surface.
 *
 * Shapes (a coherent, uniform column-of-rows model):
 * - `1` → a single full-bleed tile (real aspect ratio).
 * - `2` → two equal tiles side by side.
 * - `3` → one large tile over a two-up row.
 * - `4` → a row-major 2×2 grid.
 * - `5` → a two-up row over a three-up row.
 * - `5+` → the same five tiles, the last carrying a `+N` overflow for the hidden remainder.
 */
public object MediaCollage {

    /** The most media tiles a collage ever renders; the rest collapse into the `+N` overflow. */
    public const val MAX_VISIBLE: Int = 5

    public fun solve(count: Int): CollageLayout {
        if (count <= 0) return CollageLayout(rows = emptyList(), isSingle = false)
        val visible = minOf(count, MAX_VISIBLE)
        val overflow = (count - MAX_VISIBLE).coerceAtLeast(0)
        return when (visible) {
            1 -> CollageLayout(rows = listOf(row(1f, cell(0, 1f))), isSingle = true)
            2 -> grid(rowsOfIndices = listOf(listOf(0, 1)), overflow = overflow)
            3 -> CollageLayout(
                rows = listOf(
                    row(LARGE_ROW_HEIGHT, cell(0, 1f)),
                    row(1f - LARGE_ROW_HEIGHT, cell(1, 0.5f), cell(2, 0.5f)),
                ),
                isSingle = false,
            )
            4 -> grid(rowsOfIndices = listOf(listOf(0, 1), listOf(2, 3)), overflow = overflow)
            else -> grid(rowsOfIndices = listOf(listOf(0, 1), listOf(2, 3, 4)), overflow = overflow)
        }
    }

    private fun grid(rowsOfIndices: List<List<Int>>, overflow: Int): CollageLayout {
        val lastIndex = rowsOfIndices.flatten().last()
        val heightWeight = 1f / rowsOfIndices.size
        val rows = rowsOfIndices.map { indices ->
            val widthWeight = 1f / indices.size
            row(
                heightWeight,
                *indices.map { index ->
                    cell(index, widthWeight, if (index == lastIndex) overflow else 0)
                }.toTypedArray(),
            )
        }
        return CollageLayout(rows = rows, isSingle = false)
    }

    private fun row(heightWeight: Float, vararg cells: CollageCell): CollageRow =
        CollageRow(cells = cells.toList(), heightWeight = heightWeight)

    private fun cell(index: Int, widthWeight: Float, overflowCount: Int = 0): CollageCell =
        CollageCell(index = index, widthWeight = widthWeight, overflowCount = overflowCount)

    private const val LARGE_ROW_HEIGHT = 0.6f
}
