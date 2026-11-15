import Foundation
import UIKit
import MeeshySDK

// MARK: - Les formes et les cartouches que les FAMILLES partagent (#4820)

/// À douze gabarits, chaque dessin réinventait sa forme ; à deux cents, les
/// formes se partagent — une étoile, un nuage, une bulle, un cartouche à
/// légende — et chaque famille n'écrit que ce qui la distingue.
///
/// **Un glyphe SF inconnu de cette version d'iOS ne dessine rien** : jamais un
/// plantage, jamais un carré vide peint exprès. Le plancher est iOS 16, et les
/// noms employés par les familles y existent ; la garde ne coûte rien.
extension StickerTemplateDrawing {

    // MARK: Les glyphes

    enum Glyph: Equatable {
        case symbol(String)
        case emoji(String)
        /// Le cadre est RÉSERVÉ et l'appelant y dessine lui-même (un soleil,
        /// un nuage tracés à la main).
        case custom
        case none
    }

    @MainActor
    static func symbolImage(_ name: String, pointSize: CGFloat,
                            weight: UIImage.SymbolWeight = .semibold,
                            color: UIColor) -> UIImage? {
        let configuration = UIImage.SymbolConfiguration(pointSize: pointSize, weight: weight)
        return UIImage(systemName: name, withConfiguration: configuration)?
            .withTintColor(color, renderingMode: .alwaysOriginal)
    }

    /// Dessine un symbole SF CENTRÉ dans `rect`, ajusté au cadre.
    @MainActor
    static func drawSymbol(_ name: String, in rect: CGRect, color: UIColor,
                           weight: UIImage.SymbolWeight = .semibold) {
        guard rect.width > 0, rect.height > 0,
              let image = symbolImage(name, pointSize: rect.height, weight: weight, color: color)
        else { return }
        let rapport = min(rect.width / max(1, image.size.width),
                          rect.height / max(1, image.size.height))
        let taille = CGSize(width: image.size.width * rapport, height: image.size.height * rapport)
        image.draw(in: CGRect(x: rect.midX - taille.width / 2, y: rect.midY - taille.height / 2,
                              width: taille.width, height: taille.height))
    }

    /// Dessine un emoji centré dans `rect`, à la taille du cadre.
    @MainActor
    static func drawEmoji(_ emoji: String, in rect: CGRect) {
        drawCentered(emoji, font: UIFont.systemFont(ofSize: rect.height * 0.80),
                     color: .black, in: rect)
    }

    @MainActor
    static func drawGlyph(_ glyph: Glyph, in rect: CGRect, color: UIColor) {
        switch glyph {
        case .symbol(let nom): drawSymbol(nom, in: rect, color: color)
        case .emoji(let emoji): drawEmoji(emoji, in: rect)
        case .custom, .none: break
        }
    }

    // MARK: Les formes

    static func pillPath(in rect: CGRect) -> UIBezierPath {
        UIBezierPath(roundedRect: rect, cornerRadius: rect.height / 2)
    }

    /// Une étoile à `points` branches inscrite dans `rect`.
    static func starPath(in rect: CGRect, points: Int = 5, innerRatio: CGFloat = 0.45) -> UIBezierPath {
        let centre = CGPoint(x: rect.midX, y: rect.midY)
        let rayon = min(rect.width, rect.height) / 2
        let chemin = UIBezierPath()
        for index in 0..<(points * 2) {
            let angle = -CGFloat.pi / 2 + CGFloat(index) * .pi / CGFloat(points)
            let r = index % 2 == 0 ? rayon : rayon * innerRatio
            let point = CGPoint(x: centre.x + cos(angle) * r, y: centre.y + sin(angle) * r)
            if index == 0 { chemin.move(to: point) } else { chemin.addLine(to: point) }
        }
        chemin.close()
        return chemin
    }

    /// Un ÉCLAT — l'étoile à beaucoup de branches courtes des « WOW » et des
    /// « OMG ».
    static func burstPath(in rect: CGRect, points: Int = 12, innerRatio: CGFloat = 0.78) -> UIBezierPath {
        starPath(in: rect, points: points, innerRatio: innerRatio)
    }

