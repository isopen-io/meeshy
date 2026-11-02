package me.meeshy.sdk.model.call.frames

import kotlin.math.max
import kotlin.math.min

/** Un des neuf morceaux d'une moulure : la part de l'image source et la part de la toile où elle se pose. */
public data class CallFrameSlicePiece(val source: CallFrameRect, val target: CallFrameRect)

/**
 * **LA SCÈNE D'UNE DÉCLINAISON « RELIEF »** (#13695, miroir de iOS `CallFrameSceneImagePainter` et
 * `CallFrameMotionPlan.ambientLayers`) : ses illustrations `image` — la MATIÈRE du fond (`back`, sous les
 * visages) et la MOULURE de bordure (`front`, sur les traits des cases, sous les ornements et les textes) —,
 * ses lumières qui respirent et ses boucles vidéo. Les mêmes fichiers que iOS et le web
 * (`packages/shared/design/call-capture-frames/assets/call-frames/`).
 */
public object CallFrameSceneArt {
    /** La respiration d'une lumière de scène, en secondes (iOS `.breathe(period: 5)`). */
    public const val LIGHT_PERIOD: Double = 5.0

    /** L'intensité d'une lumière qui n'en déclare pas. */
    public const val LIGHT_DEFAULT_AMOUNT: Double = 0.6

    /** Les illustrations de [depth], dans l'ordre de la scène ; une couche sans fichier n'en est pas une. */
    public fun images(look: CallFrameLook, depth: CallFrameSceneDepth): List<CallFrameSceneLayer> =
        look.scene.filter { it.kind == CallFrameSceneLayerKind.IMAGE && it.depth == depth && !it.src.isNullOrBlank() }

    public fun lights(look: CallFrameLook): List<CallFrameSceneLayer> =
        CallFrameMotionPlan.ambientLayers(look).filter { it.kind == CallFrameSceneLayerKind.LIGHT }

    public fun videoLoops(look: CallFrameLook): List<CallFrameSceneLayer> =
        CallFrameMotionPlan.ambientLayers(look).filter { it.kind == CallFrameSceneLayerKind.VIDEO_LOOP && !it.src.isNullOrBlank() }

    /** Une lumière `effects` passe sur les visages ; `back` et `front` restent hors des cases et des textes. */
    public fun isMasked(layer: CallFrameSceneLayer): Boolean = layer.depth != CallFrameSceneDepth.EFFECTS

    /** L'opacité d'une couche (`amount`), bornée à 0…1 ; une illustration sans `amount` est entière. */
    public fun opacity(layer: CallFrameSceneLayer, fallback: Double = 1.0): Double =
        (layer.amount ?: fallback).coerceIn(0.0, 1.0)

    /** Le chemin d'un fichier de scène parmi les actifs de l'app : `assets/call-frames/x.webp` ⇒ `call-frames/x.webp`. */
    public fun assetPath(src: String): String = src.trim().removePrefix("/").removePrefix("assets/")

    /**
     * Les neuf morceaux : coins intacts ([slice] du plus petit côté, à la source comme à la destination), bords
     * étirés dans leur longueur, centre étiré. Un morceau vide (source ou cible nulle) est écarté.
     */
    public fun nineSlicePieces(sourceWidth: Double, sourceHeight: Double, target: CallFrameRect, slice: Double): List<CallFrameSlicePiece> {
        val share = slice.coerceIn(0.0, 0.5)
        val from = min(sourceWidth, sourceHeight) * share
        val to = min(target.width, target.height) * share
        val sourceColumns = doubleArrayOf(0.0, from, sourceWidth - from, sourceWidth)
        val sourceRows = doubleArrayOf(0.0, from, sourceHeight - from, sourceHeight)
        val targetColumns = doubleArrayOf(target.minX, target.minX + to, target.maxX - to, target.maxX)
        val targetRows = doubleArrayOf(target.minY, target.minY + to, target.maxY - to, target.maxY)
        fun cell(columns: DoubleArray, rows: DoubleArray, column: Int, row: Int) =
            CallFrameRect(columns[column], rows[row], max(0.0, columns[column + 1] - columns[column]), max(0.0, rows[row + 1] - rows[row]))
        return (0 until 3).flatMap { row ->
            (0 until 3).map { column ->
                CallFrameSlicePiece(cell(sourceColumns, sourceRows, column, row), cell(targetColumns, targetRows, column, row))
            }
        }.filter { it.source.width > 0 && it.source.height > 0 && it.target.width > 0 && it.target.height > 0 }
    }

    /** L'opacité d'une lumière à l'instant [t] : son intensité, qui respire. */
    public fun lightAlpha(layer: CallFrameSceneLayer, t: Double): Double =
        opacity(layer, LIGHT_DEFAULT_AMOUNT) * CallFrameMotionCurve.breathe(t, LIGHT_PERIOD)
}
