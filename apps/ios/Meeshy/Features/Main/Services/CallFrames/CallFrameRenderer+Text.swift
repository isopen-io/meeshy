import CoreGraphics
import CoreText
import Foundation
import MeeshySDK
import MeeshyUI
import UIKit

nonisolated enum CallFrameTextAlign {
    case left
    case center
    case right
}

nonisolated enum CallFrameTextVertical {
    case middle
    case baseline
}

/// Les polices d'un rendu, résolues une fois chacune : les dix-huit `StoryTextStyle` (Imager),
/// et l'arrondie (SF Rounded) pour la signature quand le cadre n'en nomme pas.
nonisolated final class CallFrameFontBook {
    private var cache: [String: CTFont] = [:]

    func font(_ style: StoryTextStyle?, size: CGFloat, weight: UIFont.Weight? = nil) -> CTFont {
        let px = max(1, (size * 10).rounded() / 10)
        let key = "\(style?.rawValue ?? "_")|\(weight.map { "\($0.rawValue)" } ?? "")|\(px)"
        if let hit = cache[key] { return hit }
        let resolved = Self.resolve(style, size: px, weight: weight)
        cache[key] = resolved
        return resolved
    }

    /// `nil` ⇒ la police de la marque : SF Rounded semi-grasse. `bold`/`neon` n'ont pas de nom PostScript
    /// (`StoryTextStyle.fontName == nil`) : la pile système, lourde pour l'une, arrondie pour l'autre.
    static func resolve(_ style: StoryTextStyle?, size: CGFloat, weight: UIFont.Weight? = nil) -> CTFont {
        let px = max(1, size)
        switch style {
        case .none, .some(.neon):
            return rounded(px, weight: weight ?? .semibold)
        case .some(.bold):
            return UIFont.systemFont(ofSize: px, weight: weight ?? .heavy) as CTFont
        case let .some(style):
            let bold = weight.map { $0.rawValue >= UIFont.Weight.bold.rawValue } ?? false
            let name = bold && style == .typewriter ? "Courier-Bold" : style.fontName
            if let name, let font = UIFont(name: name, size: px) { return font as CTFont }
            return UIFont.systemFont(ofSize: px, weight: .bold) as CTFont
        }
    }

    static func rounded(_ size: CGFloat, weight: UIFont.Weight) -> CTFont {
        let base = UIFont.systemFont(ofSize: size, weight: weight)
        guard let descriptor = base.fontDescriptor.withDesign(.rounded) else { return base as CTFont }
        return UIFont(descriptor: descriptor, size: size) as CTFont
    }

    func width(_ text: String, _ style: StoryTextStyle?, _ size: CGFloat) -> CGFloat {
        guard !text.isEmpty, size > 0 else { return 0 }
        return CallFrameRenderer.measure(text, font: font(style, size: size))
    }
}

/// Où va chaque texte d'un cadre (`TextPlan` du web).
nonisolated struct CallFrameTextPlan {
    let brand: CGRect?
    let brandScale: CGFloat
    let title: CGRect?
    let subtitle: CGRect?
    let list: CGRect?
    let topScale: CGFloat
    let bottomScale: CGFloat
}

/// L'encombrement de la signature : le mot, le logo à la hauteur de ses traits, les deux côte à côte.
nonisolated struct CallFrameBrandBox {
    let width: CGFloat
    let height: CGFloat
    let px: CGFloat
    let logoHeight: CGFloat
}

/// Un titre ajusté à sa rangée — ce que `paintTitles` écrit et ce que les ornements évitent.
nonisolated struct CallFrameFittedTitle {
    let text: String
    let size: CGFloat
    let row: CGRect
    let title: CallFrameTitle
}

/// Ce que les textes des réserves occupent : le plan, l'encombrement de chaque texte, et celui du titre
/// (que le ruban habille) — `TextLayout` du web.
nonisolated struct CallFrameTextLayout {
    let plan: CallFrameTextPlan
    let boxes: [CGRect]
    let headline: CGRect?
}

