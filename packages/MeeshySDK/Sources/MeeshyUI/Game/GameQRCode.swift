import Foundation

// MARK: - L'encodeur QR du lien de parrainage (#9554)
//
// MIROIR de `apps/web/src/lib/qr.ts` — ISO/IEC 18004, écrit ici plutôt que confié à
// `CIQRCodeGenerator` : la carte du jeu doit montrer le MÊME carré sur le web et sur iOS, module
// pour module, et CoreImage peut élire un autre masque. UN cas : un lien, en mode octet (UTF-8),
// correction M.
//
// PUR : un texte entre, une matrice sort — `modules[y][x]`, `true` = sombre, SANS marge de silence
// (elle appartient à celui qui peint). La version est la plus petite qui porte le texte ; le masque
// est celui que la norme élit, le moins pénalisé des huit — un faux repère 1:1:3:1:1 coûte 40 une
// seule fois et le bord compte pour clair (la lecture de libqrencode, dont sortent les matrices de
// référence du témoin).

/// La matrice d'un QR code, sans marge de silence.
nonisolated public struct GameQRMatrix: Equatable, Sendable {
    /// 1 à 40.
    public let version: Int
    /// Le côté, en modules : `17 + 4 × version`.
    public let size: Int
    /// Le masque retenu, 0 à 7.
    public let mask: Int
    /// `modules[y][x]`, `true` = sombre.
    public let modules: [[Bool]]
}

