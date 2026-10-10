import CoreGraphics
import CoreText
import Foundation
import MeeshySDK

/// Une case et ce que sa personne écrit.
nonisolated struct CallFrameNameItem {
    let box: CallFrameSlotBox
    let person: CallFramePerson
    let lines: [String]
}

/// Les noms (§ 4.5) — `paintNames` du web : sous la case (`caption`, `ribbon`, `tag`), dans le pied d'une
/// carte, DANS la case sur un fond propre (`plate`, `badge`, `bubble`), ou en liste dans la réserve basse.
nonisolated extension CallFrameRenderer {
    static func blockHeight(_ lines: Int, _ px: CGFloat) -> CGFloat {
        lines <= 0 ? 0 : px * 1.2 + CGFloat(lines - 1) * px * 0.78 * 1.2
    }

    static func defaultFill(_ names: CallFrameNames) -> CGColor {
        if let fill = names.fill { return color(fill) }
        return perceived(names.color) > 0.5
            ? CGColor(red: 12 / 255, green: 12 / 255, blue: 16 / 255, alpha: 0.62)
            : CGColor(gray: 1, alpha: 0.88)
    }

    /// La taille de base d'un nom, bornée par la case : une grande tablée n'a pas de noms plus gros que ses visages.
    static func namePx(_ stage: CallFrameStage, _ box: CallFrameSlotBox) -> CGFloat {
        min(stage.unit * nameShare, min(box.rect.width, box.rect.height) * 0.1)
    }

    static func widestLine(_ lines: [String], _ px: CGFloat, _ names: CallFrameNames, fonts: CallFrameFontBook) -> CGFloat {
        lines.enumerated().map { index, line in fonts.width(line, names.font, index == 0 ? px : px * 0.78) }.max() ?? 0
    }

    /// Les lignes d'un nom, empilées et centrées sur (`cx`, `cy`), chacune ajustée à `maxWidth`.
    static func nameLines(_ context: CGContext, _ names: CallFrameNames, _ lines: [String], cx: CGFloat, cy: CGFloat, px: CGFloat, maxWidth: CGFloat, fonts: CallFrameFontBook) {
        let heights = lines.indices.map { ($0 == 0 ? px : px * 0.78) * 1.2 }
        let total = heights.reduce(0, +)
        lines.enumerated().forEach { index, line in
            let size = index == 0 ? px : px * 0.78
            let fitted = CallFrameText.fit(line, maxWidth: maxWidth, size: size) { fonts.width($0, names.font, $1) }
            let y = cy - total / 2 + heights.prefix(index).reduce(0, +) + heights[index] / 2
            let ink = index == 0 ? color(names.color) : tint(names.color, 0.82)
            inkText(context, fitted.text, x: cx, y: y, style: names.font, px: fitted.size, hex: names.color, ink: ink, effect: .none, fonts: fonts)
        }
    }

    /// La place libre sous une case : jusqu'à la première case qui la chevauche en largeur et descend plus bas
    /// qu'elle (zéro si elle mord déjà sur son bas), ou jusqu'aux textes de la réserve basse.
    static func roomBelow(_ stage: CallFrameStage, plan: CallFrameTextPlan, _ box: CallFrameSlotBox) -> CGFloat {
        let own = footprint(of: box)
        let bottom = own.maxY
        let floors = stage.boxes
            .filter { $0.index != box.index }
            .map { footprint(of: $0) }
            .filter { $0.minX < own.maxX && own.minX < $0.maxX && $0.maxY > bottom }
            .map { max(bottom, $0.minY) }
        let texts = [plan.title, plan.subtitle, plan.list, plan.brand]
            .compactMap { $0 }
            .filter { $0.minY >= stage.areas.bottom.minY - 1 }
            .map(\.minY)
        let ground = stage.areas.content.maxY + stage.areas.bottom.height * 0.4
        return ((floors + texts + [ground]).min() ?? ground) - bottom
    }

    static func paintNames(_ context: CGContext, stage: CallFrameStage, plan: CallFrameTextPlan, fonts: CallFrameFontBook) {
        let names = stage.look.names
        let slot = stage.look.slot
        guard names.show != .none else { return }
        if names.style == .list {
            paintList(context, stage: stage, plan: plan, fonts: fonts)
            return
        }
        let items = stage.boxes.compactMap { box -> CallFrameNameItem? in
            guard stage.people.indices.contains(box.index) else { return nil }
            let person = stage.people[box.index]
            let lines = CallFrameText.personLines(person, show: names.show)
            return lines.isEmpty ? nil : CallFrameNameItem(box: box, person: person, lines: lines)
        }
        let inFoot = names.style == .caption && (slot.card?.foot ?? 0) > 0.08
        let outside = !inFoot && (names.style == .caption || names.style == .ribbon || names.style == .tag)
        let roomy = outside && items.allSatisfy { item in
            roomBelow(stage, plan: plan, item.box) >= blockHeight(item.lines.count, namePx(stage, item.box)) * (names.style == .caption ? 1.35 : 1.9)
        }
        items.forEach { item in
            let px = namePx(stage, item.box)
            if inFoot, let card = slot.card {
                let photo = photoRect(item.box.rect, card: card)
                let footTop = photo.maxY
                let footHeight = item.box.rect.maxY - footTop
                inBox(context, item.box) {
                    nameLines(context, names, item.lines, cx: photo.midX, cy: footTop + footHeight / 2, px: min(px * 1.1, footHeight / (CGFloat(item.lines.count) + 0.6)), maxWidth: photo.width * 0.92, fonts: fonts)
                }
                return
            }
            if outside, roomy {
                paintBelow(context, stage: stage, item: item, px: px, fonts: fonts)
                return
            }
            if outside {
                paintPlate(context, stage: stage, item: item, px: px, scrim: names.fill == nil, fonts: fonts)
                return
            }
            switch names.style {
            case .plate: paintPlate(context, stage: stage, item: item, px: px, scrim: false, fonts: fonts)
            case .badge: paintBadge(context, stage: stage, item: item, px: px, fonts: fonts)
            default: paintBubble(context, stage: stage, item: item, px: px, fonts: fonts)
            }
        }
    }

    /// Le bord d'une case où poser un texte INTÉRIEUR : en bas, sauf si une case dessinée PAR-DESSUS
    /// (diagonal, cascade) en couvre le bas et pas le haut. Un nom ne se peint jamais sur le visage d'un autre.
    static func freeBandIsTop(_ stage: CallFrameStage, _ box: CallFrameSlotBox) -> Bool {
        let own = footprint(of: box)
        func band(_ top: Bool) -> CGRect {
            CGRect(x: own.minX, y: top ? own.minY : own.minY + own.height * 0.7, width: own.width, height: own.height * 0.3)
        }
        let above = stage.boxes.filter { $0.index > box.index }.map { footprint(of: $0) }
        func covered(_ top: Bool) -> Bool { above.contains { $0.intersects(band(top)) } }
        return covered(false) && !covered(true)
    }

    nonisolated enum BubbleCorner: CaseIterable {
        case topRight
        case topLeft
        case bottomLeft
    }

    /// Le coin d'une bulle : en haut à droite, sinon le premier coin qu'aucune case posée par-dessus ne couvre.
    static func freeCorner(_ stage: CallFrameStage, _ box: CallFrameSlotBox) -> BubbleCorner {
        let own = footprint(of: box)
        func area(_ corner: BubbleCorner) -> CGRect {
            CGRect(
                x: corner == .topRight ? own.minX + own.width * 0.5 : own.minX,
                y: corner == .bottomLeft ? own.minY + own.height * 0.7 : own.minY,
                width: own.width * 0.5,
                height: own.height * 0.3
            )
        }
        let above = stage.boxes.filter { $0.index > box.index }.map { footprint(of: $0) }
        return BubbleCorner.allCases.first { corner in !above.contains { $0.intersects(area(corner)) } } ?? .topRight
    }

    static func paintPlate(_ context: CGContext, stage: CallFrameStage, item: CallFrameNameItem, px: CGFloat, scrim: Bool, fonts: CallFrameFontBook) {
        let names = stage.look.names
        let slot = stage.look.slot
        let photo = photoRect(item.box.rect, card: slot.card)
        let inner = shapeInnerRect(item.box.shape, photo)
        let band = blockHeight(item.lines.count, px) + px * 0.7
        let atTop = freeBandIsTop(stage, item.box)
        let top = atTop ? inner.minY : inner.maxY - band
        let shade = perceived(names.color) > 0.5 ? CGColor(gray: 0, alpha: 0.62) : CGColor(gray: 1, alpha: 0.72)
        inBox(context, item.box) {
            context.saveGState()
            context.addPath(slotPath(for: item.box, in: photo, slot: slot))
            context.clip()
            if scrim {
                let from = atTop ? photo.minY : top - band * 0.6
                let to = atTop ? top + band * 1.6 : photo.maxY
                let clear = CGColor(gray: 0, alpha: 0)
                context.saveGState()
                context.clip(to: CGRect(x: photo.minX, y: from, width: photo.width, height: to - from))
                linear(context, colors: atTop ? [shade, clear] : [clear, shade], from: CGPoint(x: 0, y: from), to: CGPoint(x: 0, y: to))
                context.restoreGState()
            } else {
                context.setFillColor(defaultFill(names))
                if atTop {
                    context.fill(CGRect(x: photo.minX, y: photo.minY, width: photo.width, height: top + band - photo.minY))
                } else {
                    context.fill(CGRect(x: photo.minX, y: top, width: photo.width, height: photo.maxY - top))
                }
            }
            nameLines(context, names, item.lines, cx: inner.midX, cy: top + band / 2, px: px, maxWidth: inner.width * 0.9, fonts: fonts)
            context.restoreGState()
        }
    }

    static func paintBadge(_ context: CGContext, stage: CallFrameStage, item: CallFrameNameItem, px: CGFloat, fonts: CallFrameFontBook) {
        let names = stage.look.names
        let photo = photoRect(item.box.rect, card: stage.look.slot.card)
        let inner = shapeInnerRect(item.box.shape, photo)
        let small = px * 0.82
        let width = min(inner.width * 0.86, widestLine(item.lines, small, names, fonts: fonts) + small * 1.3)
        let height = blockHeight(item.lines.count, small) + small * 0.55
        let y = freeBandIsTop(stage, item.box) ? inner.minY + small * 0.5 : inner.maxY - height - small * 0.5
        let pill = CGRect(x: inner.minX + small * 0.5, y: y, width: width, height: height)
        inBox(context, item.box) {
            let path = CGMutablePath()
            path.addRoundedRect(pill, radius: min(height / 2, small))
            context.saveGState()
            context.setShadow(offset: .zero, blur: small * 0.4, color: CGColor(gray: 0, alpha: 0.25))
            fill(context, path, defaultFill(names))
            context.restoreGState()
            nameLines(context, names, item.lines, cx: pill.midX, cy: pill.midY, px: small, maxWidth: width - small, fonts: fonts)
        }
    }

    static func paintBubble(_ context: CGContext, stage: CallFrameStage, item: CallFrameNameItem, px: CGFloat, fonts: CallFrameFontBook) {
        let names = stage.look.names
        let photo = photoRect(item.box.rect, card: stage.look.slot.card)
        let inner = shapeInnerRect(item.box.shape, photo)
        let small = px * 0.85
        let width = min(inner.width * 0.72, widestLine(item.lines, small, names, fonts: fonts) + small * 1.6)
        let height = blockHeight(item.lines.count, small) + small * 0.9
        let corner = freeCorner(stage, item.box)
        let x = corner == .topRight ? inner.maxX - width - small * 0.4 : inner.minX + small * 0.4
        let y = corner == .bottomLeft ? inner.maxY - height - small * 1.2 : inner.minY + small * 0.4
        let fillHex = names.fill ?? "#FFFFFF"
        let lineWidth = max(1, small * 0.08)
        inBox(context, item.box) {
            let body = CGMutablePath()
            body.addRoundedRect(CGRect(x: x, y: y, width: width, height: height), radius: height * 0.45)
            let shape = CGMutablePath()
            shape.addPath(body)
            shape.move(to: CGPoint(x: x + width * 0.3, y: y + height - 1))
            shape.addLine(to: CGPoint(x: x + width * 0.14, y: y + height + small * 0.7))
            shape.addLine(to: CGPoint(x: x + width * 0.46, y: y + height - 1))
            context.saveGState()
            context.setShadow(offset: .zero, blur: small * 0.35, color: CGColor(gray: 0, alpha: 0.22))
            fill(context, shape, color(fillHex))
            context.restoreGState()
            stroke(context, shape, mix(fillHex, "#000000", 0.55), width: lineWidth)
            context.setFillColor(color(fillHex))
            context.fill(CGRect(x: x + width * 0.3 + lineWidth, y: y + height - lineWidth * 1.5, width: width * 0.16 - lineWidth * 2, height: lineWidth * 2))
            nameLines(context, names, item.lines, cx: x + width / 2, cy: y + height / 2, px: small, maxWidth: width - small, fonts: fonts)
        }
    }

    /// Sous la case : la légende, la banderole à bouts pliés, l'étiquette manuscrite inclinée.
    static func paintBelow(_ context: CGContext, stage: CallFrameStage, item: CallFrameNameItem, px: CGFloat, fonts: CallFrameFontBook) {
        let names = stage.look.names
        let own = footprint(of: item.box)
        let cx = own.midX
        let height = blockHeight(item.lines.count, px)
        let textWidth = widestLine(item.lines, px, names, fonts: fonts)
        switch names.style {
        case .caption:
            nameLines(context, names, item.lines, cx: cx, cy: own.maxY + px * 0.3 + height / 2, px: px, maxWidth: max(own.width, stage.unit * 0.3), fonts: fonts)
        case .ribbon:
            let fillInk = defaultFill(names)
            let bandHeight = height + px * 0.55
            let width = min(own.width * 0.96, textWidth + px * 2.2)
            let top = own.maxY + px * 0.3
            let left = cx - width / 2
            let tail = bandHeight * 0.55
            let tails = CGMutablePath()
            ([-1, 1] as [CGFloat]).forEach { side in
                let edge = side < 0 ? left + tail * 0.5 : left + width - tail * 0.5
                let outer = edge + side * tail
                tails.addPath(polygon([
                    CGPoint(x: edge, y: top + bandHeight * 0.22), CGPoint(x: outer, y: top + bandHeight * 0.22),
                    CGPoint(x: outer - side * tail * 0.4, y: top + bandHeight * 0.72), CGPoint(x: outer, y: top + bandHeight * 1.22),
                    CGPoint(x: edge, y: top + bandHeight * 1.22),
                ]))
            }
            fill(context, tails, mixColors(fillInk, blackInk, 0.3))
            context.setFillColor(fillInk)
            context.fill(CGRect(x: left, y: top, width: width, height: bandHeight))
            nameLines(context, names, item.lines, cx: cx, cy: top + bandHeight / 2, px: px, maxWidth: width - px, fonts: fonts)
        default:
            let width = min(own.width * 0.9, textWidth + px * 2)
            let tagHeight = height + px * 0.6
            let top = own.maxY + px * 0.25
            context.saveGState()
            context.translateBy(x: cx, y: top + tagHeight / 2)
            context.rotate(by: -0.07)
            let label = polygon([
                CGPoint(x: -width / 2 + tagHeight * 0.35, y: -tagHeight / 2), CGPoint(x: width / 2, y: -tagHeight / 2),
                CGPoint(x: width / 2, y: tagHeight / 2), CGPoint(x: -width / 2 + tagHeight * 0.35, y: tagHeight / 2),
                CGPoint(x: -width / 2, y: 0),
            ])
            context.saveGState()
            context.setShadow(offset: CGSize(width: 0, height: -px * 0.08), blur: px * 0.3, color: CGColor(gray: 0, alpha: 0.25))
            fill(context, label, color(names.fill ?? "#FFF6E0"))
            context.restoreGState()
            let hole = CGMutablePath()
            hole.addCircle(-width / 2 + tagHeight * 0.3, 0, tagHeight * 0.09)
            fill(context, hole, CGColor(gray: 0, alpha: 0.25))
            nameLines(context, names, item.lines, cx: tagHeight * 0.18, cy: 0, px: px, maxWidth: width - tagHeight * 0.6, fonts: fonts)
            context.restoreGState()
        }
    }

    static func paintList(_ context: CGContext, stage: CallFrameStage, plan: CallFrameTextPlan, fonts: CallFrameFontBook) {
        guard let row = plan.list else { return }
        let names = stage.look.names
        let entries = stage.people.map { CallFrameText.listEntry($0, show: names.show) }.filter { !$0.isEmpty }
        guard !entries.isEmpty else { return }
        let px = stage.unit * listShare * max(plan.bottomScale, minRowScale)
        let separator = "  \u{00B7}  "
        let single = entries.joined(separator: separator)
        let width = row.width * 0.94
        let half = (entries.count + 1) / 2
        let lines = fonts.width(single, names.font, px) <= width || entries.count < 2
            ? [single]
            : [entries.prefix(half).joined(separator: separator), entries.dropFirst(half).joined(separator: separator)]
        let lineHeight = row.height / CGFloat(lines.count)
        lines.enumerated().forEach { index, line in
            let fitted = CallFrameText.fit(line, maxWidth: width, size: px) { fonts.width($0, names.font, $1) }
            inkText(context, fitted.text, x: row.midX, y: row.minY + lineHeight * (CGFloat(index) + 0.5), style: names.font, px: fitted.size, hex: names.color, effect: .none, fonts: fonts)
        }
    }
}
