import CoreGraphics
import Foundation

/// Une case : son rectangle (avant rotation), sa forme, son inclinaison en degrés (sens horaire), l'index de la personne.
nonisolated struct CallFrameSlotBox: Equatable, Sendable {
    let rect: CGRect
    let shape: CallFrameSlotShape
    let rotation: Double
    let index: Int
}

/// Les zones de la toile : l'intérieur (toile moins la marge), les deux réserves de texte, et la zone de contenu entre elles.
nonisolated struct CallFrameAreas: Equatable, Sendable {
    let unit: CGFloat
    let inner: CGRect
    let top: CGRect
    let content: CGRect
    let bottom: CGRect
}

/// **LA GÉOMÉTRIE CANONIQUE D'UN CADRE** — le portage LITTÉRAL de
/// `apps/web/src/lib/calls/frames/frame-layout.ts` : mêmes formules, même
/// graine (`scatter`), même ordre. Repère : origine en haut à gauche, y vers
/// le bas, angles en degrés dans le sens horaire. La fixture de parité
/// `packages/shared/design/call-capture-frames-layout.fixture.json` en fige
/// les sorties ; `CallFrameLayoutParityTests` les compare à 0,5 près.
nonisolated enum CallFrameLayoutGeometry {
    static let diagonalShare: CGFloat = 0.64
    static let heroShare: CGFloat = 0.62
    static let orbitCenterShare: CGFloat = 0.38
    static let scatterShrink: CGFloat = 0.88
    static let tiersBackShare: CGFloat = 0.86
    static let mosaicShare: CGFloat = 2.0 / 3.0
    static let cascadeShare: CGFloat = 0.6
    static let hexRatio: CGFloat = 2 / CGFloat(3).squareRoot()

    /// Le tirage pseudo-aléatoire DÉTERMINISTE (0…1) de `call-montage-shapes.ts` : le même cadre à chaque image.
    static func scatter(_ seed: Double) -> Double {
        let value = sin(seed * 12.9898 + 78.233) * 43758.5453
        return value - floor(value)
    }

    static func rect(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat) -> CGRect {
        CGRect(x: x, y: y, width: max(0, width), height: max(0, height))
    }

    static func square(_ cx: CGFloat, _ cy: CGFloat, _ side: CGFloat) -> CGRect {
        rect(cx - side / 2, cy - side / 2, side, side)
    }

    static func isPortrait(_ size: CGSize) -> Bool { size.height >= size.width }

    static func areas(_ layout: CallFrameLayout, size: CGSize) -> CallFrameAreas {
        let unit = min(size.width, size.height)
        let margin = min(CGFloat(layout.margin) * unit, unit / 2)
        let inner = rect(margin, margin, size.width - margin * 2, size.height - margin * 2)
        let topHeight = min(CGFloat(layout.top) * size.height, inner.height)
        let bottomHeight = min(CGFloat(layout.bottom) * size.height, inner.height - topHeight)
        let top = rect(inner.minX, inner.minY, inner.width, topHeight)
        let bottom = rect(inner.minX, inner.minY + inner.height - bottomHeight, inner.width, bottomHeight)
        let content = rect(inner.minX, inner.minY + topHeight, inner.width, inner.height - topHeight - bottomHeight)
        return CallFrameAreas(unit: unit, inner: inner, top: top, content: content, bottom: bottom)
    }

    /// La grille équilibrée de `gridRects` : autant de colonnes que la racine, l'orientation de l'aire décidant du sens.
    static func gridRects(_ count: Int, _ area: CGRect, _ gap: CGFloat) -> [CGRect] {
        guard count > 0 else { return [] }
        let wide = area.width >= area.height
        let major = Int(Double(count).squareRoot().rounded(.up))
        let minor = Int((Double(count) / Double(major)).rounded(.up))
        let (cols, rows) = wide ? (major, minor) : (minor, major)
        let cellWidth = (area.width - gap * CGFloat(cols - 1)) / CGFloat(cols)
        let cellHeight = (area.height - gap * CGFloat(rows - 1)) / CGFloat(rows)
        return (0 ..< count).map { index in
            let row = index / cols
            let inRow = row == rows - 1 ? count - row * cols : cols
            let offset = (CGFloat(cols - inRow) * (cellWidth + gap)) / 2
            return CGRect(
                x: area.minX + offset + CGFloat(index % cols) * (cellWidth + gap),
                y: area.minY + CGFloat(row) * (cellHeight + gap),
                width: cellWidth,
                height: cellHeight
            )
        }
    }

    static func split(_ area: CGRect, _ gap: CGFloat, portrait: Bool) -> [CGRect] {
        if portrait {
            let height = (area.height - gap) / 2
            return [rect(area.minX, area.minY, area.width, height), rect(area.minX, area.minY + height + gap, area.width, height)]
        }
        let width = (area.width - gap) / 2
        return [rect(area.minX, area.minY, width, area.height), rect(area.minX + width + gap, area.minY, width, area.height)]
    }

    static func diagonal(_ area: CGRect) -> [CGRect] {
        let width = area.width * diagonalShare
        let height = area.height * diagonalShare
        return [rect(area.minX, area.minY, width, height), rect(area.minX + area.width - width, area.minY + area.height - height, width, height)]
    }

    static func squareLine(_ count: Int, _ area: CGRect, _ gap: CGFloat, horizontal: Bool) -> [CGRect] {
        guard count > 0 else { return [] }
        let along = horizontal ? area.width : area.height
        let across = horizontal ? area.height : area.width
        let side = max(0, min(across, (along - gap * CGFloat(count - 1)) / CGFloat(count)))
        let span = side * CGFloat(count) + gap * CGFloat(count - 1)
        let start = (horizontal ? area.minX : area.minY) + (along - span) / 2
        let cross = (horizontal ? area.minY : area.minX) + (across - side) / 2
        return (0 ..< count).map { index in
            let offset = start + CGFloat(index) * (side + gap)
            return horizontal ? rect(offset, cross, side, side) : rect(cross, offset, side, side)
        }
    }

    static func hero(_ count: Int, _ area: CGRect, _ gap: CGFloat, portrait: Bool) -> [CGRect] {
        if count == 1 { return [area] }
        if portrait {
            let height = area.height * heroShare
            let rest = rect(area.minX, area.minY + height + gap, area.width, area.height - height - gap)
            return [rect(area.minX, area.minY, area.width, height)] + squareLine(count - 1, rest, gap, horizontal: true)
        }
        let width = area.width * heroShare
        let rest = rect(area.minX + width + gap, area.minY, area.width - width - gap, area.height)
        return [rect(area.minX, area.minY, width, area.height)] + squareLine(count - 1, rest, gap, horizontal: false)
    }

    static func arch(_ count: Int, _ area: CGRect, _ gap: CGFloat) -> [CGRect] {
        let angles = (0 ..< count).map { CGFloat.pi + (CGFloat.pi * (CGFloat($0) + 0.5)) / CGFloat(count) }
        let cosines = angles.map { cos($0) }
        let sines = angles.map { sin($0) }
        let chord: CGFloat = count > 1 ? 2 * sin(CGFloat.pi / CGFloat(2 * count)) * neighbourReach(angles) : 1
        let minCos = cosines.min() ?? 0
        let maxCos = cosines.max() ?? 0
        let minSin = sines.min() ?? 0
        let maxSin = sines.max() ?? 0
        let spanX: CGFloat = count > 1 ? (maxCos - minCos) / chord : 0
        let spanY: CGFloat = count > 1 ? (maxSin - minSin) / chord : 0
        let side = max(0, min((area.width - gap * spanX) / (1 + spanX), (area.height - gap * spanY) / (1 + spanY)))
        let radius: CGFloat = count > 1 ? (side + gap) / chord : 0
        let minX = minCos * radius
        let minY = minSin * radius
        let width = spanX * (side + gap) + side
        let height = spanY * (side + gap) + side
        let originX = area.minX + (area.width - width) / 2 + side / 2 - minX
        let originY = area.minY + (area.height - height) / 2 + side / 2 - minY
        return (0 ..< count).map { square(originX + cosines[$0] * radius, originY + sines[$0] * radius, side) }
    }

    /// Ce qu'une distance `d` selon `angle` sépare deux carrés alignés sur les axes : `d · max(|cos|, |sin|)`.
    static func axisReach(_ angle: CGFloat) -> CGFloat {
        max(abs(cos(angle)), abs(sin(angle)))
    }

    /// Le plus petit `axisReach` des cordes qui joignent deux angles voisins de `angles`.
    static func neighbourReach(_ angles: [CGFloat]) -> CGFloat {
        zip(angles, angles.dropFirst()).map { axisReach(($0 + $1) / 2 + .pi / 2) }.min() ?? .infinity
    }

    static func orbit(_ count: Int, _ area: CGRect, _ gap: CGFloat) -> [CGRect] {
        let middle = CGPoint(x: area.midX, y: area.midY)
        let reach = min(area.width, area.height)
        let core = reach * orbitCenterShare
        let satellites = count - 1
        guard satellites > 0 else { return [square(middle.x, middle.y, core)] }
        let angles = (0 ..< satellites).map { -CGFloat.pi / 2 + (2 * CGFloat.pi * CGFloat($0)) / CGFloat(satellites) }
        let radial = angles.map { axisReach($0) }.min() ?? 1
        let ring: CGFloat = satellites > 1
            ? 2 * sin(CGFloat.pi / CGFloat(satellites)) * neighbourReach(angles + [angles[0] + 2 * CGFloat.pi])
            : .infinity
        let fits = angles.flatMap { angle -> [CGFloat] in
            let axes: [(CGFloat, CGFloat)] = [(abs(cos(angle)), area.width / 2), (abs(sin(angle)), area.height / 2)]
            return axes.flatMap { axis -> [CGFloat] in
                let (onAxis, halfAxis) = axis
                return [
                    (halfAxis - (onAxis * (core / 2 + gap)) / radial) / (onAxis / (2 * radial) + 0.5),
                    (halfAxis - (onAxis * gap) / ring) / (onAxis / ring + 0.5),
                ]
            }
        }
        let side = max(0, min(core, fits.min() ?? core))
        let radius = max((core / 2 + side / 2 + gap) / radial, (side + gap) / ring)
        let ringRects = angles.map { square(middle.x + cos($0) * radius, middle.y + sin($0) * radius, side) }
        return [square(middle.x, middle.y, core)] + ringRects
    }

    static func scattered(_ count: Int, _ area: CGRect, _ gap: CGFloat) -> [CGRect] {
        gridRects(count, area, gap).enumerated().map { index, cell in
            let width = cell.width * scatterShrink
            let height = cell.height * scatterShrink
            let dx = CGFloat(scatter(Double(index * 2 + 1)) - 0.5) * (cell.width - width)
            let dy = CGFloat(scatter(Double(index * 2 + 2)) - 0.5) * (cell.height - height)
            return rect(cell.minX + (cell.width - width) / 2 + dx, cell.minY + (cell.height - height) / 2 + dy, width, height)
        }
    }

    static func rowCounts(_ count: Int, _ rows: Int) -> [Int] {
        (0 ..< rows).map { row in count / rows + (row < count % rows ? 1 : 0) }
    }

    static func rowShifts(_ counts: [Int]) -> [CGFloat] {
        counts.indices.reduce(into: [CGFloat]()) { shifts, row in
            let previous = row > 0 ? shifts[row - 1] : 0
            let shifted = row > 0 && counts[row] == counts[row - 1]
            shifts.append(shifted ? (previous == 0 ? 0.5 : 0) : previous)
        }
    }

    private nonisolated struct TiersPlan {
        let counts: [Int]
        let scales: [CGFloat]
        let shifts: [CGFloat]
        let side: CGFloat
    }

    static func tiers(_ count: Int, _ area: CGRect, _ gap: CGFloat) -> [CGRect] {
        func plan(_ rows: Int) -> TiersPlan {
            let counts = rowCounts(count, rows)
            let scales = counts.indices.map { pow(tiersBackShare, CGFloat($0)) }
            let shifts = rowShifts(counts)
            let rightSlope = counts.indices.map { scales[$0] * (CGFloat(counts[$0]) / 2 + shifts[$0]) }
            let leftSlope = counts.indices.map { scales[$0] * (shifts[$0] - CGFloat(counts[$0]) / 2) }
            let gaps = counts.map { gap * CGFloat($0 - 1) / 2 }
            let widthFit = counts.indices.flatMap { i in
                counts.indices.map { j in (area.width - gaps[i] - gaps[j]) / (rightSlope[i] - leftSlope[j]) }
            }.min() ?? .infinity
            let heightFit = (area.height - gap * CGFloat(rows - 1)) / scales.reduce(0, +)
            return TiersPlan(counts: counts, scales: scales, shifts: shifts, side: max(0, min(heightFit, widthFit)))
        }
        guard count > 0 else { return [] }
        let best = (1 ... count).map(plan).reduce(plan(1)) { winner, candidate in candidate.side > winner.side ? candidate : winner }
        let sides = best.scales.map { best.side * $0 }
        let rows = best.counts.indices.map { row -> (value: Int, side: CGFloat, left: CGFloat, right: CGFloat) in
            let value = best.counts[row]
            let side = sides[row]
            let span = side * CGFloat(value) + gap * CGFloat(value - 1)
            let left = -span / 2 + best.shifts[row] * side
            return (value, side, left, left + span)
        }
        let maxRight = rows.map { $0.right }.max() ?? 0
        let minLeft = rows.map { $0.left }.min() ?? 0
        let centerX = area.minX + area.width / 2 - (maxRight + minLeft) / 2
        let blockHeight = sides.reduce(0, +) + gap * CGFloat(sides.count - 1)
        let bottom = area.minY + (area.height + blockHeight) / 2
        return rows.enumerated().flatMap { index, row -> [CGRect] in
            let above = sides.prefix(index + 1).reduce(0, +) + gap * CGFloat(index)
            return (0 ..< row.value).map { cell in
                rect(centerX + row.left + CGFloat(cell) * (row.side + gap), bottom - above, row.side, row.side)
            }
        }
    }

    static func mosaic(_ count: Int, _ area: CGRect, _ gap: CGFloat, portrait: Bool) -> [CGRect] {
        if count == 1 { return [area] }
        if portrait {
            let height = (area.height - gap) * mosaicShare
            let rest = rect(area.minX, area.minY + height + gap, area.width, area.height - height - gap)
            return [rect(area.minX, area.minY, area.width, height)] + gridRects(count - 1, rest, gap)
        }
        let width = (area.width - gap) * mosaicShare
        let rest = rect(area.minX + width + gap, area.minY, area.width - width - gap, area.height)
        return [rect(area.minX, area.minY, width, area.height)] + gridRects(count - 1, rest, gap)
    }

    static func honeycombRows(_ count: Int, _ cols: Int, _ row: Int) -> [Int] {
        guard count > 0 else { return [] }
        let slots = cols == 1 || row % 2 == 0 ? cols : cols - 1
        return [min(slots, count)] + honeycombRows(count - slots, cols, row + 1)
    }

    private nonisolated struct HoneycombPlan {
        let cols: Int
        let counts: [Int]
        let pitchShare: CGFloat
        let height: CGFloat
    }

    static func honeycomb(_ count: Int, _ area: CGRect, _ gap: CGFloat) -> [CGRect] {
        func plan(_ cols: Int) -> HoneycombPlan {
            let counts = honeycombRows(count, cols, 0)
            let rows = counts.count
            let pitchShare: CGFloat = cols == 1 ? 1 : 0.75
            let heightFit = (area.height - gap * CGFloat(rows - 1)) / (1 + pitchShare * CGFloat(rows - 1))
            let widthFit = ((area.width - gap * CGFloat(cols - 1)) / CGFloat(cols)) * hexRatio
            return HoneycombPlan(cols: cols, counts: counts, pitchShare: pitchShare, height: max(0, min(heightFit, widthFit)))
        }
        guard count > 0 else { return [] }
        let candidates = (0 ..< max(1, count - 1)).map { plan(count == 1 ? 1 : $0 + 2) }
        let best = candidates.dropFirst().reduce(candidates[0]) { winner, candidate in candidate.height > winner.height ? candidate : winner }
        let height = best.height
        let width = height / hexRatio
        let rows = best.counts.count
        let blockWidth = CGFloat(best.cols) * width + gap * CGFloat(best.cols - 1)
        let blockHeight = height + CGFloat(rows - 1) * (height * best.pitchShare + gap)
        let originX = area.minX + (area.width - blockWidth) / 2
        let originY = area.minY + (area.height - blockHeight) / 2
        return best.counts.enumerated().flatMap { row, value -> [CGRect] in
            let full = best.cols == 1 || row % 2 == 0
            let slots = full ? best.cols : best.cols - 1
            let inset: CGFloat = full ? 0 : (width + gap) / 2
            let first = (slots - value) / 2
            let y = originY + CGFloat(row) * (height * best.pitchShare + gap)
            return (0 ..< value).map { index in
                rect(originX + inset + CGFloat(first + index) * (width + gap), y, width, height)
            }
        }
    }

    static func cascade(_ count: Int, _ area: CGRect) -> [CGRect] {
        let width = area.width * cascadeShare
        let height = area.height * cascadeShare
        if count == 1 { return [rect(area.minX + (area.width - width) / 2, area.minY + (area.height - height) / 2, width, height)] }
        return (0 ..< count).map { index in
            rect(
                area.minX + ((area.width - width) * CGFloat(index)) / CGFloat(count - 1),
                area.minY + ((area.height - height) * CGFloat(index)) / CGFloat(count - 1),
                width,
                height
            )
        }
    }

    /// `split` et `diagonal` n'ont de sens qu'à deux : à tout autre nombre, la grille.
    static func servedArrangement(_ arrangement: CallFrameArrangement, count: Int) -> CallFrameArrangement {
        arrangement.isDuoOnly && count != 2 ? .grid : arrangement
    }

    static func arrangementRects(_ layout: CallFrameLayout, count: Int, area: CGRect, gap: CGFloat, portrait: Bool) -> [CGRect] {
        switch servedArrangement(layout.arrangement, count: count) {
        case .split: return split(area, gap, portrait: portrait)
        case .diagonal: return diagonal(area)
        case .hero: return hero(count, area, gap, portrait: portrait)
        case .grid: return gridRects(count, area, gap)
        case .row: return squareLine(count, area, gap, horizontal: !portrait)
        case .column: return squareLine(count, area, gap, horizontal: portrait)
        case .arch: return arch(count, area, gap)
        case .orbit: return orbit(count, area, gap)
        case .scatter: return scattered(count, area, gap)
        case .tiers: return tiers(count, area, gap)
        case .mosaic: return mosaic(count, area, gap, portrait: portrait)
        case .honeycomb: return honeycomb(count, area, gap)
        case .cascade: return cascade(count, area)
        }
    }

    /// L'inclinaison de la case `index` : alternée (gauche, droite…), d'amplitude 50 à 100 % du maximum (graine index + 1).
    static func tiltDegrees(_ tilt: CallFrameTilt, index: Int) -> Double {
        let maximum = tilt.degrees
        guard maximum != 0 else { return 0 }
        let sign: Double = index % 2 == 0 ? -1 : 1
        return sign * maximum * (0.5 + 0.5 * scatter(Double(index + 1)))
    }

    /// Réduit `box` autour de son centre pour que, tourné de `degrees`, son encombrement tienne dans `bounds`.
    static func keepInside(_ box: CGRect, degrees: Double, bounds: CGRect) -> CGRect {
        guard degrees != 0, box.width > 0, box.height > 0 else { return box }
        let radians = CGFloat(abs(degrees)) * .pi / 180
        let cosine = cos(radians)
        let sine = sin(radians)
        let middle = CGPoint(x: box.midX, y: box.midY)
        let halfX = (box.width * cosine + box.height * sine) / 2
        let halfY = (box.width * sine + box.height * cosine) / 2
        let roomX = min(middle.x - bounds.minX, bounds.minX + bounds.width - middle.x)
        let roomY = min(middle.y - bounds.minY, bounds.minY + bounds.height - middle.y)
        let factor = max(0, min(1, roomX / halfX, roomY / halfY))
        guard factor < 1 else { return box }
        return rect(middle.x - (box.width * factor) / 2, middle.y - (box.height * factor) / 2, box.width * factor, box.height * factor)
    }

    /// **UNE CASE PAR PERSONNE** — les `people` cases du cadre dans une toile de `size`, dans l'ordre des personnes.
    static func slots(layout: CallFrameLayout, slot: CallFrameSlotStyle, people: Int, size: CGSize) -> [CallFrameSlotBox] {
        let count = max(0, people)
        guard count > 0 else { return [] }
        let zones = areas(layout, size: size)
        let gap = CGFloat(layout.gap) * zones.unit
        let shape: CallFrameSlotShape = layout.arrangement == .honeycomb ? .hex : slot.shape
        return arrangementRects(layout, count: count, area: zones.content, gap: gap, portrait: isPortrait(size))
            .enumerated()
            .map { index, box in
                let rotation = tiltDegrees(slot.tilt, index: index)
                return CallFrameSlotBox(rect: keepInside(box, degrees: rotation, bounds: zones.content), shape: shape, rotation: rotation, index: index)
            }
    }

    static func slots(for frame: CallFrameDesign, people: Int, size: CGSize) -> [CallFrameSlotBox] {
        slots(layout: frame.look.layout, slot: frame.look.slot, people: people, size: size)
    }
}
