package me.meeshy.sdk.model.call.montage

import kotlin.math.min
import me.meeshy.sdk.model.call.frames.CallFrameRect

/** Les cinq teintes de carreau de la Mosaïque seule : quatre couleurs de la marque et « aucune », translucides. */
public enum class CallMontageTint(public val alpha: Double, public val red: Double, public val green: Double, public val blue: Double) {
    INDIGO(0.07, 0.388, 0.400, 0.945),
    ROSE(0.07, 0.925, 0.282, 0.600),
    AMBER(0.08, 0.961, 0.620, 0.043),
    TEAL(0.06, 0.078, 0.722, 0.651),
    PLAIN(0.0, 1.0, 1.0, 1.0),
}

/** L'écran d'un appareil : bord de 3 % de la largeur, coin concentrique au boîtier, barre d'état, reflet diagonal. */
public data class CallMontageSoloScreen(
    val screen: CallFrameRect,
    val cornerRadius: Double,
    val statusBand: CallFrameRect,
    val reflection: List<CallMontagePoint>,
)

/** La case de la photo, découpée en carreaux séparés de joints, et la bande basse qui signe. */
public data class CallMontageSoloMosaic(
    val slot: CallFrameRect,
    val columns: Int,
    val rows: Int,
    val joint: Double,
    val tiles: List<CallFrameRect>,
    val band: CallFrameRect,
)

/**
 * **ÉCRAN ET MOSAÏQUE POUR UNE PERSONNE** (#12589) — portage LITTÉRAL de `CallMontageSoloLayout.swift` :
 * la photo seule n'est plus la toile entière ni un simple filet, mais un écran d'appareil et une vraie
 * mosaïque. Tout est en proportion de la toile, donc identique en 9:16, 4:5, 1:1 et 16:9.
 */
public object CallMontageSoloLayout {
    public const val BEZEL: Double = 0.03
    public const val BODY_RADIUS: Double = 0.115
    public const val JOINT_WIDTH: Double = 0.006
    public const val MOSAIC_MARGIN: Double = 0.02
    public const val MOSAIC_BAND: Double = 0.09
    public const val STATUS_SHARE: Double = 0.05
    private const val ELONGATED = 1.2

    public fun screen(bounds: CallFrameRect): CallMontageSoloScreen {
        val width = bounds.width
        val edge = width * BEZEL
        val screen = bounds.insetBy(edge, edge)
        val reach = min(screen.width, screen.height)
        val band = CallFrameRect(screen.minX, screen.minY, screen.width, min(width, bounds.height) * STATUS_SHARE)
        val reflection = listOf(
            CallMontagePoint(screen.minX + reach * 0.18, screen.minY),
            CallMontagePoint(screen.minX + reach * 0.52, screen.minY),
            CallMontagePoint(screen.minX, screen.minY + reach * 0.52),
            CallMontagePoint(screen.minX, screen.minY + reach * 0.18),
        )
        return CallMontageSoloScreen(screen, width * BODY_RADIUS - edge, band, reflection)
    }

    public fun mosaic(bounds: CallFrameRect): CallMontageSoloMosaic {
        val width = bounds.width
        val margin = width * MOSAIC_MARGIN
        val bandHeight = min(width, bounds.height) * MOSAIC_BAND
        val slot = CallFrameRect(bounds.minX + margin, bounds.minY + margin, width - margin * 2, bounds.height - margin - bandHeight)
        val (columns, rows) = tiling(slot)
        val joint = width * JOINT_WIDTH
        val tileWidth = (slot.width - joint * (columns - 1)) / columns
        val tileHeight = (slot.height - joint * (rows - 1)) / rows
        val tiles = (0 until rows).flatMap { row ->
            (0 until columns).map { column ->
                CallFrameRect(slot.minX + column * (tileWidth + joint), slot.minY + row * (tileHeight + joint), tileWidth, tileHeight)
            }
        }
        val band = CallFrameRect(bounds.minX, slot.maxY, width, bounds.maxY - slot.maxY)
        return CallMontageSoloMosaic(slot, columns, rows, joint, tiles, band)
    }

    /** (colonnes, rangées) : 3 × 5 en portrait, 5 × 3 en paysage, 4 × 4 près du carré. */
    public fun tiling(slot: CallFrameRect): Pair<Int, Int> {
        if (slot.width <= 0 || slot.height <= 0) return 4 to 4
        val ratio = slot.height / slot.width
        return when {
            ratio >= ELONGATED -> 3 to 5
            ratio <= 1 / ELONGATED -> 5 to 3
            else -> 4 to 4
        }
    }

    /** Deux voisins, en rangée comme en colonne, ne portent jamais la même teinte. */
    public fun tint(row: Int, column: Int): CallMontageTint {
        val palette = CallMontageTint.entries
        val index = (column + 2 * row) % palette.size
        return palette[(index + palette.size) % palette.size]
    }
}
