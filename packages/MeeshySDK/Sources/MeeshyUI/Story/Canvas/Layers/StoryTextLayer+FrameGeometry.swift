import Foundation
import QuartzCore
import CoreText
import UIKit
import MeeshySDK

extension StoryTextLayer {
    // MARK: - Frame geometry (path-based shapes)

    /// Hauteur (design px) de la bande réservée à la queue de la bulle BD.
    nonisolated static let speechTailHeight: CGFloat = 40
    /// Rayon (design px) des bosses du nuage.
    nonisolated static let cloudPuffRadius: CGFloat = 26
    /// Hauteur (design px) de la bande réservée aux bulles de pensée du nuage.
    nonisolated static let cloudThoughtHeight: CGFloat = 48

    /// Encombrement design-space du cadre + zone de glyphes pour une forme.
    nonisolated struct FrameMetrics: Equatable {
        let bounds: CGSize
        let glyphRect: CGRect
    }

    /// Calcule l'encombrement du cadre et la zone où les glyphes sont peints,
    /// en design px. Formes à coins : pad horizontal ≥ 1 'o' (framé) ou 8 px,
    /// +16 vertical — comportement historique inchangé. Formes path-based :
    /// - losange : rect w×h inscrit dans un rhombe de diagonales (2w, 2h) —
    ///   les coins du texte touchent exactement les bords, glyphes centrés ;
    /// - bulle BD : corps arrondi + bande basse pour la queue ;
    /// - nuage : bosses tout autour + bande basse pour les bulles de pensée.
    ///
    /// `nonisolated static` pour être testable sans instancier de calque.
    /// Débord d'encre maximal (design px) d'un côté ou de l'autre des lignes
    /// wrappées : différence entre les bounds de TRACÉ des glyphes
    /// (`.useGlyphPathBounds` — l'encre réellement peinte) et la largeur
    /// typographique (somme des avances) que mesure `boundingRect`. Les
    /// empattements/terminaisons serif dépassent l'avance ; sans cette marge,
    /// CATextLayer rogne le premier/dernier glyphe.
    nonisolated static func maxInkOverhangPerSide(of attributed: NSAttributedString,
                                                  wrappedTo maxWidth: CGFloat) -> CGFloat {
        guard attributed.length > 0 else { return 0 }
        let framesetter = CTFramesetterCreateWithAttributedString(attributed)
        let path = CGPath(rect: CGRect(x: 0, y: 0, width: maxWidth, height: 1_000_000),
                          transform: nil)
        let frame = CTFramesetterCreateFrame(framesetter,
                                             CFRange(location: 0, length: 0), path, nil)
        guard let lines = CTFrameGetLines(frame) as? [CTLine], !lines.isEmpty else { return 0 }
        var overhang: CGFloat = 0
        for line in lines {
            let typographic = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
            let ink = CTLineGetBoundsWithOptions(line, [.useGlyphPathBounds])
            overhang = max(overhang, ink.maxX - typographic, -ink.minX)
        }
        return max(0, ceil(overhang))
    }

