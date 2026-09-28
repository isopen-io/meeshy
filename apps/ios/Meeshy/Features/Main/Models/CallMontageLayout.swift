import CoreGraphics
import Foundation

nonisolated enum CallMontageStyle: String, CaseIterable, Sendable {
    case screen
    case cover
    case gold
    case redcarpet
    case grid
    case strip
    case polaroid
    case magazine
    case film
    case neon
    case noir
    case comic
    case heart
}

nonisolated enum CallMontageShape: Equatable, Sendable {
    case rectangle
    case roundedRectangle
    case circle
    case heart
}

nonisolated struct CallMontageSlot: Equatable, Sendable {
    let frame: CGRect
    let shape: CallMontageShape
    let cornerRadius: CGFloat
    let rotation: CGFloat

    init(frame: CGRect, shape: CallMontageShape, cornerRadius: CGFloat = 0, rotation: CGFloat = 0) {
        self.frame = frame
        self.shape = shape
        self.cornerRadius = cornerRadius
        self.rotation = rotation
    }
}

nonisolated enum CallMontageLayout {
    static let captureSize = CGSize(width: 1080, height: 1920)
    static let faceSide = 1080
    static let maxParticipants = 12

    static func frames(style: CallMontageStyle, count: Int, canvas: CGSize) -> [CallMontageSlot] {
        let count = min(max(count, 0), maxParticipants)
        guard count > 0, canvas.width > 0, canvas.height > 0 else { return [] }
        let bounds = CGRect(origin: .zero, size: canvas)
        switch style {
        case .screen: return screen(count: count, in: bounds)
        case .cover: return cover(count: count, in: bounds)
        case .gold: return gold(count: count, in: bounds)
        case .redcarpet: return redCarpet(count: count, in: bounds)
        case .film: return film(count: count, in: bounds)
        case .neon: return neon(count: count, in: bounds)
        case .noir: return noir(count: count, in: bounds)
        case .grid: return mosaic(count: count, in: bounds)
        case .strip: return strip(count: count, in: bounds)
        case .polaroid: return polaroid(count: count, in: bounds)
        case .magazine: return magazine(count: count, in: bounds)
        case .comic: return comic(count: count, in: bounds)
        case .heart: return heart(count: count, in: bounds)
        }
    }

    static func gridDimensions(count: Int) -> (columns: Int, rows: Int) {
        switch count {
        case ...1: return (1, 1)
        case 2: return (1, 2)
        case 3: return (1, 3)
        case 4: return (2, 2)
        case 5...6: return (2, 3)
        case 7...9: return (3, 3)
        default: return (3, Int((Double(count) / 3).rounded(.up)))
        }
    }

    static func cells(count: Int, in rect: CGRect, gap: CGFloat) -> [CGRect] {
        guard count > 0 else { return [] }
        let (columns, rows) = gridDimensions(count: count)
        let width = (rect.width - gap * CGFloat(columns - 1)) / CGFloat(columns)
        let height = (rect.height - gap * CGFloat(rows - 1)) / CGFloat(rows)
        return (0 ..< count).map { index in
            let row = index / columns
            let column = index % columns
            let inRow = min(columns, count - row * columns)
            let rowWidth = CGFloat(inRow) * width + CGFloat(inRow - 1) * gap
            let offset = (rect.width - rowWidth) / 2
            return CGRect(
                x: rect.minX + offset + CGFloat(column) * (width + gap),
                y: rect.minY + CGFloat(row) * (height + gap),
                width: width,
                height: height
            )
        }
    }

    static func captionBand(style: CallMontageStyle, canvas: CGSize) -> CGRect? {
        switch style {
        case .strip: return CGRect(x: 0, y: canvas.height * 0.86, width: canvas.width, height: canvas.height * 0.14)
        case .magazine: return CGRect(x: 0, y: canvas.height * 0.03, width: canvas.width, height: canvas.height * 0.13)
        case .heart: return CGRect(x: 0, y: canvas.height * 0.9, width: canvas.width, height: canvas.height * 0.08)
        case .cover, .gold, .redcarpet, .film, .neon, .noir: return glamourCaptionBand(style: style, canvas: canvas)
        case .screen, .grid, .polaroid, .comic: return nil
        }
    }

    static func polaroidCard(around photo: CGRect) -> CGRect {
        let border = photo.width * polaroidBorder
        return CGRect(
            x: photo.minX - border,
            y: photo.minY - border,
            width: photo.width + border * 2,
            height: photo.height + border + photo.width * polaroidFooter
        )
    }

    static func polaroidTilt(at index: Int, count: Int) -> CGFloat {
        guard count > 1 else { return -3 }
        let tilts: [CGFloat] = [-6, 5, -4, 7, -3, 6]
        return tilts[index % tilts.count]
    }

    private static let polaroidBorder: CGFloat = 0.068
    private static let polaroidFooter: CGFloat = 0.24

    private static func screen(count: Int, in bounds: CGRect) -> [CallMontageSlot] {
        switch count {
        case 1:
            return [CallMontageSlot(frame: bounds, shape: .rectangle)]
        case 2:
            let width = bounds.width * 0.28
            let height = width * 16 / 9
            let margin = bounds.width * 0.04
            let pip = CGRect(x: bounds.maxX - margin - width, y: bounds.maxY - bounds.height * 0.1 - height, width: width, height: height)
            return [
                CallMontageSlot(frame: bounds, shape: .rectangle),
                CallMontageSlot(frame: pip, shape: .roundedRectangle, cornerRadius: bounds.width * 0.035)
            ]
        default:
            return cells(count: count, in: bounds, gap: bounds.width * 0.006)
                .map { CallMontageSlot(frame: $0, shape: .rectangle) }
        }
    }

    private static func mosaic(count: Int, in bounds: CGRect) -> [CallMontageSlot] {
        let gap = bounds.width * 0.02
        return cells(count: count, in: bounds.insetBy(dx: gap, dy: gap), gap: gap)
            .map { CallMontageSlot(frame: $0, shape: .roundedRectangle, cornerRadius: bounds.width * 0.03) }
    }

    private static func strip(count: Int, in bounds: CGRect) -> [CallMontageSlot] {
        let area = CGRect(
            x: bounds.width * 0.1,
            y: bounds.height * 0.06,
            width: bounds.width * 0.8,
            height: bounds.height * 0.78
        )
        let columns = count <= 4 ? 1 : 2
        let rows = Int((Double(count) / Double(columns)).rounded(.up))
        let gap = bounds.height * 0.018
        let columnWidth = (area.width - gap * CGFloat(columns - 1)) / CGFloat(columns)
        let rowHeight = (area.height - gap * CGFloat(rows - 1)) / CGFloat(rows)
        let width = min(columnWidth, rowHeight / 0.75)
        let height = width * 0.75
        let blockHeight = CGFloat(rows) * height + CGFloat(rows - 1) * gap
        let top = area.minY + (area.height - blockHeight) / 2
        return (0 ..< count).map { index in
            let row = index / columns
            let column = index % columns
            let inRow = min(columns, count - row * columns)
            let rowWidth = CGFloat(inRow) * width + CGFloat(inRow - 1) * gap
            let left = area.minX + (area.width - rowWidth) / 2
            let frame = CGRect(x: left + CGFloat(column) * (width + gap), y: top + CGFloat(row) * (height + gap), width: width, height: height)
            return CallMontageSlot(frame: frame, shape: .rectangle)
        }
    }

    private static func polaroid(count: Int, in bounds: CGRect) -> [CallMontageSlot] {
        let inset = bounds.width * 0.08
        let cellRects = cells(count: count, in: bounds.insetBy(dx: inset, dy: inset), gap: bounds.width * 0.05)
        let cardWidthRatio = 1 + polaroidBorder * 2
        let cardHeightRatio = 1 + polaroidBorder + polaroidFooter
        return cellRects.enumerated().map { index, cell in
            let side = min(cell.width / cardWidthRatio, cell.height / cardHeightRatio) * 0.9
            let cardWidth = side * cardWidthRatio
            let cardHeight = side * cardHeightRatio
            let border = side * polaroidBorder
            let photo = CGRect(
                x: cell.midX - cardWidth / 2 + border,
                y: cell.midY - cardHeight / 2 + border,
                width: side,
                height: side
            )
            return CallMontageSlot(frame: photo, shape: .rectangle, rotation: polaroidTilt(at: index, count: count))
        }
    }

    private static func magazine(count: Int, in bounds: CGRect) -> [CallMontageSlot] {
        let cover = CallMontageSlot(frame: bounds, shape: .rectangle)
        let insets = count - 1
        guard insets > 0 else { return [cover] }
        let margin = bounds.width * 0.06
        let gap = bounds.width * 0.03
        let diameter = min(bounds.width * 0.26, (bounds.width - margin * 2 - gap * CGFloat(insets - 1)) / CGFloat(insets))
        let top = bounds.maxY - bounds.height * 0.05 - diameter
        let circles = (0 ..< insets).map { index in
            CallMontageSlot(
                frame: CGRect(x: margin + CGFloat(index) * (diameter + gap), y: top, width: diameter, height: diameter),
                shape: .circle
            )
        }
        return [cover] + circles
    }

    private static func comic(count: Int, in bounds: CGRect) -> [CallMontageSlot] {
        let gutter = bounds.width * 0.035
        let area = bounds.insetBy(dx: gutter, dy: gutter)
        guard count == 3 else {
            return cells(count: count, in: area, gap: gutter).map { CallMontageSlot(frame: $0, shape: .rectangle) }
        }
        let topHeight = (area.height - gutter) * 0.5
        let bottomWidth = (area.width - gutter) / 2
        let bottomY = area.minY + topHeight + gutter
        let bottomHeight = area.maxY - bottomY
        return [
            CGRect(x: area.minX, y: area.minY, width: area.width, height: topHeight),
            CGRect(x: area.minX, y: bottomY, width: bottomWidth, height: bottomHeight),
            CGRect(x: area.minX + bottomWidth + gutter, y: bottomY, width: bottomWidth, height: bottomHeight)
        ].map { CallMontageSlot(frame: $0, shape: .rectangle) }
    }

    private static func heart(count: Int, in bounds: CGRect) -> [CallMontageSlot] {
        guard count > 1 else {
            let side = bounds.width * 0.86
            let frame = CGRect(x: bounds.midX - side / 2, y: bounds.midY - side / 2 - bounds.height * 0.03, width: side, height: side)
            return [CallMontageSlot(frame: frame, shape: .heart)]
        }
        let inset = bounds.width * 0.06
        let area = CGRect(x: inset, y: bounds.height * 0.06, width: bounds.width - inset * 2, height: bounds.height * 0.82)
        return cells(count: count, in: area, gap: bounds.width * 0.04).map { cell in
            let side = min(cell.width, cell.height) * 0.95
            return CallMontageSlot(
                frame: CGRect(x: cell.midX - side / 2, y: cell.midY - side / 2, width: side, height: side),
                shape: .heart
            )
        }
    }
}

nonisolated enum CallFaceCrop {
    static func pixelRect(fromNormalized box: CGRect, imageSize: CGSize) -> CGRect {
        CGRect(
            x: box.minX * imageSize.width,
            y: (1 - box.maxY) * imageSize.height,
            width: box.width * imageSize.width,
            height: box.height * imageSize.height
        )
    }

    static func square(around face: CGRect?, in imageSize: CGSize, margin: CGFloat) -> CGRect {
        let maxSide = min(imageSize.width, imageSize.height)
        guard maxSide > 0 else { return .zero }
        guard let face, face.width > 0, face.height > 0 else {
            return CGRect(x: (imageSize.width - maxSide) / 2, y: (imageSize.height - maxSide) / 2, width: maxSide, height: maxSide)
        }
        let side = min(max(face.width, face.height) * (1 + margin * 2), maxSide)
        let centerX = face.midX
        let centerY = face.midY - face.height * 0.08
        let x = min(max(centerX - side / 2, 0), imageSize.width - side)
        let y = min(max(centerY - side / 2, 0), imageSize.height - side)
        return CGRect(x: x, y: y, width: side, height: side)
    }
}
