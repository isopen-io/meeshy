package me.meeshy.sdk.model.game

/*
 * L'encodeur QR du lien de parrainage (#9554). MIROIR de `apps/web/src/lib/qr.ts` et de `GameQRCode.swift`
 * (iOS) : ISO/IEC 18004, écrit à la main plutôt que confié à une bibliothèque, car la carte du jeu doit
 * montrer le MÊME carré sur le web, sur iOS et sur Android, module pour module, et une bibliothèque peut
 * élire un autre masque. UN cas : un lien, en mode octet (UTF-8), correction M.
 *
 * PUR : un texte entre, une matrice sort — `modules[y][x]`, `true` = sombre, SANS marge de silence (elle
 * appartient à celui qui peint). La version est la plus petite qui porte le texte ; le masque est celui que
 * la norme élit, le moins pénalisé des huit.
 */

/** La matrice d'un QR code, sans marge de silence. */
public data class GameQrMatrix(
    /** 1 à 40. */
    val version: Int,
    /** Le côté, en modules : `17 + 4 × version`. */
    val size: Int,
    /** Le masque retenu, 0 à 7. */
    val mask: Int,
    /** `modules[y][x]`, `true` = sombre. */
    val modules: List<List<Boolean>>,
)

public object GameQrCode {

    public const val MAX_VERSION: Int = 40

    private val eccPerBlockTable = intArrayOf(
        10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
        26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
    )
    private val blockCountTable = intArrayOf(
        1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
        17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
    )
    private const val FORMAT_LEVEL_M = 0
    private const val RUN_PENALTY = 3
    private const val BLOCK_PENALTY = 3
    private const val FINDER_PENALTY = 40
    private const val BALANCE_PENALTY = 10

    private class Grid(val side: Int) {
        val dark = IntArray(side * side)
        val reserved = IntArray(side * side)
    }

    private class Block(val data: IntArray, val ecc: IntArray)

    private class Candidate(val mask: Int, val cells: IntArray, val penalty: Int)

    private fun sideLength(version: Int) = 17 + 4 * version

    private fun rawCodewords(version: Int): Int {
        val base = (16 * version + 128) * version + 64
        if (version < 2) return base shr 3
        val align = version / 7 + 2
        val modules = base - ((25 * align - 10) * align - 55) - (if (version >= 7) 36 else 0)
        return modules shr 3
    }

    private fun eccPerBlock(version: Int) = eccPerBlockTable[version - 1]
    private fun blockCount(version: Int) = blockCountTable[version - 1]
    private fun dataCodewords(version: Int) = rawCodewords(version) - eccPerBlock(version) * blockCount(version)
    private fun countBits(version: Int) = if (version < 10) 8 else 16

    /** La capacité en octets de texte : les octets de données, moins l'en-tête (mode sur 4 bits + compteur). */
    public fun byteCapacity(version: Int): Int {
        if (version !in 1..MAX_VERSION) return 0
        return (dataCodewords(version) * 8 - 4 - countBits(version)) / 8
    }

    private fun versionFor(byteLength: Int, limit: Int): Int? {
        val last = minOf(limit, MAX_VERSION)
        if (last < 1) return null
        return (1..last).firstOrNull { byteLength <= byteCapacity(it) }
    }

    private fun dataBytes(bytes: ByteArray, version: Int): IntArray {
        val capacity = dataCodewords(version)
        val bits = ArrayList<Int>()
        fun push(value: Int, length: Int) {
            for (shift in length - 1 downTo 0) bits.add((value shr shift) and 1)
        }
        push(0b0100, 4)
        push(bytes.size, countBits(version))
        for (byte in bytes) push(byte.toInt() and 0xFF, 8)
        push(0, minOf(4, capacity * 8 - bits.size))
        push(0, (8 - bits.size % 8) % 8)
        val out = IntArray(capacity)
        bits.forEachIndexed { index, bit -> out[index shr 3] = out[index shr 3] or (bit shl (7 - (index and 7))) }
        var pad = 0xEC
        for (index in (bits.size shr 3) until capacity) {
            out[index] = pad
            pad = pad xor (0xEC xor 0x11)
        }
        return out
    }

    /** Le produit dans GF(2⁸), polynôme 0x11D. */
    private fun gfMultiply(a: Int, b: Int): Int {
        var product = 0
        for (shift in 7 downTo 0) {
            product = (product shl 1) xor ((product shr 7) * 0x11D)
            product = product xor (((b shr shift) and 1) * a)
        }
        return product
    }

    private fun rsDivisor(degree: Int): IntArray {
        val divisor = IntArray(degree)
        divisor[degree - 1] = 1
        var root = 1
        repeat(degree) {
            for (index in 0 until degree) {
                val next = if (index + 1 < degree) divisor[index + 1] else 0
                divisor[index] = gfMultiply(divisor[index], root) xor next
            }
            root = gfMultiply(root, 2)
        }
        return divisor
    }