    /// Un nuage — l'union de quatre disques et d'un socle arrondi. Un tracé
    /// COMPOSÉ : le remplir peint le nuage, le tracer montrerait les arcs
    /// intérieurs — d'où `fillWithOutline`, qui trace PUIS remplit.
    static func cloudPath(in rect: CGRect) -> UIBezierPath {
        let l = rect.width, h = rect.height
        let chemin = UIBezierPath(roundedRect: CGRect(x: rect.minX, y: rect.minY + h * 0.45,
                                                      width: l, height: h * 0.55),
                                  cornerRadius: h * 0.275)
        chemin.append(UIBezierPath(ovalIn: CGRect(x: rect.minX + l * 0.12, y: rect.minY + h * 0.22,
                                                  width: l * 0.42, height: l * 0.42)))
        chemin.append(UIBezierPath(ovalIn: CGRect(x: rect.minX + l * 0.38, y: rect.minY,
                                                  width: l * 0.50, height: l * 0.50)))
        chemin.append(UIBezierPath(ovalIn: CGRect(x: rect.minX + l * 0.60, y: rect.minY + h * 0.30,
                                                  width: l * 0.34, height: l * 0.34)))
        return chemin
    }

    /// Une bulle de dialogue — un cartouche arrondi et une queue en bas à
    /// gauche. Tracé composé, comme le nuage.
    static func speechBubblePath(in rect: CGRect, tail: CGFloat) -> UIBezierPath {
        let corps = CGRect(x: rect.minX, y: rect.minY, width: rect.width, height: rect.height - tail)
        let chemin = UIBezierPath(roundedRect: corps, cornerRadius: min(corps.height * 0.35, tail * 1.6))
        let queue = UIBezierPath()
        queue.move(to: CGPoint(x: corps.minX + corps.width * 0.18, y: corps.maxY - 1))
        queue.addLine(to: CGPoint(x: corps.minX + corps.width * 0.12, y: rect.maxY))
        queue.addLine(to: CGPoint(x: corps.minX + corps.width * 0.36, y: corps.maxY - 1))
        queue.close()
        chemin.append(queue)
        return chemin
    }

    /// Une bulle de PENSÉE — un nuage et deux perles vers le bas à gauche.
    static func thoughtBubblePath(in rect: CGRect, tail: CGFloat) -> UIBezierPath {
        let corps = CGRect(x: rect.minX, y: rect.minY, width: rect.width, height: rect.height - tail)
        let chemin = cloudPath(in: corps)
        let grande = tail * 0.48, petite = tail * 0.28
        chemin.append(UIBezierPath(ovalIn: CGRect(x: corps.minX + corps.width * 0.16,
                                                  y: corps.maxY - grande * 0.35,
                                                  width: grande, height: grande)))
        chemin.append(UIBezierPath(ovalIn: CGRect(x: corps.minX + corps.width * 0.08,
                                                  y: rect.maxY - petite,
                                                  width: petite, height: petite)))
        return chemin
    }

    /// Une goutte — la pluie, une larme.
    static func dropPath(in rect: CGRect) -> UIBezierPath {
        let chemin = UIBezierPath()
        let l = rect.width, h = rect.height
        chemin.move(to: CGPoint(x: rect.midX, y: rect.minY))
        chemin.addCurve(to: CGPoint(x: rect.maxX, y: rect.minY + h * 0.62),
                        controlPoint1: CGPoint(x: rect.midX + l * 0.10, y: rect.minY + h * 0.25),
                        controlPoint2: CGPoint(x: rect.maxX, y: rect.minY + h * 0.40))
        chemin.addArc(withCenter: CGPoint(x: rect.midX, y: rect.minY + h * 0.62),
                      radius: l / 2, startAngle: 0, endAngle: .pi, clockwise: true)
        chemin.addCurve(to: CGPoint(x: rect.midX, y: rect.minY),
                        controlPoint1: CGPoint(x: rect.minX, y: rect.minY + h * 0.40),
                        controlPoint2: CGPoint(x: rect.midX - l * 0.10, y: rect.minY + h * 0.25))
        chemin.close()
        return chemin
    }

    /// Des rayons autour d'un centre — un soleil, une explosion de joie.
    @MainActor
    static func drawRays(center: CGPoint, inner: CGFloat, outer: CGFloat, count: Int,
                         width: CGFloat, color: UIColor) {
        color.setStroke()
        for index in 0..<count {
            let angle = CGFloat(index) / CGFloat(count) * 2 * .pi
            let trait = UIBezierPath()
            trait.move(to: CGPoint(x: center.x + cos(angle) * inner, y: center.y + sin(angle) * inner))
            trait.addLine(to: CGPoint(x: center.x + cos(angle) * outer, y: center.y + sin(angle) * outer))
            trait.lineWidth = width
            trait.lineCapStyle = .round
            trait.stroke()
        }
    }