    /// Hauteur EXIGÉE par CoreText — le moteur qui peint réellement le
    /// contenu d'un `CATextLayer` — pour poser TOUT `attributed` wrappé à
    /// `maxWidth` sans qu'aucune ligne ne soit agglomérée. `boundingRect`
    /// (TextKit, utilisé pour `designSize`/`renderedNeed` dans `configure`)
    /// sous-estime cette hauteur quand une ligne contient des glyphes à
    /// ascent/descent supérieur à la police du texte — Apple Color Emoji en
    /// fin de ligne, typiquement — car `.usesFontLeading` ne le compte pas
    /// comme CoreText le fait à la pose réelle.
    ///
    /// `CTFramesetterSuggestFrameSizeWithConstraints` (l'ancienne
    /// implémentation) SOUS-ESTIME lui-même encore ce calcul dans un cas
    /// précis : une ligne composée UNIQUEMENT d'emoji (descent Apple Color
    /// Emoji ≈ 0,3125 em), posée avec une police de base dont le descent est
    /// PLUS GRAND (ex. SavoyeLetPlain ≈ 0,5 em). `CATextLayer` réserve alors
    /// AU MOINS le descent de sa police de base MÊME pour cette ligne — ce
    /// que `CTLineGetTypographicBounds` (et donc `SuggestFrameSize`, qui s'y
    /// ramène) ignore puisqu'il ne rapporte que le max des runs RÉELLEMENT
    /// PRÉSENTS sur la ligne (ici, uniquement le run emoji substitué). Sur
    /// une ligne MIXTE texte+emoji ce n'est pas un problème : `CTLine` a déjà
    /// pris le max des runs, qui inclut le run texte à fort descent.
    ///
    /// On reconstruit donc un vrai `CTFrame` (`CTFramesetterCreateFrame`) à
    /// `maxWidth`, on récupère ses `CTLine`s, et pour CHAQUE ligne on calcule
    /// `ascent + max(descent de la ligne, descent de `baseFont`) + leading`,
    /// puis on somme sur toutes les lignes — exactement le calcul de hauteur
    /// réel de `CATextLayer` (vérifié à ±0,01pt sur 4 configurations par
    /// réplication du rendu réel, repro 2026-08). `baseFont` doit être la
    /// police du texte PRINCIPAL (`designFont`/`renderedFont` selon l'espace
    /// de mesure appelant) — PAS forcément celle du run de la ligne courante,
    /// qui peut avoir été substituée (cas emoji).
    ///
    /// `nonisolated static` pour être testable sans instancier de calque
    /// (même pattern que `maxInkOverhangPerSide`).
    nonisolated static func coreTextRequiredHeight(of attributed: NSAttributedString,
                                                   wrappedTo maxWidth: CGFloat,
                                                   baseFont: CTFont) -> CGFloat {
        guard attributed.length > 0, maxWidth > 0 else { return 0 }
        let framesetter = CTFramesetterCreateWithAttributedString(attributed)
        let path = CGPath(rect: CGRect(x: 0, y: 0, width: maxWidth, height: 1_000_000),
                          transform: nil)
        let frame = CTFramesetterCreateFrame(framesetter,
                                             CFRange(location: 0, length: 0), path, nil)
        guard let lines = CTFrameGetLines(frame) as? [CTLine], !lines.isEmpty else { return 0 }
        let baseDescent = CTFontGetDescent(baseFont)
        var total: CGFloat = 0
        for line in lines {
            var ascent: CGFloat = 0
            var descent: CGFloat = 0
            var leading: CGFloat = 0
            _ = CTLineGetTypographicBounds(line, &ascent, &descent, &leading)
            total += ascent + max(descent, baseDescent) + leading
        }
        return ceil(total)
    }

    nonisolated static func frameMetrics(shape: StoryTextFrameShape,
                                         isFramed: Bool,
                                         textSize: CGSize,
                                         oGlyphWidth: CGFloat,
                                         paddingScale: CGFloat = 1) -> FrameMetrics {
        let w = ceil(textSize.width)
        let h = ceil(textSize.height)
        // Un texte NU n'a pas de boîte : le curseur de marge ne le concerne
        // pas, et lui appliquer changerait la mise en page de toutes les
        // stories sans cadre.
        let scale = isFramed ? max(0, paddingScale) : 1
        let hPad = max(8, oGlyphWidth) * scale
        let vPad = 8 * scale
        guard isFramed, shape.usesCustomPath else {
            return FrameMetrics(bounds: CGSize(width: w + hPad * 2, height: h + vPad * 2),
                                glyphRect: CGRect(x: hPad, y: vPad, width: w, height: h))
        }
        switch shape {
        case .none, .rounded, .pill, .rectangle:
            // Couvert par le guard (usesCustomPath == false) — jamais atteint.
            return FrameMetrics(bounds: CGSize(width: w + hPad * 2, height: h + vPad * 2),
                                glyphRect: CGRect(x: hPad, y: vPad, width: w, height: h))
        case .diamond:
            let width = max(w * 2, w + hPad * 2)
            let height = max(h * 2, h + vPad * 2)
            return FrameMetrics(bounds: CGSize(width: width, height: height),
                                glyphRect: CGRect(x: (width - w) / 2,
                                                  y: (height - h) / 2,
                                                  width: w, height: h))
        case .speech:
            // `speechTailHeight` est une caractéristique de la forme et non une
            // marge : la faire suivre le curseur détacherait la queue du corps.
            return FrameMetrics(bounds: CGSize(width: w + hPad * 2,
                                               height: h + vPad * 2 + speechTailHeight),
                                glyphRect: CGRect(x: hPad, y: vPad, width: w, height: h))
        case .cloud:
            let puff = cloudPuffRadius
            return FrameMetrics(bounds: CGSize(width: w + hPad * 2 + puff * 2,
                                               height: h + vPad * 2 + puff * 2 + cloudThoughtHeight),
                                glyphRect: CGRect(x: hPad + puff, y: vPad + puff,
                                                  width: w, height: h))
        }
    }

