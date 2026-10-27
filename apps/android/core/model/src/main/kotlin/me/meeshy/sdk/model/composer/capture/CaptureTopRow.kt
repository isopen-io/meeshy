package me.meeshy.sdk.model.composer.capture

/** La rangée haute du viseur : sa disposition est décidée ici et nulle part ailleurs (miroir de `ComposerCaptureTopRow`). */
object CaptureTopRow {
    enum class Item { CLOSE, CHRONO, SIZE, DROP_SEGMENT, VALIDATE, FLASH, FLIP, SAVE, DONE }

    const val SPACING_DP: Float = 4f

    data class Input(
        val stage: CaptureStage,
        val editing: Boolean = false,
        val pendingSegments: Int = 0,
        val offersSizeToggle: Boolean = true,
        val offersSave: Boolean = false,
    )

    fun leading(input: Input): List<Item> =
        if (input.editing || !showsChrono(input)) listOf(Item.CLOSE) else listOf(Item.CLOSE, Item.CHRONO)

    /** De l'intérieur vers le bord : le dernier touche le bord. */
    fun trailing(input: Input): List<Item> {
        if (input.editing) {
            return listOfNotNull(Item.SIZE.takeIf { input.offersSizeToggle }, Item.SAVE.takeIf { input.offersSave }, Item.DONE)
        }
        if (input.stage == CaptureStage.RECORDING) return emptyList()
        val segments = input.pendingSegments > 0
        val size = if (input.offersSizeToggle && !segments) listOf(Item.SIZE) else emptyList()
        val controls = if (segments) listOf(Item.DROP_SEGMENT, Item.VALIDATE) else emptyList()
        return size + controls + listOf(Item.FLASH, Item.FLIP)
    }

    fun showsChrono(input: Input): Boolean = input.stage == CaptureStage.RECORDING || input.pendingSegments > 0

    /** Le premier enregistrement est le segment 1, pas le segment 0. */
    fun segmentCount(pending: Int, recording: Boolean): Int = maxOf(0, pending) + if (recording) 1 else 0

    /** « 3 – » : le chiffre et un trait, le mot restant au lecteur d'écran. */
    fun segmentBadge(count: Int, format: (Int) -> String = Int::toString): String = "${format(maxOf(0, count))} –"

    /** Le curseur d'intensité se pose SOUS le flash : retrait depuis le bord droit. */
    fun flashSliderTrailingInsetDp(trailing: List<Item>, tapTargetDp: Float): Float {
        val rank = trailing.indexOf(Item.FLASH)
        if (rank < 0) return 0f
        return (trailing.size - 1 - rank) * (tapTargetDp + SPACING_DP)
    }
}
