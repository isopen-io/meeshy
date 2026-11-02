package me.meeshy.sdk.model.call.montage

import kotlin.math.PI
import kotlin.math.max
import kotlin.math.sin
import me.meeshy.sdk.model.call.frames.CallFrameRect

/** Une braise, un éclat ou une étincelle du décor : son centre, son rayon, son opacité (0…1). */
public data class CallMontageEmber(val center: CallMontagePoint, val radius: Double, val opacity: Double)

/**
 * **LES DÉCORS DÉTERMINISTES DES CLASSIQUES** — ce que `CallMontageRenderer` (iOS) tire au hasard, mais
 * à graine fixe : braises de l'Or, éclats du Tapis rouge, cœurs du Cœur (`CallFaceEffectGeometry.embers`),
 * grain du Noir (`grainUnit`), code-barres de la Couverture, perforations de la Pellicule, trame de la BD.
 * Le même montage à chaque rendu, sur les deux plateformes.
 */
public object CallMontageDecor {
    public const val GOLD_SEED: Long = 0x47_4F_4C_44
    public const val FLASH_SEED: Long = 0x46_4C_41_53_48
    public const val HEART_SEED: Long = 0x48_45_41_52_54
    public const val GRAIN_SPECKS: Int = 1400

    private val GOLDEN: Long = 0x9E37_79B9_7F4A_7C15uL.toLong()
    private val SALT_MIX: Long = 0xD1B5_4A32_D192_ED03uL.toLong()
    private val MIX_1: Long = 0xBF58_476D_1CE4_E5B9uL.toLong()
    private val MIX_2: Long = 0x94D0_49BB_1331_11EBuL.toLong()
    private const val TWO_53: Double = 9007199254740992.0
    private val BARCODE = listOf(2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2)

    /** Le tirage uniforme 0…1 de `CallFaceEffectGeometry.unit` (splitmix64). */
    public fun unit(seed: Long, index: Int, salt: Long): Double {
        var z = seed + index.toLong() * GOLDEN + salt * SALT_MIX
        z = (z xor (z ushr 30)) * MIX_1
        z = (z xor (z ushr 27)) * MIX_2
        z = z xor (z ushr 31)
        return (z ushr 11).toDouble() / TWO_53
    }

    /** Les braises à l'instant [time] (0 pour une image fixe), dans [canvas]. */
    public fun embers(count: Int, time: Double, canvas: CallFrameRect, seed: Long): List<CallMontageEmber> {
        val clock = max(0.0, time)
        return (0 until max(0, count)).map { index ->
            val speed = 0.12 + 0.18 * unit(seed, index, 3)
            val progress = (clock * speed + unit(seed, index, 4)) % 1.0
            val drift = sin(clock * 1.7 + unit(seed, index, 5) * 2 * PI) * canvas.width * 0.02
            val baseX = canvas.minX + canvas.width * (0.04 + 0.92 * unit(seed, index, 6))
            CallMontageEmber(
                center = CallMontagePoint(baseX + drift, canvas.minY + progress * canvas.height * 0.85),
                radius = canvas.width * (0.004 + 0.008 * unit(seed, index, 7)),
                opacity = (1 - progress) * (0.6 + 0.4 * unit(seed, index, 8)),
            )
        }
    }

    /** Le tirage 0…1 du grain du Noir (`grainUnit`), au dix-millième. */
    public fun grainUnit(index: Int, salt: Long): Double {
        var value = index.toLong() * GOLDEN + salt
        value = value xor (value ushr 31)
        value *= MIX_1
        value = value xor (value ushr 29)
        return java.lang.Long.remainderUnsigned(value, 10_000).toDouble() / 10_000
    }

    /** Les barres noires du code-barres de la Couverture, dans [rect] (sur un fond blanc). */
    public fun barcodeBars(rect: CallFrameRect): List<CallFrameRect> {
        val bars = rect.insetBy(rect.width * 0.08, rect.height * 0.12)
        val step = bars.width / BARCODE.sumOf { it + 1 }
        val starts = BARCODE.runningFold(bars.minX) { x, width -> x + (width + 1) * step }
        return BARCODE.mapIndexed { index, width -> CallFrameRect(starts[index], bars.minY, width * step, bars.height) }
    }

    /** Les perforations d'une bande de pellicule : deux colonnes, du haut au bas de la bande. */
    public fun filmHoles(strip: CallFrameRect): List<CallFrameRect> {
        val holeWidth = strip.width * 0.055
        val holeHeight = strip.width * 0.038
        if (holeHeight <= 0) return emptyList()
        val pitch = holeHeight * 2.1
        val rows = generateSequence(pitch / 2) { it + pitch }.takeWhile { it < strip.maxY }.toList()
        val columns = listOf(strip.minX + strip.width * 0.05, strip.maxX - strip.width * 0.05 - holeWidth)
        return rows.flatMap { y -> columns.map { x -> CallFrameRect(x, y, holeWidth, holeHeight) } }
    }

    /** Les centres de la trame de points de la BD : une rangée sur deux décalée d'un demi-pas. */
    public fun comicDots(bounds: CallFrameRect): List<CallMontagePoint> {
        val spacing = bounds.width / 26
        if (spacing <= 0) return emptyList()
        val rows = generateSequence(spacing / 2) { it + spacing }.takeWhile { it < bounds.height }.toList()
        return rows.flatMapIndexed { row, y ->
            generateSequence(if (row % 2 == 0) spacing / 2 else spacing) { it + spacing }
                .takeWhile { it < bounds.width }
                .map { x -> CallMontagePoint(x, y) }
                .toList()
        }
    }

    /** La teinte (0…1) du dégradé d'une case sans image, tirée de l'identifiant de la personne. */
    public fun placeholderHue(id: String): Double {
        val hash = id.codePoints().toArray().fold(0) { acc, scalar -> (acc * 31 + scalar) and 0xFFFF }
        return (hash % 360) / 360.0
    }
}
