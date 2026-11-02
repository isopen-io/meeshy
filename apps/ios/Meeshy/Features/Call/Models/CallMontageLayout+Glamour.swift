import CoreGraphics
import Foundation

nonisolated extension CallMontageLayout {
    static let filmFrameAspect: CGFloat = 0.75
    static let goldCameoAspect: CGFloat = 1.3
    static let redCarpetAspect: CGFloat = 4 / 3

    static func glamourCaptionBand(style: CallMontageStyle, canvas: CGSize) -> CGRect? {
        switch style {
        case .cover: return CGRect(x: 0, y: canvas.height * 0.02, width: canvas.width, height: canvas.height * 0.12)
        case .redcarpet: return CGRect(x: 0, y: canvas.height * 0.07, width: canvas.width, height: canvas.height * 0.12)
        case .neon: return CGRect(x: 0, y: canvas.height * 0.03, width: canvas.width, height: canvas.height * 0.1)
        case .gold: return CGRect(x: 0, y: canvas.height * 0.9, width: canvas.width, height: canvas.height * 0.07)
        case .noir: return CGRect(x: 0, y: canvas.height * 0.9, width: canvas.width, height: canvas.height * 0.07)
        case .screen, .grid, .strip, .polaroid, .magazine, .film, .comic, .heart: return nil
        }
    }

    static func cover(count: Int, in bounds: CGRect) -> [CallMontageSlot] {
        let margin = bounds.width * 0.06
        let gap = bounds.width * 0.03
        let medallions = medallionFrames(count: count - 1, in: bounds, margin: margin, gap: gap)
        let heroTop = bounds.height * 0.15
        let heroBottom = (medallions.map(\.minY).min() ?? bounds.height * 0.95) - gap
        let hero = CGRect(x: margin, y: heroTop, width: bounds.width - margin * 2, height: heroBottom - heroTop)
        return [CallMontageSlot(frame: hero, shape: .roundedRectangle, cornerRadius: bounds.width * 0.02)]
            + medallions.map { CallMontageSlot(frame: $0, shape: .circle) }
    }

    static func gold(count: Int, in bounds: CGRect) -> [CallMontageSlot] {
        let area = CGRect(x: bounds.width * 0.1, y: bounds.height * 0.06, width: bounds.width * 0.8, height: bounds.height * 0.82)
        return cells(count: count, in: area, gap: bounds.width * 0.08).map { cell in
            let width = min(cell.width, cell.height / goldCameoAspect) * 0.9
            let height = width * goldCameoAspect
            return CallMontageSlot(
                frame: CGRect(x: cell.midX - width / 2, y: cell.midY - height / 2, width: width, height: height),
                shape: .circle
            )
        }
    }

    static func redCarpet(count: Int, in bounds: CGRect) -> [CallMontageSlot] {
        let area = CGRect(x: bounds.width * 0.05, y: bounds.height * 0.24, width: bounds.width * 0.9, height: bounds.height * 0.58)
        let rows = count <= 4 ? 1 : (count <= 8 ? 2 : 3)
        let columns = Int((Double(count) / Double(rows)).rounded(.up))
        let gap = bounds.width * 0.03
        let columnWidth = (area.width - gap * CGFloat(columns - 1)) / CGFloat(columns)
        let rowHeight = (area.height - gap * CGFloat(rows - 1)) / CGFloat(rows)
        let width = min(columnWidth, rowHeight / redCarpetAspect)
        let height = width * redCarpetAspect
        let blockHeight = CGFloat(rows) * height + CGFloat(rows - 1) * gap
        let bottom = area.maxY - (area.height - blockHeight) / 2
        return (0 ..< count).map { index in
            let row = index / columns
            let column = index % columns
            let inRow = min(columns, count - row * columns)
            let rowWidth = CGFloat(inRow) * width + CGFloat(inRow - 1) * gap
            let left = area.midX - rowWidth / 2
            let top = bottom - CGFloat(rows - row) * height - CGFloat(rows - row - 1) * gap
            return CallMontageSlot(
                frame: CGRect(x: left + CGFloat(column) * (width + gap), y: top, width: width, height: height),
                shape: .roundedRectangle,
                cornerRadius: bounds.width * 0.015
            )
        }
    }

    static func filmStrips(count: Int, canvas: CGSize) -> [CGRect] {
        let count = min(max(count, 0), maxParticipants)
        guard count > 0, canvas.width > 0, canvas.height > 0 else { return [] }
        let columns = filmColumns(count: count)
        let gap = canvas.width * 0.05
        let width = columns == 1 ? canvas.width * 0.62 : (canvas.width * 0.9 - gap) / 2
        let left = (canvas.width - CGFloat(columns) * width - CGFloat(columns - 1) * gap) / 2
        return (0 ..< columns).map { column in
            CGRect(x: left + CGFloat(column) * (width + gap), y: 0, width: width, height: canvas.height)
        }
    }

    static func film(count: Int, in bounds: CGRect) -> [CallMontageSlot] {
        let strips = filmStrips(count: count, canvas: bounds.size)
        guard let first = strips.first else { return [] }
        let columns = strips.count
        let rows = Int((Double(count) / Double(columns)).rounded(.up))
        let gap = bounds.height * 0.02
        let usable = bounds.height * 0.9
        let maxHeight = (usable - gap * CGFloat(rows - 1)) / CGFloat(rows)
        let height = min(first.width * 0.74 * filmFrameAspect, maxHeight)
        let width = height / filmFrameAspect
        let blockHeight = CGFloat(rows) * height + CGFloat(rows - 1) * gap
        let top = (bounds.height - blockHeight) / 2
        return (0 ..< count).map { index in
            let strip = strips[index / rows]
            let row = index % rows
            return CallMontageSlot(
                frame: CGRect(x: strip.midX - width / 2, y: top + CGFloat(row) * (height + gap), width: width, height: height),
                shape: .rectangle
            )
        }
    }

    static func neon(count: Int, in bounds: CGRect) -> [CallMontageSlot] {
        let gap = bounds.width * 0.07
        let area = CGRect(x: bounds.width * 0.08, y: bounds.height * 0.16, width: bounds.width * 0.84, height: bounds.height * 0.78)
        return cells(count: count, in: area, gap: gap)
            .map { CallMontageSlot(frame: $0, shape: .roundedRectangle, cornerRadius: bounds.width * 0.04) }
    }

    static func noir(count: Int, in bounds: CGRect) -> [CallMontageSlot] {
        let area = CGRect(x: bounds.width * 0.05, y: bounds.height * 0.04, width: bounds.width * 0.9, height: bounds.height * 0.84)
        return cells(count: count, in: area, gap: bounds.width * 0.015)
            .map { CallMontageSlot(frame: $0, shape: .rectangle) }
    }

    private static func filmColumns(count: Int) -> Int {
        count <= 5 ? 1 : 2
    }

    private static func medallionFrames(count: Int, in bounds: CGRect, margin: CGFloat, gap: CGFloat) -> [CGRect] {
        guard count > 0 else { return [] }
        let columns = min(count, 5)
        let rows = Int((Double(count) / Double(columns)).rounded(.up))
        let diameter = min(bounds.width * 0.2, (bounds.width - margin * 2 - gap * CGFloat(columns - 1)) / CGFloat(columns))
        let bottom = bounds.height * 0.96
        return (0 ..< count).map { index in
            let row = index / columns
            let column = index % columns
            let top = bottom - CGFloat(rows - row) * diameter - CGFloat(rows - row - 1) * gap
            return CGRect(x: bounds.width - margin - CGFloat(column + 1) * diameter - CGFloat(column) * gap, y: top, width: diameter, height: diameter)
        }
    }
}