    /// Trace PUIS remplit : sur un tracé composé (nuage, bulle), le remplissage
    /// recouvre les arcs intérieurs du trait, et seul le bord extérieur reste.
    @MainActor
    static func fillWithOutline(_ chemin: UIBezierPath, fill: UIColor, outline: UIColor, width: CGFloat) {
        outline.setStroke()
        chemin.lineWidth = width * 2
        chemin.lineJoinStyle = .round
        chemin.stroke()
        fill.setFill()
        chemin.fill()
    }

    /// Même chose, avec un dégradé haut→bas pour le remplissage.
    @MainActor
    static func fillWithOutline(_ chemin: UIBezierPath, gradientFrom haut: UIColor, to bas: UIColor,
                                in rect: CGRect, outline: UIColor, width: CGFloat) {
        outline.setStroke()
        chemin.lineWidth = width * 2
        chemin.lineJoinStyle = .round
        chemin.stroke()
        fill(chemin, gradientFrom: haut, to: bas, in: rect)
    }

    // MARK: Le cartouche à légende

    /// La mesure d'un cartouche « glyphe + légende » — la brique de la
    /// majorité des décorations à mot : un badge de disponibilité, un
    /// « Bonjour », un « LOL ».
    struct CaptionLayout {
        let police: UIFont
        let tailleTexte: CGSize
        /// Le côté du glyphe ; zéro sans glyphe.
        let glyphe: CGFloat
        let taille: CGSize
    }

    @MainActor
    static func captionLayout(caption: String, glyph: Glyph, metrics: StickerTemplateMetrics,
                              textScale: CGFloat = 0.78, weight: UIFont.Weight = .heavy,
                              extraHeight: CGFloat = 0) -> CaptionLayout {
        let police = font(size: metrics.fontSize * textScale, weight: weight)
        let tailleTexte = measure(caption, font: police)
        let glyphe: CGFloat = glyph == .none ? 0 : metrics.fontSize * 1.05
        let entre: CGFloat = glyph == .none ? 0 : metrics.gap
        let taille = CGSize(
            width: ceil(metrics.horizontalPadding * 2 + glyphe + entre + tailleTexte.width),
            height: ceil(metrics.verticalPadding * 2 + max(glyphe, tailleTexte.height) + extraHeight)
        )
        return CaptionLayout(police: police, tailleTexte: tailleTexte, glyphe: glyphe, taille: taille)
    }

    /// Dessine le contenu d'un cartouche — glyphe à gauche, légende à droite —
    /// dans `rect`. La FORME est dessinée par l'appelant avant : c'est elle qui
    /// fait la famille.
    @MainActor
    static func drawCaptionContent(_ layout: CaptionLayout, caption: String, glyph: Glyph,
                                   metrics: StickerTemplateMetrics, in rect: CGRect,
                                   textColor: UIColor, glyphColor: UIColor) {
        var x = rect.minX + metrics.horizontalPadding
        if layout.glyphe > 0 {
            let cadre = CGRect(x: x, y: rect.midY - layout.glyphe / 2,
                               width: layout.glyphe, height: layout.glyphe)
            drawGlyph(glyph, in: cadre, color: glyphColor)
            x += layout.glyphe + metrics.gap
        }
        draw(caption, font: layout.police, color: textColor,
             at: CGPoint(x: x, y: rect.midY - layout.tailleTexte.height / 2))
    }
}

// MARK: - Les couleurs que les familles partagent

extension StickerTemplatePalette {
    /// Le ciel des météos et des jours — `infoHex`, jamais un bleu système.
    public static let sky: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.infoHex) ?? .systemBlue
    /// Le vert des « disponible », des feuilles et des « oui ».
    public static let leaf: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.successHex) ?? .systemGreen
    /// L'indigo profond des nuits.
    public static let night: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.indigo900Hex) ?? .black
    /// L'indigo clair des cartouches doux.
    public static let lilac: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.indigo400Hex) ?? .systemIndigo
    /// L'indigo très clair — le fond des cartouches pâles.
    public static let indigoLight: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.indigo300Hex) ?? .systemIndigo
    /// Le gris neutre des « hors ligne » et des silences.
    public static let neutral: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.neutral500Hex) ?? .systemGray
}
