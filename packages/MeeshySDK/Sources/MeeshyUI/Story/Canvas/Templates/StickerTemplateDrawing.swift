import Foundation
import UIKit

// MARK: - Sticker Template Drawing

/// Les gestes de dessin que les neuf gabarits partagent (#4718).
///
/// Ils vivent ici plutôt que recopiés par famille : trois mesures de texte
/// écrites trois fois auraient dérivé au premier réglage de graisse, et les
/// décorations n'auraient plus eu d'air de famille.
enum StickerTemplateDrawing {

    // MARK: Le texte

    /// La police d'un gabarit. `rounded` — la même famille que le composer
    /// emploie partout (`design: .rounded` dans les vues) : une décoration en
    /// système strict jurerait avec l'écran qui la pose.
    @MainActor
    static func font(size: CGFloat, weight: UIFont.Weight = .semibold) -> UIFont {
        let base = UIFont.systemFont(ofSize: size, weight: weight)
        guard let descripteur = base.fontDescriptor.withDesign(.rounded) else { return base }
        return UIFont(descriptor: descripteur, size: size)
    }

    /// La police chiffrée des horloges — chasse FIXE, pour que « 11:11 » et
    /// « 20:48 » occupent la même largeur : sans elle, une décoration d'heure
    /// change de taille d'une minute à l'autre.
    @MainActor
    static func digitFont(size: CGFloat, weight: UIFont.Weight = .bold) -> UIFont {
        UIFont.monospacedDigitSystemFont(ofSize: size, weight: weight)
    }

    @MainActor
    static func measure(_ texte: String, font: UIFont) -> CGSize {
        (texte as NSString).size(withAttributes: [.font: font])
    }

    @MainActor
    static func draw(_ texte: String, font: UIFont, color: UIColor, at origin: CGPoint) {
        (texte as NSString).draw(at: origin, withAttributes: [
            .font: font, .foregroundColor: color,
        ])
    }

    /// Dessine `texte` CENTRÉ dans `rect`.
    @MainActor
    static func drawCentered(_ texte: String, font: UIFont, color: UIColor, in rect: CGRect) {
        let taille = measure(texte, font: font)
        draw(texte, font: font, color: color,
             at: CGPoint(x: rect.midX - taille.width / 2,
                         y: rect.midY - taille.height / 2))
    }

    // MARK: Les fonds

    /// Remplit un chemin d'un dégradé linéaire haut→bas.
    ///
    /// Passe par un `saveGState`/`restoreGState` autour du clip : sans lui, le
    /// découpage fuiterait sur tout ce que le gabarit dessine ENSUITE — un
    /// défaut qui ne se voit que sur le deuxième élément d'une décoration.
    @MainActor
    static func fill(_ chemin: UIBezierPath, gradientFrom haut: UIColor, to bas: UIColor,
                     in rect: CGRect) {
        guard let contexte = UIGraphicsGetCurrentContext(),
              let dégradé = CGGradient(
                colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: [haut.cgColor, bas.cgColor] as CFArray,
                locations: [0, 1])
        else {
            haut.setFill(); chemin.fill(); return
        }
        contexte.saveGState()
        chemin.addClip()
        contexte.drawLinearGradient(dégradé,
                                    start: CGPoint(x: rect.midX, y: rect.minY),
                                    end: CGPoint(x: rect.midX, y: rect.maxY),
                                    options: [])
        contexte.restoreGState()
    }

    // MARK: Les formes

    /// Un cœur inscrit dans `rect`, tracé en courbes de Bézier.
    ///
    /// Tracé plutôt qu'emprunté à un glyphe : un cœur emoji change de dessin
    /// d'une version d'iOS à l'autre, et une décoration doit se rendre pareil
    /// sur iOS 16 et sur iOS 26.
    static func heartPath(in rect: CGRect) -> UIBezierPath {
        let l = rect.width, h = rect.height
        let x = rect.minX, y = rect.minY
        let chemin = UIBezierPath()
        // La pointe basse, puis les deux lobes.
        chemin.move(to: CGPoint(x: x + l / 2, y: y + h))
        chemin.addCurve(to: CGPoint(x: x, y: y + h * 0.30),
                        controlPoint1: CGPoint(x: x + l * 0.14, y: y + h * 0.76),
                        controlPoint2: CGPoint(x: x, y: y + h * 0.56))
        chemin.addArc(withCenter: CGPoint(x: x + l * 0.25, y: y + h * 0.30),
                      radius: l * 0.25,
                      startAngle: .pi, endAngle: 0, clockwise: true)
        chemin.addArc(withCenter: CGPoint(x: x + l * 0.75, y: y + h * 0.30),
                      radius: l * 0.25,
                      startAngle: .pi, endAngle: 0, clockwise: true)
        chemin.addCurve(to: CGPoint(x: x + l / 2, y: y + h),
                        controlPoint1: CGPoint(x: x + l, y: y + h * 0.56),
                        controlPoint2: CGPoint(x: x + l * 0.86, y: y + h * 0.76))
        chemin.close()
        return chemin
    }

    /// Le contexte de rasterisation partagé — `opaque = false` partout : une
    /// décoration se pose SUR une scène, un fond opaque y ferait un timbre
    /// blanc.
    @MainActor
    static func rasterize(size: CGSize, screenScale: CGFloat,
                          _ dessin: () -> Void) -> (UIImage?, CGSize) {
        guard size.width > 0, size.height > 0 else { return (nil, size) }
        let format = UIGraphicsImageRendererFormat()
        format.scale = screenScale
        format.opaque = false
        let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in dessin() }
        return (image, size)
    }
}
