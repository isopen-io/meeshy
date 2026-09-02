import Foundation
import UIKit
import MeeshySDK

// MARK: - Les dix cadres à MOTS (#4822)

/// Le texte est celui de l'AUTEUR, figé dans l'emplacement `text` à la pose ;
/// vide, on dessine un exemple — la palette montre alors ce que le cadre fera
/// des mots, sans pouvoir poser (loi 4).
///
/// Chaque cadre PLIE le texte à neuf corps de large : un sticker qui s'étire
/// sur toute la scène pour une phrase n'est plus une décoration.
extension StickerTemplateRenderer {

    // MARK: Le texte plié

    static func proseText(_ slots: [String: String]) -> String {
        let texte = (slots[StickerSlotFiller.textSlot] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return texte.isEmpty ? Self.proseExample : texte
    }

    /// L'exemple d'un cadre vide — localisé, donc dans la langue du lecteur.
    @MainActor
    static var proseExample: String {
        String(localized: "sticker.text.example", defaultValue: "Coucou !", bundle: .module)
    }

    @MainActor
    static func measureWrapped(_ texte: String, font: UIFont, maxWidth: CGFloat) -> CGSize {
        let borne = CGSize(width: maxWidth, height: .greatestFiniteMagnitude)
        let cadre = (texte as NSString).boundingRect(
            with: borne, options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: [.font: font], context: nil)
        return CGSize(width: ceil(max(cadre.width, font.pointSize * 0.6)), height: ceil(cadre.height))
    }

    @MainActor
    static func drawWrapped(_ texte: String, font: UIFont, color: UIColor, in rect: CGRect,
                            alignment: NSTextAlignment = .center) {
        let paragraphe = NSMutableParagraphStyle()
        paragraphe.alignment = alignment
        paragraphe.lineBreakMode = .byWordWrapping
        (texte as NSString).draw(in: rect, withAttributes: [
            .font: font, .foregroundColor: color, .paragraphStyle: paragraphe,
        ])
    }

    private struct ProseLayout {
        let texte: String
        let police: UIFont
        let tailleTexte: CGSize
    }

    @MainActor
    private static func proseLayout(_ slots: [String: String], metrics: StickerTemplateMetrics,
                                    textScale: CGFloat = 0.78, weight: UIFont.Weight = .bold,
                                    monospace: Bool = false) -> ProseLayout {
        let texte = proseText(slots)
        let police = monospace
            ? StickerTemplateDrawing.digitFont(size: metrics.fontSize * textScale, weight: weight)
            : StickerTemplateDrawing.font(size: metrics.fontSize * textScale, weight: weight)
        let taille = measureWrapped(texte, font: police, maxWidth: metrics.fontSize * 9)
        return ProseLayout(texte: texte, police: police, tailleTexte: taille)
    }

    // MARK: Un cadre = une taille et un dessin autour du même texte

    private struct TextFrame {
        let id: String
        let name: @MainActor () -> String
        let animation: StickerAnimation?
        /// La taille TOTALE pour un texte mesuré.
        let size: @MainActor (CGSize, StickerTemplateMetrics) -> CGSize
        /// Dessine le cadre dans `rect` et rend le cadre où écrire le texte.
        let frame: @MainActor (CGRect, StickerTemplateMetrics) -> CGRect
        let textColor: UIColor
        let textScale: CGFloat
        let weight: UIFont.Weight
        let uppercase: Bool
    }

    @MainActor
    private static func textSize(_ cadre: TextFrame, slots: [String: String],
                                 metrics: StickerTemplateMetrics) -> CGSize {
        let l = proseLayout(slots, metrics: metrics, textScale: cadre.textScale, weight: cadre.weight)
        return cadre.size(l.tailleTexte, metrics)
    }

    @MainActor
    private static func textImage(_ cadre: TextFrame, slots: [String: String],
                                  metrics: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        var l = proseLayout(slots, metrics: metrics, textScale: cadre.textScale, weight: cadre.weight)
        if cadre.uppercase {
            l = ProseLayout(texte: l.texte.uppercased(), police: l.police,
                            tailleTexte: measureWrapped(l.texte.uppercased(), font: l.police,
                                                        maxWidth: metrics.fontSize * 9))
        }
        let taille = cadre.size(l.tailleTexte, metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let zone = cadre.frame(CGRect(origin: .zero, size: taille), metrics)
            let boîte = CGRect(x: zone.midX - l.tailleTexte.width / 2,
                               y: zone.midY - l.tailleTexte.height / 2,
                               width: l.tailleTexte.width, height: l.tailleTexte.height)
            drawWrapped(l.texte, font: l.police, color: cadre.textColor, in: boîte)
        }
    }

    private static func textDrawer(_ cadre: TextFrame) -> StickerTemplateDrawer {
        StickerTemplateDrawer(
            id: cadre.id,
            name: cadre.name,
            measure: { s, m in Self.textSize(cadre, slots: s, metrics: m) },
            draw: { s, m, échelle in Self.textImage(cadre, slots: s, metrics: m, screenScale: échelle) })
    }

    // MARK: Les dessins de cadre

    @MainActor
    private static func padded(_ texte: CGSize, _ m: StickerTemplateMetrics,
                               extraWidth: CGFloat = 0, extraHeight: CGFloat = 0) -> CGSize {
        CGSize(width: ceil(texte.width + m.horizontalPadding * 2 + extraWidth),
               height: ceil(texte.height + m.verticalPadding * 2 + extraHeight))
    }

    @MainActor
    private static func card(_ rect: CGRect, radius: CGFloat, from haut: UIColor, to bas: UIColor,
                             outline: UIColor, width: CGFloat) -> CGRect {
        let chemin = UIBezierPath(roundedRect: rect, cornerRadius: radius)
        StickerTemplateDrawing.fillWithOutline(chemin, gradientFrom: haut, to: bas, in: rect,
                                               outline: outline, width: width)
        return rect
    }

    @MainActor
    private static func drawTapeEdge(_ rect: CGRect, teeth: Int, left: Bool) -> UIBezierPath {
        let chemin = UIBezierPath()
        let pas = rect.height / CGFloat(teeth)
        let x = left ? rect.minX : rect.maxX
        let dent = rect.width * 0.03 * (left ? 1 : -1)
        chemin.move(to: CGPoint(x: x, y: rect.minY))
        for index in 0..<teeth {
            let y = rect.minY + pas * CGFloat(index)
            chemin.addLine(to: CGPoint(x: x + dent, y: y + pas / 2))
            chemin.addLine(to: CGPoint(x: x, y: y + pas))
        }
        return chemin
    }

    static let textDrawers: [StickerTemplateDrawer] = [
        TextFrame(
            id: StickerTemplateCatalog.ID.textSpeechBubble,
            name: { String(localized: "sticker.template.text.speechBubble", defaultValue: "Bulle", bundle: .module) },
            animation: .pop,
            size: { t, m in Self.padded(t, m, extraHeight: m.fontSize * 0.55) },
            frame: { r, m in
                let queue = m.fontSize * 0.55
                let chemin = StickerTemplateDrawing.speechBubblePath(in: r.insetBy(dx: 1, dy: 1), tail: queue)
                StickerTemplateDrawing.fillWithOutline(chemin, fill: StickerTemplatePalette.surface,
                                                       outline: StickerTemplatePalette.accent,
                                                       width: max(1, m.fontSize * 0.06))
                return CGRect(x: r.minX, y: r.minY, width: r.width, height: r.height - queue)
            },
            textColor: StickerTemplatePalette.label, textScale: 0.78, weight: .bold, uppercase: false),
        TextFrame(
            id: StickerTemplateCatalog.ID.textThoughtBubble,
            name: { String(localized: "sticker.template.text.thoughtBubble", defaultValue: "Pensée", bundle: .module) },
            animation: .float,
            size: { t, m in Self.padded(t, m, extraWidth: m.fontSize * 0.6, extraHeight: m.fontSize * 1.1) },
            frame: { r, m in
                let queue = m.fontSize * 0.7
                let chemin = StickerTemplateDrawing.thoughtBubblePath(in: r.insetBy(dx: 1, dy: 1), tail: queue)
                StickerTemplateDrawing.fillWithOutline(chemin, fill: StickerTemplatePalette.surface,
                                                       outline: StickerTemplatePalette.lilac,
                                                       width: max(1, m.fontSize * 0.06))
                return CGRect(x: r.minX, y: r.minY + m.fontSize * 0.25, width: r.width,
                              height: r.height - queue - m.fontSize * 0.25)
            },
            textColor: StickerTemplatePalette.label, textScale: 0.74, weight: .semibold, uppercase: false),
        TextFrame(
            id: StickerTemplateCatalog.ID.textStickyNote,
            name: { String(localized: "sticker.template.text.stickyNote", defaultValue: "Post-it", bundle: .module) },
            animation: nil,
            size: { t, m in
                let côté = max(t.width, t.height) + m.horizontalPadding * 2
                return CGSize(width: ceil(côté), height: ceil(côté))
            },
            frame: { r, m in
                StickerTemplatePalette.warmBulb.setFill()
                UIBezierPath(rect: r).fill()
                let pli = m.fontSize * 0.55
                let coin = UIBezierPath()
                coin.move(to: CGPoint(x: r.maxX - pli, y: r.maxY))
                coin.addLine(to: CGPoint(x: r.maxX, y: r.maxY - pli))
                coin.addLine(to: CGPoint(x: r.maxX - pli, y: r.maxY - pli))
                coin.close()
                StickerTemplatePalette.surface.withAlphaComponent(0.85).setFill()
                coin.fill()
                return r
            },
            textColor: StickerTemplatePalette.ink, textScale: 0.74, weight: .semibold, uppercase: false),
        TextFrame(
            id: StickerTemplateCatalog.ID.textRibbon,
            name: { String(localized: "sticker.template.text.ribbon", defaultValue: "Ruban", bundle: .module) },
            animation: .swing,
            size: { t, m in Self.padded(t, m, extraWidth: m.fontSize * 1.0) },
            frame: { r, m in
                let q = m.fontSize * 0.5, h = r.height, L = r.width
                let ruban = UIBezierPath()
                ruban.move(to: CGPoint(x: 0, y: 0)); ruban.addLine(to: CGPoint(x: L, y: 0))
                ruban.addLine(to: CGPoint(x: L - q, y: h / 2)); ruban.addLine(to: CGPoint(x: L, y: h))
                ruban.addLine(to: CGPoint(x: 0, y: h)); ruban.addLine(to: CGPoint(x: q, y: h / 2))
                ruban.close()
                StickerTemplateDrawing.fill(ruban, gradientFrom: StickerTemplatePalette.accent,
                                            to: StickerTemplatePalette.loveCool, in: r)
                return r
            },
            textColor: StickerTemplatePalette.surface, textScale: 0.78, weight: .heavy, uppercase: false),
        TextFrame(
            id: StickerTemplateCatalog.ID.textBadge,
            name: { String(localized: "sticker.template.text.badge", defaultValue: "Badge", bundle: .module) },
            animation: .pulse,
            size: { t, m in Self.padded(t, m, extraWidth: m.fontSize * 0.4) },
            frame: { r, m in
                Self.card(r.insetBy(dx: 1, dy: 1), radius: r.height / 2,
                          from: StickerTemplatePalette.accent, to: StickerTemplatePalette.night,
                          outline: StickerTemplatePalette.surface, width: max(1, m.fontSize * 0.05))
            },
            textColor: StickerTemplatePalette.surface, textScale: 0.78, weight: .heavy, uppercase: false),
        TextFrame(
            id: StickerTemplateCatalog.ID.textNeon,
            name: { String(localized: "sticker.template.text.neon", defaultValue: "Néon", bundle: .module) },
            animation: .blink,
            size: { t, m in Self.padded(t, m, extraWidth: m.fontSize * 0.6, extraHeight: m.fontSize * 0.3) },
            frame: { r, m in
                let carte = UIBezierPath(roundedRect: r, cornerRadius: m.fontSize * 0.4)
                StickerTemplatePalette.night.setFill()
                carte.fill()
                guard let contexte = UIGraphicsGetCurrentContext() else { return r }
                contexte.setShadow(offset: .zero, blur: m.fontSize * 0.45,
                                   color: StickerTemplatePalette.loveWarm.cgColor)
                return r
            },
            textColor: StickerTemplatePalette.surface, textScale: 0.82, weight: .heavy, uppercase: true),
        TextFrame(
            id: StickerTemplateCatalog.ID.textTag,
            name: { String(localized: "sticker.template.text.tag", defaultValue: "Étiquette", bundle: .module) },
            animation: .wobble,
            size: { t, m in Self.padded(t, m, extraWidth: m.fontSize * 1.2) },
            frame: { r, m in
                let coin = m.fontSize * 0.7
                let étiquette = UIBezierPath()
                étiquette.move(to: CGPoint(x: r.minX + coin, y: r.minY))
                étiquette.addLine(to: CGPoint(x: r.maxX, y: r.minY))
                étiquette.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
                étiquette.addLine(to: CGPoint(x: r.minX + coin, y: r.maxY))
                étiquette.addLine(to: CGPoint(x: r.minX, y: r.midY))
                étiquette.close()
                StickerTemplateDrawing.fill(étiquette, gradientFrom: StickerTemplatePalette.lilac,
                                            to: StickerTemplatePalette.accent, in: r)
                let trou = m.fontSize * 0.22
                StickerTemplatePalette.surface.setFill()
                UIBezierPath(ovalIn: CGRect(x: r.minX + coin * 0.55 - trou / 2, y: r.midY - trou / 2,
                                            width: trou, height: trou)).fill()
                return CGRect(x: r.minX + coin, y: r.minY, width: r.width - coin, height: r.height)
            },
            textColor: StickerTemplatePalette.surface, textScale: 0.76, weight: .bold, uppercase: false),
        TextFrame(
            id: StickerTemplateCatalog.ID.textSignboard,
            name: { String(localized: "sticker.template.text.signboard", defaultValue: "Panneau", bundle: .module) },
            animation: .swing,
            size: { t, m in Self.padded(t, m, extraWidth: m.fontSize * 0.4, extraHeight: m.fontSize * 0.9) },
            frame: { r, m in
                let poteau = m.fontSize * 0.9
                let planche = CGRect(x: r.minX, y: r.minY, width: r.width, height: r.height - poteau)
                StickerTemplatePalette.warmBulb.setFill()
                UIBezierPath(rect: CGRect(x: r.midX - m.fontSize * 0.12, y: planche.maxY - 1,
                                          width: m.fontSize * 0.24, height: poteau)).fill()
                _ = Self.card(planche, radius: m.fontSize * 0.2,
                              from: StickerTemplatePalette.warmBulb, to: StickerTemplatePalette.pin,
                              outline: StickerTemplatePalette.surface, width: max(1, m.fontSize * 0.05))
                let clou = m.fontSize * 0.16
                StickerTemplatePalette.ink.setFill()
                for x in [planche.minX + clou * 1.4, planche.maxX - clou * 2.4] {
                    UIBezierPath(ovalIn: CGRect(x: x, y: planche.minY + clou * 1.2, width: clou, height: clou)).fill()
                }
                return planche
            },
            textColor: StickerTemplatePalette.surface, textScale: 0.78, weight: .heavy, uppercase: false),
        TextFrame(
            id: StickerTemplateCatalog.ID.textTape,
            name: { String(localized: "sticker.template.text.tape", defaultValue: "Adhésif", bundle: .module) },
            animation: nil,
            size: { t, m in Self.padded(t, m, extraWidth: m.fontSize * 0.8) },
            frame: { r, m in
                let bande = UIBezierPath(rect: r.insetBy(dx: r.width * 0.03, dy: 0))
                StickerTemplatePalette.surface.withAlphaComponent(0.78).setFill()
                bande.fill()
                let gauche = Self.drawTapeEdge(r, teeth: 7, left: true)
                let droite = Self.drawTapeEdge(r, teeth: 7, left: false)
                StickerTemplatePalette.surface.withAlphaComponent(0.78).setFill()
                let marge = r.width * 0.03
                for (bord, x) in [(gauche, r.minX + marge), (droite, r.maxX - marge)] {
                    bord.addLine(to: CGPoint(x: x, y: r.maxY))
                    bord.addLine(to: CGPoint(x: x, y: r.minY))
                    bord.close()
                    bord.fill()
                }
                return r
            },
            textColor: StickerTemplatePalette.ink, textScale: 0.72, weight: .medium, uppercase: false),
        TextFrame(
            id: StickerTemplateCatalog.ID.textStamp,
            name: { String(localized: "sticker.template.text.stamp", defaultValue: "Tampon", bundle: .module) },
            animation: .tada,
            size: { t, m in Self.padded(t, m, extraWidth: m.fontSize * 0.6, extraHeight: m.fontSize * 0.3) },
            frame: { r, m in
                let bord = max(1.5, m.fontSize * 0.09)
                let extérieur = UIBezierPath(roundedRect: r.insetBy(dx: bord, dy: bord), cornerRadius: m.fontSize * 0.3)
                let intérieur = UIBezierPath(roundedRect: r.insetBy(dx: bord * 3.2, dy: bord * 3.2), cornerRadius: m.fontSize * 0.22)
                StickerTemplatePalette.pin.setStroke()
                extérieur.lineWidth = bord; extérieur.stroke()
                intérieur.lineWidth = bord * 0.6; intérieur.stroke()
                return r
            },
            textColor: StickerTemplatePalette.pin, textScale: 0.80, weight: .heavy, uppercase: true),
    ].map(textDrawer)
}