nonisolated public enum GameQRCode {

    public static let maxVersion = 40

    /// Correction M : octets de correction par bloc, par version (rang 0 = version 1).
    private static let eccPerBlockTable: [Int] = [
        10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
        26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
    ]
    /// Correction M : nombre de blocs, par version (rang 0 = version 1).
    private static let blockCountTable: [Int] = [
        1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
        17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
    ]
    /// Les deux bits de la correction M dans l'information de format.
    private static let formatLevelM = 0

    private static let runPenalty = 3
    private static let blockPenalty = 3
    private static let finderPenalty = 40
    private static let balancePenalty = 10

    private nonisolated struct Grid {
        let side: Int
        var dark: [UInt8]
        var reserved: [UInt8]
    }

    private nonisolated struct Block {
        let data: [UInt8]
        let ecc: [UInt8]
    }

    private nonisolated struct Candidate {
        let mask: Int
        let cells: [UInt8]
        let penalty: Int
    }

    // MARK: - Capacités

    private static func sideLength(of version: Int) -> Int { 17 + 4 * version }

    private static func rawCodewords(_ version: Int) -> Int {
        let base = (16 * version + 128) * version + 64
        guard version >= 2 else { return base >> 3 }
        let align = version / 7 + 2
        let modules = base - ((25 * align - 10) * align - 55) - (version >= 7 ? 36 : 0)
        return modules >> 3
    }

    private static func eccPerBlock(_ version: Int) -> Int { eccPerBlockTable[version - 1] }
    private static func blockCount(_ version: Int) -> Int { blockCountTable[version - 1] }
    private static func dataCodewords(_ version: Int) -> Int { rawCodewords(version) - eccPerBlock(version) * blockCount(version) }
    private static func countBits(_ version: Int) -> Int { version < 10 ? 8 : 16 }

    /// La capacité en octets de texte : les octets de données, moins l'en-tête (mode sur 4 bits + compteur).
    public static func byteCapacity(version: Int) -> Int {
        guard (1...maxVersion).contains(version) else { return 0 }
        return (dataCodewords(version) * 8 - 4 - countBits(version)) / 8
    }

    private static func version(for byteLength: Int, maxVersion limit: Int) -> Int? {
        let last = min(limit, maxVersion)
        guard last >= 1 else { return nil }
        return (1...last).first { byteLength <= byteCapacity(version: $0) }
    }

    // MARK: - Données et correction

    private static func dataBytes(_ bytes: [UInt8], version: Int) -> [UInt8] {
        let capacity = dataCodewords(version)
        var bits: [UInt8] = []
        func push(_ value: Int, _ length: Int) {
            for shift in stride(from: length - 1, through: 0, by: -1) {
                bits.append(UInt8((value >> shift) & 1))
            }
        }
        push(0b0100, 4)
        push(bytes.count, countBits(version))
        for byte in bytes { push(Int(byte), 8) }
        push(0, min(4, capacity * 8 - bits.count))
        push(0, (8 - bits.count % 8) % 8)
        var out = [UInt8](repeating: 0, count: capacity)
        for (index, bit) in bits.enumerated() {
            out[index >> 3] |= bit << UInt8(7 - (index & 7))
        }
        var pad: UInt8 = 0xEC
        for index in stride(from: bits.count >> 3, to: capacity, by: 1) {
            out[index] = pad
            pad ^= 0xEC ^ 0x11
        }
        return out
    }

    /// Le produit dans GF(2⁸), polynôme 0x11D.
    private static func gfMultiply(_ a: Int, _ b: Int) -> Int {
        var product = 0
        for shift in stride(from: 7, through: 0, by: -1) {
            product = (product << 1) ^ ((product >> 7) * 0x11D)
            product ^= ((b >> shift) & 1) * a
        }
        return product
    }

    private static func rsDivisor(degree: Int) -> [Int] {
        var divisor = [Int](repeating: 0, count: degree)
        divisor[degree - 1] = 1
        var root = 1
        for _ in 0..<degree {
            for index in 0..<degree {
                let next = index + 1 < degree ? divisor[index + 1] : 0
                divisor[index] = gfMultiply(divisor[index], root) ^ next
            }
            root = gfMultiply(root, 2)
        }
        return divisor
    }

    private static func rsRemainder(_ data: [UInt8], divisor: [Int]) -> [UInt8] {
        var remainder = [Int](repeating: 0, count: divisor.count)
        for byte in data {
            let factor = Int(byte) ^ remainder[0]
            remainder.removeFirst()
            remainder.append(0)
            for index in 0..<divisor.count {
                remainder[index] ^= gfMultiply(divisor[index], factor)
            }
        }
        return remainder.map { UInt8($0 & 0xFF) }
    }

    /// Les blocs de données puis leurs corrections, entrelacés octet par octet ; les blocs courts d'abord.
    private static func interleaved(_ data: [UInt8], version: Int) -> [UInt8] {
        let blocks = blockCount(version)
        let ecc = eccPerBlock(version)
        let raw = rawCodewords(version)
        let shortBlocks = blocks - raw % blocks
        let shortData = raw / blocks - ecc
        let divisor = rsDivisor(degree: ecc)
        var parts: [Block] = []
        var offset = 0
        for block in 0..<blocks {
            let length = shortData + (block < shortBlocks ? 0 : 1)
            let slice = Array(data[offset..<(offset + length)])
            parts.append(Block(data: slice, ecc: rsRemainder(slice, divisor: divisor)))
            offset += length
        }
        var out: [UInt8] = []
        for index in 0...shortData {
            for part in parts where index < part.data.count { out.append(part.data[index]) }
        }
        for index in 0..<ecc {
            for part in parts { out.append(part.ecc[index]) }
        }
        return out
    }

    // MARK: - Motifs de fonction

    private static func alignmentCenters(_ version: Int) -> [Int] {
        guard version > 1 else { return [] }
        let count = version / 7 + 2
        let divider = count * 2 - 2
        let step = version == 32 ? 26 : ((version * 4 + 4 + divider - 1) / divider) * 2
        let last = sideLength(of: version) - 7
        return [6] + (0..<(count - 1)).map { last - (count - 2 - $0) * step }
    }

    /// Tout ce qui ne porte pas de donnée : repères, synchronisation, alignement, version, et la place du format.
    private static func functionPatterns(_ version: Int) -> Grid {
        let side = sideLength(of: version)
        var grid = Grid(side: side, dark: [UInt8](repeating: 0, count: side * side), reserved: [UInt8](repeating: 0, count: side * side))
        func set(_ x: Int, _ y: Int, _ on: Bool) {
            guard x >= 0, y >= 0, x < side, y < side else { return }
            grid.dark[y * side + x] = on ? 1 : 0
            grid.reserved[y * side + x] = 1
        }

        for index in 0..<side {
            set(6, index, index % 2 == 0)
            set(index, 6, index % 2 == 0)
        }

        for (cx, cy) in [(3, 3), (side - 4, 3), (3, side - 4)] {
            for dy in -4...4 {
                for dx in -4...4 {
                    let ring = max(abs(dx), abs(dy))
                    set(cx + dx, cy + dy, ring != 2 && ring != 4)
                }
            }
        }

        let centers = alignmentCenters(version)
        let lastIndex = centers.count - 1
        for (row, cy) in centers.enumerated() {
            for (column, cx) in centers.enumerated() {
                let onFinder = (row == 0 && column == 0) || (row == 0 && column == lastIndex) || (row == lastIndex && column == 0)
                guard !onFinder else { continue }
                for dy in -2...2 {
                    for dx in -2...2 {
                        set(cx + dx, cy + dy, max(abs(dx), abs(dy)) != 1)
                    }
                }
            }
        }

        for index in 0..<9 where index != 6 {
            set(8, index, false)
            set(index, 8, false)
        }
        for index in 0..<8 {
            set(side - 1 - index, 8, false)
            set(8, side - 1 - index, false)
        }
        set(8, side - 8, true)

        if version >= 7 {
            let remainder = (0..<12).reduce(version) { value, _ in (value << 1) ^ ((value >> 11) * 0x1F25) }
            let bits = (version << 12) | remainder
            for index in 0..<18 {
                let on = (bits >> index) & 1 == 1
                let a = side - 11 + index % 3
                let b = index / 3
                set(a, b, on)
                set(b, a, on)
            }
        }
        return grid
    }

    /// Les octets se posent en zigzag, deux colonnes à la fois, de bas en haut puis de haut en bas, depuis le coin bas-droit.
    private static func placeData(_ grid: inout Grid, codewords: [UInt8]) {
        let side = grid.side
        let total = codewords.count * 8
        var bit = 0
        var right = side - 1
        while right >= 1 {
            if right == 6 { right = 5 }
            let upward = (right + 1) & 2 == 0
            for step in 0..<side {
                let y = upward ? side - 1 - step : step
                for column in 0..<2 {
                    let index = y * side + right - column
                    guard grid.reserved[index] == 0 else { continue }
                    if bit < total {
                        grid.dark[index] = (codewords[bit >> 3] >> UInt8(7 - (bit & 7))) & 1
                    }
                    bit += 1
                }
            }
            right -= 2
        }
    }

    // MARK: - Masques

    private static func flips(mask: Int, x: Int, y: Int) -> Bool {
        switch mask {
        case 0: (x + y) % 2 == 0
        case 1: y % 2 == 0
        case 2: x % 3 == 0
        case 3: (x + y) % 3 == 0
        case 4: (x / 3 + y / 2) % 2 == 0
        case 5: (x * y) % 2 + (x * y) % 3 == 0
        case 6: ((x * y) % 2 + (x * y) % 3) % 2 == 0
        case 7: ((x + y) % 2 + (x * y) % 3) % 2 == 0
        default: false
        }
    }

    private static func masked(_ grid: Grid, mask: Int) -> [UInt8] {
        let side = grid.side
        var out = grid.dark
        for y in 0..<side {
            for x in 0..<side where grid.reserved[y * side + x] == 0 && flips(mask: mask, x: x, y: y) {
                out[y * side + x] ^= 1
            }
        }

        let data = (formatLevelM << 3) | mask
        let remainder = (0..<10).reduce(data) { value, _ in (value << 1) ^ ((value >> 9) * 0x537) }
        let bits = ((data << 10) | remainder) ^ 0x5412
        func set(_ x: Int, _ y: Int, _ index: Int) {
            out[y * side + x] = UInt8((bits >> index) & 1)
        }
        for index in 0...5 { set(8, index, index) }
        set(8, 7, 6)
        set(8, 8, 7)
        set(7, 8, 8)
        for index in 9..<15 { set(14 - index, 8, index) }
        for index in 0..<8 { set(side - 1 - index, 8, index) }
        for index in 8..<15 { set(8, side - 15 + index, index) }
        return out
    }

    /// Les suites d'au moins cinq modules d'une couleur, et les faux repères 1:1:3:1:1 bordés de quatre
    /// modules clairs (le bord compte pour clair).
    private static func linePenalty(_ line: [UInt8]) -> Int {
        guard let first = line.first else { return 0 }
        var runs: [Int] = []
        var penalty = 0
        var start = 0
        for index in 1...line.count {
            if index < line.count, line[index] == line[start] { continue }
            let length = index - start
            if length >= 5 { penalty += runPenalty + length - 5 }
            runs.append(length)
            start = index
        }
        let firstDark = first == 1 ? 0 : 1
        for index in stride(from: firstDark + 2, to: runs.count - 2, by: 2) {
            let unit = runs[index - 2]
            let core = runs[index] == unit * 3 && runs[index - 1] == unit && runs[index + 1] == unit && runs[index + 2] == unit
            guard core else { continue }
            let before = index - 3 < 0 ? Int.max : runs[index - 3]
            let after = index + 3 >= runs.count ? Int.max : runs[index + 3]
            if before >= unit * 4 || after >= unit * 4 { penalty += finderPenalty }
        }
        return penalty
    }

    private static func penalty(of cells: [UInt8], side: Int) -> Int {
        var penalty = 0
        var darkCount = 0
        for index in 0..<side {
            penalty += linePenalty(Array(cells[(index * side)..<((index + 1) * side)]))
            penalty += linePenalty((0..<side).map { cells[$0 * side + index] })
        }
        for y in 0..<side {
            for x in 0..<side {
                let cell = cells[y * side + x]
                darkCount += Int(cell)
                guard x < side - 1, y < side - 1 else { continue }
                if cell == cells[y * side + x + 1], cell == cells[(y + 1) * side + x], cell == cells[(y + 1) * side + x + 1] {
                    penalty += blockPenalty
                }
            }
        }
        let total = side * side
        let imbalance = abs(darkCount * 20 - total * 10)
        return penalty + ((imbalance + total - 1) / total - 1) * balancePenalty
    }

    // MARK: - L'encodage

    /// Le texte (UTF-8, mode octet, correction M) → sa matrice ; `nil` quand aucune version permise ne
    /// le porte. `maxVersion` : la plus grande version acceptée — celui qui peint sait combien de
    /// modules il peut rendre lisibles.
    public static func encode(_ text: String, maxVersion limit: Int = GameQRCode.maxVersion) -> GameQRMatrix? {
        let bytes = Array(text.utf8)
        guard let version = version(for: bytes.count, maxVersion: limit) else { return nil }
        var grid = functionPatterns(version)
        placeData(&grid, codewords: interleaved(dataBytes(bytes, version: version), version: version))
        let side = grid.side
        let candidates = (0..<8).map { mask -> Candidate in
            let cells = masked(grid, mask: mask)
            return Candidate(mask: mask, cells: cells, penalty: penalty(of: cells, side: side))
        }
        guard let best = candidates.min(by: { $0.penalty < $1.penalty }) else { return nil }
        return GameQRMatrix(
            version: version,
            size: side,
            mask: best.mask,
            modules: (0..<side).map { y in (0..<side).map { x in best.cells[y * side + x] == 1 } }
        )
    }
}