    private fun rsRemainder(data: IntArray, divisor: IntArray): IntArray {
        val remainder = IntArray(divisor.size)
        for (byte in data) {
            val factor = byte xor remainder[0]
            System.arraycopy(remainder, 1, remainder, 0, remainder.size - 1)
            remainder[remainder.size - 1] = 0
            for (index in divisor.indices) remainder[index] = remainder[index] xor gfMultiply(divisor[index], factor)
        }
        return IntArray(remainder.size) { remainder[it] and 0xFF }
    }

    /** Les blocs de données puis leurs corrections, entrelacés octet par octet ; les blocs courts d'abord. */
    private fun interleaved(data: IntArray, version: Int): IntArray {
        val blocks = blockCount(version)
        val ecc = eccPerBlock(version)
        val raw = rawCodewords(version)
        val shortBlocks = blocks - raw % blocks
        val shortData = raw / blocks - ecc
        val divisor = rsDivisor(ecc)
        val parts = ArrayList<Block>()
        var offset = 0
        for (block in 0 until blocks) {
            val length = shortData + if (block < shortBlocks) 0 else 1
            val slice = data.copyOfRange(offset, offset + length)
            parts.add(Block(slice, rsRemainder(slice, divisor)))
            offset += length
        }
        val out = ArrayList<Int>()
        for (index in 0..shortData) for (part in parts) if (index < part.data.size) out.add(part.data[index])
        for (index in 0 until ecc) for (part in parts) out.add(part.ecc[index])
        return out.toIntArray()
    }

    private fun alignmentCenters(version: Int): List<Int> {
        if (version <= 1) return emptyList()
        val count = version / 7 + 2
        val divider = count * 2 - 2
        val step = if (version == 32) 26 else ((version * 4 + 4 + divider - 1) / divider) * 2
        val last = sideLength(version) - 7
        return listOf(6) + (0 until count - 1).map { last - (count - 2 - it) * step }
    }

    /** Tout ce qui ne porte pas de donnée : repères, synchronisation, alignement, version, place du format. */
    private fun functionPatterns(version: Int): Grid {
        val side = sideLength(version)
        val grid = Grid(side)
        fun set(x: Int, y: Int, on: Boolean) {
            if (x < 0 || y < 0 || x >= side || y >= side) return
            grid.dark[y * side + x] = if (on) 1 else 0
            grid.reserved[y * side + x] = 1
        }
        for (index in 0 until side) {
            set(6, index, index % 2 == 0)
            set(index, 6, index % 2 == 0)
        }
        for ((cx, cy) in listOf(3 to 3, side - 4 to 3, 3 to side - 4)) {
            for (dy in -4..4) for (dx in -4..4) {
                val ring = maxOf(Math.abs(dx), Math.abs(dy))
                set(cx + dx, cy + dy, ring != 2 && ring != 4)
            }
        }
        val centers = alignmentCenters(version)
        val lastIndex = centers.size - 1
        centers.forEachIndexed { row, cy ->
            centers.forEachIndexed { column, cx ->
                val onFinder = (row == 0 && column == 0) || (row == 0 && column == lastIndex) || (row == lastIndex && column == 0)
                if (onFinder) return@forEachIndexed
                for (dy in -2..2) for (dx in -2..2) set(cx + dx, cy + dy, maxOf(Math.abs(dx), Math.abs(dy)) != 1)
            }
        }
        for (index in 0 until 9) if (index != 6) {
            set(8, index, false)
            set(index, 8, false)
        }
        for (index in 0 until 8) {
            set(side - 1 - index, 8, false)
            set(8, side - 1 - index, false)
        }
        set(8, side - 8, true)
        if (version >= 7) {
            var remainder = version
            repeat(12) { remainder = (remainder shl 1) xor ((remainder shr 11) * 0x1F25) }
            val bits = (version shl 12) or remainder
            for (index in 0 until 18) {
                val on = (bits shr index) and 1 == 1
                val a = side - 11 + index % 3
                val b = index / 3
                set(a, b, on)
                set(b, a, on)
            }
        }
        return grid
    }

    /** Les octets se posent en zigzag, deux colonnes à la fois, depuis le coin bas-droit. */
    private fun placeData(grid: Grid, codewords: IntArray) {
        val side = grid.side
        val total = codewords.size * 8
        var bit = 0
        var right = side - 1
        while (right >= 1) {
            if (right == 6) right = 5
            val upward = ((right + 1) and 2) == 0
            for (step in 0 until side) {
                val y = if (upward) side - 1 - step else step
                for (column in 0 until 2) {
                    val index = y * side + right - column
                    if (grid.reserved[index] != 0) continue
                    if (bit < total) grid.dark[index] = (codewords[bit shr 3] shr (7 - (bit and 7))) and 1
                    bit += 1
                }
            }
            right -= 2
        }
    }