    /// Tracé design-space du cadre pour les formes path-based ; `nil` pour les
    /// formes à coins (rendues par `cornerRadius`). Les sous-tracés se
    /// chevauchent volontairement : un fill nonzero peint chaque pixel UNE
    /// seule fois, donc pas de couture ni de sur-opacité même avec un fond
    /// translucide (hex "…A6").
    nonisolated static func framePath(shape: StoryTextFrameShape, in rect: CGRect) -> CGPath? {
        switch shape {
        case .none, .rounded, .pill, .rectangle:
            return nil

        case .diamond:
            let path = CGMutablePath()
            path.move(to: CGPoint(x: rect.midX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
            path.closeSubpath()
            return path

        case .speech:
            let body = CGRect(x: rect.minX, y: rect.minY,
                              width: rect.width,
                              height: max(1, rect.height - speechTailHeight))
            let radius = max(0, min(body.height * 0.3, body.width * 0.2))
            let path = CGMutablePath()
            path.addRoundedRect(in: body, cornerWidth: radius, cornerHeight: radius)
            // Queue pointée bas-gauche, chevauchant le corps de 2 px.
            let baseX = body.minX + body.width * 0.20
            let baseWidth = min(body.width * 0.30, speechTailHeight * 1.6)
            path.move(to: CGPoint(x: baseX, y: body.maxY - 2))
            path.addLine(to: CGPoint(x: baseX + baseWidth, y: body.maxY - 2))
            path.addLine(to: CGPoint(x: max(rect.minX, baseX - speechTailHeight * 0.25),
                                     y: rect.maxY))
            path.closeSubpath()
            return path

        case .cloud:
            let puff = cloudPuffRadius
            let body = CGRect(x: rect.minX, y: rect.minY,
                              width: rect.width,
                              height: max(1, rect.height - cloudThoughtHeight))
            let inner = body.insetBy(dx: puff, dy: puff)
            guard inner.width > 0, inner.height > 0 else {
                return CGPath(ellipseIn: body, transform: nil)
            }
            let path = CGMutablePath()
            let radius = max(0, min(inner.height, inner.width) * 0.25)
            path.addRoundedRect(in: inner, cornerWidth: radius, cornerHeight: radius)
            addCloudPuffs(to: path, around: inner, radius: puff)
            // Bulles de pensée en cascade vers le bas-gauche, contenues dans
            // la bande `cloudThoughtHeight`.
            let large = puff * 0.6
            let small = puff * 0.35
            let cx = max(inner.minX + puff, inner.minX + inner.width * 0.15)
            path.addEllipse(in: CGRect(x: cx - large, y: body.maxY - large * 0.4,
                                       width: large * 2, height: large * 2))
            path.addEllipse(in: CGRect(x: cx - puff * 0.8 - small,
                                       y: body.maxY + large * 1.4,
                                       width: small * 2, height: small * 2))
            return path
        }
    }

    /// Ajoute une rangée de cercles (rayon `radius`) centrés sur le périmètre
    /// de `rect` — les bosses du nuage. Espacement ~1.5 rayon pour un
    /// chevauchement moelleux sans trous.
    private nonisolated static func addCloudPuffs(to path: CGMutablePath,
                                                  around rect: CGRect,
                                                  radius: CGFloat) {
        func addAlong(from a: CGPoint, to b: CGPoint) {
            let distance = hypot(b.x - a.x, b.y - a.y)
            let steps = max(1, Int(ceil(distance / (radius * 1.5))))
            for i in 0...steps {
                let t = CGFloat(i) / CGFloat(steps)
                let center = CGPoint(x: a.x + (b.x - a.x) * t,
                                     y: a.y + (b.y - a.y) * t)
                path.addEllipse(in: CGRect(x: center.x - radius,
                                           y: center.y - radius,
                                           width: radius * 2,
                                           height: radius * 2))
            }
        }
        addAlong(from: CGPoint(x: rect.minX, y: rect.minY), to: CGPoint(x: rect.maxX, y: rect.minY))
        addAlong(from: CGPoint(x: rect.maxX, y: rect.minY), to: CGPoint(x: rect.maxX, y: rect.maxY))
        addAlong(from: CGPoint(x: rect.maxX, y: rect.maxY), to: CGPoint(x: rect.minX, y: rect.maxY))
        addAlong(from: CGPoint(x: rect.minX, y: rect.maxY), to: CGPoint(x: rect.minX, y: rect.minY))
    }
}