/// La signature, les noms, le titre et le sous-titre (§ 4.5, § 5.2) — le port de `frame-paint-text.ts`.
/// Un texte ne couvre jamais un visage : il vit dans les réserves, sous la case, ou — `plate`, `badge`,
/// `bubble` seulement — DANS la case, sur son propre fond.
nonisolated extension CallFrameRenderer {
    static func titleShare(_ size: CallFrameTextSize) -> CGFloat {
        switch size {
        case .s: return 0.042
        case .m: return 0.06
        case .l: return 0.085
        }
    }

    static func brandShare(_ size: CallFrameTextSize) -> CGFloat {
        switch size {
        case .s: return 0.03
        case .m: return 0.042
        case .l: return 0.058
        }
    }

    static let listShare: CGFloat = 0.03
    static let nameShare: CGFloat = 0.034
    static let lineFactor: CGFloat = 1.3
    static let minRowScale: CGFloat = 0.45
    /// L'épaisseur des traits du logo dans les cadres, dans le repère 1024 (celle du web).
    static let glyphDashWidth: CGFloat = 88

    static var glyphBounds: CGRect {
        let dashes = MeeshyBrandMark.referenceDashes
        let left = (dashes.map(\.start.x).min() ?? 262) - glyphDashWidth / 2
        let right = (dashes.map(\.end.x).max() ?? 762) + glyphDashWidth / 2
        let top = (dashes.map(\.start.y).min() ?? 384) - glyphDashWidth / 2
        let bottom = (dashes.map(\.start.y).max() ?? 640) + glyphDashWidth / 2
        return CGRect(x: left, y: top, width: right - left, height: bottom - top)
    }

    static var glyphAspect: CGFloat { glyphBounds.width / glyphBounds.height }

    // MARK: - Tracer une ligne

    static func line(_ text: String, font: CTFont, color: CGColor, stroke: (color: CGColor, percent: CGFloat)? = nil) -> CTLine {
        var attributes: [NSAttributedString.Key: Any] = [
            NSAttributedString.Key(kCTFontAttributeName as String): font,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
        ]
        if let stroke {
            attributes[NSAttributedString.Key(kCTStrokeColorAttributeName as String)] = stroke.color
            attributes[NSAttributedString.Key(kCTStrokeWidthAttributeName as String)] = NSNumber(value: Double(stroke.percent))
        }
        return CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes))
    }

    static func measure(_ text: String, font: CTFont) -> CGFloat {
        CGFloat(CTLineGetTypographicBounds(line(text, font: font, color: CGColor(gray: 1, alpha: 1)), nil, nil, nil))
    }

    /// Un texte aligné sur `x`, sa ligne médiane (`middle`) ou sa ligne de base sur `y`.
    static func drawText(_ context: CGContext, _ text: String, font: CTFont, color: CGColor, x: CGFloat, y: CGFloat, align: CallFrameTextAlign, vertical: CallFrameTextVertical, stroke: (color: CGColor, percent: CGFloat)? = nil) {
        guard !text.isEmpty else { return }
        let drawn = line(text, font: font, color: color, stroke: stroke)
        let width = CGFloat(CTLineGetTypographicBounds(drawn, nil, nil, nil))
        let left: CGFloat
        switch align {
        case .left: left = x
        case .center: left = x - width / 2
        case .right: left = x - width
        }
        let baseline = vertical == .middle ? y + (CTFontGetAscent(font) - CTFontGetDescent(font)) / 2 : y
        context.saveGState()
        context.textMatrix = CGAffineTransform(scaleX: 1, y: -1)
        context.textPosition = CGPoint(x: left, y: baseline)
        CTLineDraw(drawn, context)
        context.restoreGState()
    }

    /// `inkText` du web : le texte avec son effet (ombre, halo, contour).
    static func inkText(_ context: CGContext, _ text: String, x: CGFloat, y: CGFloat, style: StoryTextStyle?, px: CGFloat, hex: String, ink: CGColor? = nil, effect: CallFrameTextEffect, align: CallFrameTextAlign = .center, fonts: CallFrameFontBook) {
        guard !text.isEmpty, px >= 1 else { return }
        let font = fonts.font(style, size: px)
        let fill = ink ?? color(hex)
        let dark = perceived(hex) < 0.45
        context.saveGState()
        switch effect {
        case .shadow:
            context.setShadow(offset: CGSize(width: 0, height: -px * 0.05), blur: px * 0.14, color: dark ? CGColor(gray: 1, alpha: 0.35) : CGColor(gray: 0, alpha: 0.45))
        case .glow:
            context.setShadow(offset: .zero, blur: px * 0.4, color: tint(hex, 0.85))
            drawText(context, text, font: font, color: fill, x: x, y: y, align: align, vertical: .middle)
            context.setShadow(offset: .zero, blur: px * 0.15, color: tint(hex, 0.85))
        case .outline:
            let outline = dark ? CGColor(gray: 1, alpha: 0.9) : CGColor(gray: 0, alpha: 0.75)
            let width = max(1, px * 0.09)
            drawText(context, text, font: font, color: fill, x: x, y: y, align: align, vertical: .middle, stroke: (outline, width / px * 100))
        case .none:
            break
        }
        drawText(context, text, font: font, color: fill, x: x, y: y, align: align, vertical: .middle)
        context.restoreGState()
    }

    // MARK: - La signature

    static func brandBox(_ brand: CallFrameBrand, unit: CGFloat, fonts: CallFrameFontBook) -> CallFrameBrandBox {
        let px = unit * brandShare(brand.size)
        let logoHeight = brand.mark == .logo ? px * 0.95 : px * 0.62
        let logoWidth = logoHeight * glyphAspect
        let word = fonts.width(CallFrameText.brandWord, brand.font, px)
        let width: CGFloat
        switch brand.mark {
        case .logo: width = logoWidth
        case .wordmark: width = word
        case .both: width = logoWidth + px * 0.32 + word
        }
        return CallFrameBrandBox(width: width, height: max(px, logoHeight) * 1.15, px: px, logoHeight: logoHeight)
    }

    /// Les trois traits de la marque, leur tracé visible calé sur (`x`, `y`) coin haut-gauche, `height` de haut.
    static func paintLogo(_ context: CGContext, x: CGFloat, y: CGFloat, height: CGFloat, ink: CGColor, alpha: CGFloat = 1) {
        let glyph = glyphBounds
        let scale = height / glyph.height
        let originX = x - glyph.minX * scale
        let originY = y - glyph.minY * scale
        context.saveGState()
        context.setStrokeColor(ink)
        context.setLineCap(.round)
        context.setLineWidth(glyphDashWidth * scale)
        MeeshyBrandMark.referenceDashes.forEach { dash in
            context.setAlpha(alpha * CGFloat(dash.opacity))
            context.move(to: CGPoint(x: originX + dash.start.x * scale, y: originY + dash.start.y * scale))
            context.addLine(to: CGPoint(x: originX + dash.end.x * scale, y: originY + dash.end.y * scale))
            context.strokePath()
        }
        context.restoreGState()
    }

    static func paintBrandAt(_ context: CGContext, brand: CallFrameBrand, box: CallFrameBrandBox, cx: CGFloat, cy: CGFloat, scale: CGFloat, alpha: CGFloat = 1, fonts: CallFrameFontBook) {
        let px = box.px * scale
        let logoHeight = box.logoHeight * scale
        let left = cx - box.width * scale / 2
        context.saveGState()
        context.setAlpha(alpha)
        context.setShadow(offset: .zero, blur: px * 0.12, color: perceived(brand.color) > 0.5 ? CGColor(gray: 0, alpha: 0.28) : CGColor(gray: 1, alpha: 0.22))
        if brand.mark != .wordmark {
            paintLogo(context, x: left, y: cy - logoHeight / 2, height: logoHeight, ink: color(brand.color), alpha: alpha)
        }
        if brand.mark != .logo {
            let x = brand.mark == .both ? left + logoHeight * glyphAspect + px * 0.32 : left
            inkText(context, CallFrameText.brandWord, x: x, y: cy - px * 0.04, style: brand.font, px: px, hex: brand.color, effect: .none, align: .left, fonts: fonts)
        }
        context.restoreGState()
    }

    /// Le cadre où la signature se peint — `nil` pour le filigrane, qui couvre toute la toile, et pour un
    /// cadre qui ne déclare pas de signature (facultative depuis #9197).
    static func brandFrame(_ stage: CallFrameStage, plan: CallFrameTextPlan, box: CallFrameBrandBox) -> CGRect? {
        guard let brand = stage.look.brand else { return nil }
        let areas = stage.areas
        switch brand.place {
        case .watermark:
            return nil
        case .top, .bottom:
            let row = plan.brand ?? (brand.place == .top
                ? CGRect(x: areas.top.minX, y: areas.top.minY, width: areas.top.width, height: box.height)
                : CGRect(x: areas.bottom.minX, y: areas.bottom.maxY - box.height, width: areas.bottom.width, height: box.height))
            let width = box.width * plan.brandScale
            let height = box.height * plan.brandScale
            return CGRect(x: row.midX - width / 2, y: row.midY - height / 2, width: width, height: height)
        case .topLeft, .topRight, .bottomLeft, .bottomRight:
            return cornerBrandRect(stage, box: box)
        }
    }

    /// Le rectangle d'une signature posée dans un coin de l'intérieur — `nil` hors des quatre coins.
    static func cornerBrandRect(_ stage: CallFrameStage, box: CallFrameBrandBox) -> CGRect? {
        guard let place = stage.look.brand?.place,
              place == .topLeft || place == .topRight || place == .bottomLeft || place == .bottomRight else { return nil }
        let pad = stage.unit * 0.035
        let inner = stage.areas.inner
        let x = place == .topLeft || place == .bottomLeft ? inner.minX + pad : inner.maxX - pad - box.width
        let y = place == .topLeft || place == .topRight ? inner.minY + pad : inner.maxY - pad - box.height
        return CGRect(x: x, y: y, width: box.width, height: box.height)
    }

    /// Où la signature d'un cadre se peint, pour `people` personnes à `size` — la sonde des témoins.
    static func brandFrame(frame: CallFrameDesign, people: [CallFramePerson], texts: CallFrameTexts, size: CGSize) -> CGRect? {
        let stage = CallFrameStage(frame: frame, people: people, texts: texts, size: size)
        let fonts = CallFrameFontBook()
        guard let brand = stage.look.brand else { return nil }
        let plan = planText(stage, fonts: fonts)
        return brandFrame(stage, plan: plan, box: brandBox(brand, unit: stage.unit, fonts: fonts))
    }

    static func paintBrand(_ context: CGContext, stage: CallFrameStage, plan: CallFrameTextPlan, fonts: CallFrameFontBook) {
        guard let brand = stage.look.brand else { return }
        let box = brandBox(brand, unit: stage.unit, fonts: fonts)
        guard let frame = brandFrame(stage, plan: plan, box: box) else {
            paintWatermark(context, brand: brand, box: box, size: stage.size, fonts: fonts)
            return
        }
        let scale = brand.place == .top || brand.place == .bottom ? plan.brandScale : 1
        paintBrandAt(context, brand: brand, box: box, cx: frame.midX, cy: frame.midY, scale: scale, fonts: fonts)
    }

    /// Le filigrane : la signature répétée en diagonale, très discrète, par-dessus l'ensemble.
    static func paintWatermark(_ context: CGContext, brand: CallFrameBrand, box: CallFrameBrandBox, size: CGSize, fonts: CallFrameFontBook) {
        let reach = hypot(size.width, size.height)
        let stepX = max(1, box.width * 2.2)
        let stepY = max(1, box.height * 3.2)
        context.saveGState()
        context.translateBy(x: size.width / 2, y: size.height / 2)
        context.rotate(by: -.pi / 7)
        (0 ... Int((reach / stepY).rounded(.up))).forEach { row in
            let y = -reach / 2 + CGFloat(row) * stepY
            let offset = row % 2 == 0 ? 0 : stepX / 2
            (0 ..< Int((reach / stepX).rounded(.up)) + 2).forEach { col in
                paintBrandAt(context, brand: brand, box: box, cx: -reach / 2 + offset + CGFloat(col) * stepX, cy: y, scale: 1, alpha: 0.12, fonts: fonts)
            }
        }
        context.restoreGState()
    }

    // MARK: - Où va chaque texte

    private nonisolated enum RowKey {
        case brand
        case title
        case subtitle
        case list
    }

    static func titleShown(_ title: CallFrameTitle?) -> Bool {
        guard let title else { return false }
        return title.source != .none
    }

    /// **OÙ VA CHAQUE TEXTE** — `planText` du web. En haut : la signature (`top`), le titre, le sous-titre.
    /// En bas : le titre, le sous-titre, la liste des noms, la signature (`bottom`). Une réserve trop courte
    /// réduit son bloc ; sous 45 %, un titre se tait plutôt que de couvrir un visage — la signature, elle,
    /// ne se tait jamais (70 % au moins).
    static func planText(_ stage: CallFrameStage, fonts: CallFrameFontBook) -> CallFrameTextPlan {
        let look = stage.look
        let unit = stage.unit
        let box = look.brand.map { brandBox($0, unit: unit, fonts: fonts) }
        let brandPlace = look.brand?.place
        func titleHeight(_ title: CallFrameTitle) -> CGFloat { unit * titleShare(title.size) * lineFactor }
        let listLines: CGFloat = look.names.show == .both || stage.people.count >= 5 ? 2 : 1
        let listed = look.names.style == .list && look.names.show != .none
        func place(_ top: Bool) -> (rects: [(RowKey, CGRect)], scale: CGFloat, brandScale: CGFloat) {
            var rows: [(key: RowKey, height: CGFloat)] = []
            if top, brandPlace == .top, let box { rows.append((key: .brand, height: box.height * 1.25)) }
            if !top, titleShown(look.title), look.title.place == .bottom { rows.append((key: .title, height: titleHeight(look.title))) }
            if top, titleShown(look.title), look.title.place == .top { rows.append((key: .title, height: titleHeight(look.title))) }
            if let subtitle = look.subtitle, titleShown(subtitle), subtitle.place == (top ? CallFrameTitlePlace.top : CallFrameTitlePlace.bottom) { rows.append((key: .subtitle, height: titleHeight(subtitle))) }
            if !top, listed { rows.append((key: .list, height: unit * listShare * 1.45 * listLines)) }
            if !top, brandPlace == .bottom, let box { rows.append((key: .brand, height: box.height * 1.25)) }
            let reserve = top ? stage.areas.top : stage.areas.bottom
            let room = reserve.height * 0.94
            let brandRow = rows.first { $0.key == .brand }
            let others = rows.filter { $0.key != .brand }
            let all = rows.reduce(0) { $0 + $1.height }
            let brandScale: CGFloat = brandRow == nil || all <= 0 ? 1 : max(0.7, min(1, room / all))
            let brandHeight = brandRow.map { $0.height * brandScale } ?? 0
            let otherTotal = others.reduce(0) { $0 + $1.height }
            let scale: CGFloat = otherTotal == 0 ? 1 : max(0, min(1, (room - brandHeight) / otherTotal))
            let kept = rows.filter { $0.key == .brand || scale >= minRowScale }
            let heights = kept.map { $0.key == .brand ? brandHeight : $0.height * scale }
            let total = heights.reduce(0, +)
            let start = total <= reserve.height ? reserve.minY + (reserve.height - total) / 2 : top ? reserve.minY : reserve.maxY - total
            let rects = kept.indices.map { index -> (RowKey, CGRect) in
                let y = start + heights.prefix(index).reduce(0, +)
                return (kept[index].key, CGRect(x: reserve.minX, y: y, width: reserve.width, height: heights[index]))
            }
            return (rects, scale >= minRowScale ? scale : 0, brandScale)
        }
        let top = place(true)
        let bottom = place(false)
        func find(_ key: RowKey) -> CGRect? { (top.rects + bottom.rects).first { $0.0 == key }?.1 }
        let brandScale: CGFloat = brandPlace == .top ? top.brandScale : brandPlace == .bottom ? bottom.brandScale : 1
        return CallFrameTextPlan(brand: find(.brand), brandScale: brandScale, title: find(.title), subtitle: find(.subtitle), list: find(.list), topScale: top.scale, bottomScale: bottom.scale)
    }

    /// La largeur que la signature, posée dans un coin de la réserve, prend aux textes centrés de cette réserve.
    static func brandAllowance(_ stage: CallFrameStage, top: Bool, fonts: CallFrameFontBook) -> CGFloat {
        guard let brand = stage.look.brand else { return 0 }
        let place = brand.place
        let corner = top ? (place == .topLeft || place == .topRight) : (place == .bottomLeft || place == .bottomRight)
        return corner ? brandBox(brand, unit: stage.unit, fonts: fonts).width + stage.unit * 0.06 : 0
    }

    /// La largeur que prennent les ornements de coin (lune, REC) — ils CÈDENT au titre quand il ne tiendrait
    /// plus qu'en se tronquant.
    static func ornamentAllowance(_ stage: CallFrameStage, top: Bool) -> CGFloat {
        guard top else { return 0 }
        return stage.look.ornaments.map { topCornerShare($0.kind) * stage.unit }.max() ?? 0
    }

    /// Les ornements qui tiennent un COIN haut de la toile, et la largeur qu'ils y prennent (en `unit`).
    static func topCornerShare(_ kind: CallFrameOrnamentKind) -> CGFloat {
        switch kind {
        case .moon: return 0.17
        case .rec: return 0.24
        default: return 0
        }
    }

    // MARK: - Titres

    /// Le titre et le sous-titre, ajustés à leur rangée.
    static func fittedTitles(_ stage: CallFrameStage, plan: CallFrameTextPlan, fonts: CallFrameFontBook) -> [CallFrameFittedTitle] {
        let unit = stage.unit
        let pairs: [(CallFrameTitle?, CGRect?)] = [(stage.look.title, plan.title), (stage.look.subtitle, plan.subtitle)]
        return pairs.compactMap { pair -> CallFrameFittedTitle? in
            guard let title = pair.0, titleShown(title), let row = pair.1 else { return nil }
            let text = CallFrameText.titleText(title.source, people: stage.people, texts: stage.texts, letterCase: title.letterCase)
            guard !text.isEmpty else { return nil }
            let scale = title.place == .top ? plan.topScale : plan.bottomScale
            let top = title.place == .top
            let brand = brandAllowance(stage, top: top, fonts: fonts)
            let px = unit * titleShare(title.size) * scale
            func fit(_ allowance: CGFloat) -> CallFrameFittedText {
                CallFrameText.fit(text, maxWidth: row.width - allowance * 2 - unit * 0.02, size: px) { fonts.width($0, title.font, $1) }
            }
            let crowded = fit(max(brand, ornamentAllowance(stage, top: top)))
            let fitted = crowded.text == text && crowded.size >= px * 0.75 ? crowded : fit(brand)
            return fitted.text.isEmpty ? nil : CallFrameFittedTitle(text: fitted.text, size: fitted.size, row: row, title: title)
        }
    }

    static func textLayout(_ stage: CallFrameStage, fonts: CallFrameFontBook) -> CallFrameTextLayout {
        let plan = planText(stage, fonts: fonts)
        let titles = fittedTitles(stage, plan: plan, fonts: fonts).map { fitted -> CGRect in
            let width = fonts.width(fitted.text, fitted.title.font, fitted.size) + fitted.size * 0.8
            return CGRect(x: fitted.row.minX + (fitted.row.width - width) / 2, y: fitted.row.minY, width: width, height: fitted.row.height)
        }
        let box = stage.look.brand.map { brandBox($0, unit: stage.unit, fonts: fonts) }
        let brand: [CGRect]
        if let box, let row = plan.brand {
            brand = [CGRect(x: row.minX + (row.width - box.width) / 2 - box.px * 0.3, y: row.minY, width: box.width + box.px * 0.6, height: row.height)]
        } else if let box {
            brand = cornerBrandRect(stage, box: box).map { [$0] } ?? []
        } else {
            brand = []
        }
        let list = plan.list.map { [$0] } ?? []
        return CallFrameTextLayout(plan: plan, boxes: titles + brand + list, headline: titles.first)
    }

    static func paintTitles(_ context: CGContext, stage: CallFrameStage, plan: CallFrameTextPlan, fonts: CallFrameFontBook) {
        fittedTitles(stage, plan: plan, fonts: fonts).forEach { fitted in
            inkText(context, fitted.text, x: fitted.row.midX, y: fitted.row.midY, style: fitted.title.font, px: fitted.size, hex: fitted.title.color, effect: fitted.title.servedEffect, fonts: fonts)
        }
    }

    // MARK: - Tous les textes

    /// Les textes, dans l'ordre du § 5.1 : noms, titre et sous-titre, signature.
    static func paintTexts(_ context: CGContext, stage: CallFrameStage, plan: CallFrameTextPlan, fonts: CallFrameFontBook) {
        paintNames(context, stage: stage, plan: plan, fonts: fonts)
        paintTitles(context, stage: stage, plan: plan, fonts: fonts)
        paintBrand(context, stage: stage, plan: plan, fonts: fonts)
    }
}