    private fun flips(mask: Int, x: Int, y: Int): Boolean = when (mask) {
        0 -> (x + y) % 2 == 0
        1 -> y % 2 == 0
        2 -> x % 3 == 0
        3 -> (x + y) % 3 == 0
        4 -> (x / 3 + y / 2) % 2 == 0
        5 -> (x * y) % 2 + (x * y) % 3 == 0
        6 -> ((x * y) % 2 + (x * y) % 3) % 2 == 0
        7 -> ((x + y) % 2 + (x * y) % 3) % 2 == 0
        else -> false
    }

    private fun masked(grid: Grid, mask: Int): IntArray {
        val side = grid.side
        val out = grid.dark.copyOf()
        for (y in 0 until side) for (x in 0 until side) {
            if (grid.reserved[y * side + x] == 0 && flips(mask, x, y)) out[y * side + x] = out[y * side + x] xor 1
        }
        val data = (FORMAT_LEVEL_M shl 3) or mask
        var remainder = data
        repeat(10) { remainder = (remainder shl 1) xor ((remainder shr 9) * 0x537) }
        val bits = ((data shl 10) or remainder) xor 0x5412
        fun set(x: Int, y: Int, index: Int) {
            out[y * side + x] = (bits shr index) and 1
        }
        for (index in 0..5) set(8, index, index)
        set(8, 7, 6)
        set(8, 8, 7)
        set(7, 8, 8)
        for (index in 9 until 15) set(14 - index, 8, index)
        for (index in 0 until 8) set(side - 1 - index, 8, index)
        for (index in 8 until 15) set(8, side - 15 + index, index)
        return out
    }

    /** Les suites d'au moins cinq modules d'une couleur, et les faux repères 1:1:3:1:1 bordés de quatre clairs. */
    private fun linePenalty(line: IntArray): Int {
        if (line.isEmpty()) return 0
        val runs = ArrayList<Int>()
        var penalty = 0
        var start = 0
        for (index in 1..line.size) {
            if (index < line.size && line[index] == line[start]) continue
            val length = index - start
            if (length >= 5) penalty += RUN_PENALTY + length - 5
            runs.add(length)
            start = index
        }
        val firstDark = if (line[0] == 1) 0 else 1
        var index = firstDark + 2
        while (index < runs.size - 2) {
            val unit = runs[index - 2]
            val core = runs[index] == unit * 3 && runs[index - 1] == unit && runs[index + 1] == unit && runs[index + 2] == unit
            if (core) {
                val before = if (index - 3 < 0) Int.MAX_VALUE else runs[index - 3]
                val after = if (index + 3 >= runs.size) Int.MAX_VALUE else runs[index + 3]
                if (before >= unit * 4 || after >= unit * 4) penalty += FINDER_PENALTY
            }
            index += 2
        }
        return penalty
    }

    private fun penaltyOf(cells: IntArray, side: Int): Int {
        var penalty = 0
        var darkCount = 0
        for (index in 0 until side) {
            penalty += linePenalty(cells.copyOfRange(index * side, (index + 1) * side))
            penalty += linePenalty(IntArray(side) { cells[it * side + index] })
        }
        for (y in 0 until side) for (x in 0 until side) {
            val cell = cells[y * side + x]
            darkCount += cell
            if (x >= side - 1 || y >= side - 1) continue
            if (cell == cells[y * side + x + 1] && cell == cells[(y + 1) * side + x] && cell == cells[(y + 1) * side + x + 1]) {
                penalty += BLOCK_PENALTY
            }
        }
        val total = side * side
        val imbalance = Math.abs(darkCount * 20 - total * 10)
        return penalty + ((imbalance + total - 1) / total - 1) * BALANCE_PENALTY
    }

    /**
     * Le texte (UTF-8, mode octet, correction M) → sa matrice ; `null` quand aucune version permise ne le
     * porte. [maxVersion] : la plus grande version acceptée — celui qui peint sait combien de modules il peut
     * rendre lisibles.
     */
    public fun encode(text: String, maxVersion: Int = MAX_VERSION): GameQrMatrix? {
        val bytes = text.toByteArray(Charsets.UTF_8)
        val version = versionFor(bytes.size, maxVersion) ?: return null
        val grid = functionPatterns(version)
        placeData(grid, interleaved(dataBytes(bytes, version), version))
        val side = grid.side
        val best = (0 until 8).map { mask ->
            val cells = masked(grid, mask)
            Candidate(mask, cells, penaltyOf(cells, side))
        }.minByOrNull { it.penalty } ?: return null
        return GameQrMatrix(
            version = version,
            size = side,
            mask = best.mask,
            modules = List(side) { y -> List(side) { x -> best.cells[y * side + x] == 1 } },
        )
    }
}
