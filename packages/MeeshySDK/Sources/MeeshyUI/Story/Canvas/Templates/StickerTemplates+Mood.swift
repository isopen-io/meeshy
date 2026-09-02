import Foundation
import UIKit
import MeeshySDK

// MARK: - Les dix décorations d'HUMEUR (#4820)

/// Une humeur se dit en un CARTOUCHE — l'icône à gauche, le mot à droite — ou
/// en un VISAGE nu, quand le mot serait de trop. La légende vient de
/// `String(localized:)`, donc de la langue du LECTEUR : l'id porte le sens, le
/// dessin le dit dans chaque langue.
///
/// Cinq humeurs partagent le patron du cartouche (`MoodCard`) ; les cinq
/// autres changent de SILHOUETTE — visage rond, fleur, badge, polaroid — pour
/// se reconnaître dans la palette sans lire.
extension StickerTemplateRenderer {

    // MARK: Le patron d'un cartouche d'humeur

    private struct MoodCard {
        let id: String
        /// Une clé LITTÉRALE par carte : une clé construite serait invisible au
        /// catalogue de chaînes, donc jamais traduite.
        let name: @MainActor () -> String
        let haut: UIColor
        let bas: UIColor
        let texte: UIColor
        let icône: @MainActor (CGRect) -> Void
    }

    @MainActor
    private static func moodCardSize(_ carte: MoodCard, metrics: StickerTemplateMetrics) -> CGSize {
        StickerTemplateDrawing.captionLayout(caption: carte.name(), glyph: .custom,
                                             metrics: metrics).taille
    }

    @MainActor
    private static func moodCardImage(_ carte: MoodCard, metrics: StickerTemplateMetrics,
                                      screenScale: CGFloat) -> (UIImage?, CGSize) {
        let légende = carte.name()
        let l = StickerTemplateDrawing.captionLayout(caption: légende, glyph: .custom,
                                                     metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let fond = UIBezierPath(roundedRect: cadre, cornerRadius: l.taille.height * 0.30)
            StickerTemplateDrawing.fill(fond, gradientFrom: carte.haut, to: carte.bas, in: cadre)
            StickerTemplatePalette.surface.withAlphaComponent(0.55).setStroke()
            fond.lineWidth = max(1, metrics.fontSize * 0.05)
            fond.stroke()
            carte.icône(CGRect(x: metrics.horizontalPadding, y: cadre.midY - l.glyphe / 2,
                               width: l.glyphe, height: l.glyphe))
            StickerTemplateDrawing.draw(
                légende, font: l.police, color: carte.texte,
                at: CGPoint(x: metrics.horizontalPadding + l.glyphe + metrics.gap,
                            y: cadre.midY - l.tailleTexte.height / 2))
        }
    }

    private static func moodCardDrawer(_ carte: MoodCard) -> StickerTemplateDrawer {
        StickerTemplateDrawer(
            id: carte.id,
            name: { carte.name() },
            measure: { _, m in Self.moodCardSize(carte, metrics: m) },
            draw: { _, m, échelle in Self.moodCardImage(carte, metrics: m, screenScale: échelle) })
    }

    // MARK: Les icônes des cartouches

    /// Un nuage gris-indigo et deux larmes qui en tombent.
    @MainActor
    private static func rainingCloud(in r: CGRect) {
        StickerTemplateDrawing.fillWithOutline(
            StickerTemplateDrawing.cloudPath(in: CGRect(x: r.minX, y: r.minY,
                                                        width: r.width, height: r.height * 0.60)),
            fill: StickerTemplatePalette.neutral, outline: StickerTemplatePalette.surface,
            width: max(1, r.width * 0.05))
        StickerTemplatePalette.night.withAlphaComponent(0.85).setFill()
        let largeur = r.width * 0.18
        // Deux gouttes DÉCALÉES en hauteur : deux larmes alignées feraient une
        // rangée de pluie, pas un chagrin.
        StickerTemplateDrawing.dropPath(in: CGRect(x: r.minX + r.width * 0.24, y: r.minY + r.height * 0.62,
                                                   width: largeur, height: r.height * 0.34)).fill()
        StickerTemplateDrawing.dropPath(in: CGRect(x: r.minX + r.width * 0.58, y: r.minY + r.height * 0.68,
                                                   width: largeur, height: r.height * 0.32)).fill()
    }

    /// « z z Z » — trois lettres qui grandissent en montant vers la droite,
    /// dessinées en police arrondie : un symbole SF « zzz » figerait le tracé.
    @MainActor
    private static func sleepZs(in r: CGRect, color: UIColor) {
        let rapports: [CGFloat] = [0.34, 0.46, 0.62]
        for (index, rapport) in rapports.enumerated() {
            let lettre = index == rapports.count - 1 ? "Z" : "z"
            let police = StickerTemplateDrawing.font(size: r.height * rapport, weight: .heavy)
            let taille = StickerTemplateDrawing.measure(lettre, font: police)
            let origine = CGPoint(x: r.minX + r.width * 0.26 * CGFloat(index),
                                  y: r.maxY - r.height * 0.13 * CGFloat(index) - taille.height)
            StickerTemplateDrawing.draw(lettre, font: police, color: color, at: origine)
        }
    }

    /// Un trait brisé — la ligne d'un tracé nerveux.
    @MainActor
    private static func zigzag(in r: CGRect, color: UIColor) {
        let trait = UIBezierPath()
        let sommets = 7
        for index in 0..<sommets {
            let x = r.minX + r.width * CGFloat(index) / CGFloat(sommets - 1)
            let y = index % 2 == 0 ? r.minY + r.height * 0.28 : r.maxY - r.height * 0.28
            let point = CGPoint(x: x, y: y)
            if index == 0 { trait.move(to: point) } else { trait.addLine(to: point) }
        }
        trait.lineWidth = max(1, r.width * 0.11)
        trait.lineCapStyle = .round
        trait.lineJoinStyle = .round
        color.setStroke()
        trait.stroke()
    }

    // MARK: Les cinq cartouches

    private static let moodCards: [MoodCard] = [
        MoodCard(id: StickerTemplateCatalog.ID.moodSad,
                 name: { String(localized: "sticker.template.mood.sad", defaultValue: "Triste", bundle: .module) },
                 haut: StickerTemplatePalette.indigoLight, bas: StickerTemplatePalette.lilac,
                 texte: StickerTemplatePalette.surface,
                 icône: { r in Self.rainingCloud(in: r) }),
        MoodCard(id: StickerTemplateCatalog.ID.moodCalm,
                 name: { String(localized: "sticker.template.mood.calm", defaultValue: "Calme", bundle: .module) },
                 haut: StickerTemplatePalette.surface, bas: StickerTemplatePalette.indigoLight.withAlphaComponent(0.6),
                 texte: StickerTemplatePalette.night,
                 icône: { r in StickerTemplateDrawing.drawSymbol("leaf.fill", in: r, color: StickerTemplatePalette.leaf, weight: .bold) }),
        MoodCard(id: StickerTemplateCatalog.ID.moodTired,
                 name: { String(localized: "sticker.template.mood.tired", defaultValue: "Fatigué·e", bundle: .module) },
                 haut: StickerTemplatePalette.night, bas: StickerTemplatePalette.ink,
                 texte: StickerTemplatePalette.surface,
                 icône: { r in Self.sleepZs(in: r, color: StickerTemplatePalette.indigoLight) }),
        MoodCard(id: StickerTemplateCatalog.ID.moodMotivated,
                 name: { String(localized: "sticker.template.mood.motivated", defaultValue: "Motivé·e", bundle: .module) },
                 haut: StickerTemplatePalette.warmBulb, bas: StickerTemplatePalette.pin,
                 texte: StickerTemplatePalette.surface,
                 icône: { r in StickerTemplateDrawing.drawSymbol("flame.fill", in: r, color: StickerTemplatePalette.surface, weight: .bold) }),
        MoodCard(id: StickerTemplateCatalog.ID.moodStressed,
                 name: { String(localized: "sticker.template.mood.stressed", defaultValue: "Stressé·e", bundle: .module) },
                 haut: StickerTemplatePalette.ink, bas: StickerTemplatePalette.lilac,
                 texte: StickerTemplatePalette.surface,
                 icône: { r in Self.zigzag(in: r, color: StickerTemplatePalette.warmBulb) }),
    ]

    // MARK: - mood.angry / mood.bored — les deux visages nus

    private enum FaceExpression {
        case angry
        case bored
    }

    @MainActor
    private static func faceSize(metrics: StickerTemplateMetrics) -> CGSize {
        // Un visage est un DISQUE et ne porte aucun texte : sa taille ne dépend
        // que du corps, comme le cadran d'horloge.
        let côté = ceil(metrics.fontSize * 2.6)
        return CGSize(width: côté, height: côté)
    }

    @MainActor
    private static func faceLine(from début: CGPoint, to fin: CGPoint, width: CGFloat, color: UIColor) {
        let trait = UIBezierPath()
        trait.move(to: début)
        trait.addLine(to: fin)
        trait.lineWidth = width
        trait.lineCapStyle = .round
        color.setStroke()
        trait.stroke()
    }

    @MainActor
    private static func faceImage(_ expression: FaceExpression, metrics: StickerTemplateMetrics,
                                  screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = faceSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let bord = max(1.5, metrics.fontSize * 0.10)
            let cadre = CGRect(origin: .zero, size: taille).insetBy(dx: bord, dy: bord)
            let disque = UIBezierPath(ovalIn: cadre)
            switch expression {
            case .angry:
                StickerTemplateDrawing.fill(disque, gradientFrom: StickerTemplatePalette.pin,
                                            to: StickerTemplatePalette.loveWarm, in: cadre)
            case .bored:
                StickerTemplatePalette.neutral.setFill()
                disque.fill()
            }
            // Le liseré clair détache le visage d'une photo sombre.
            StickerTemplatePalette.surface.setStroke()
            disque.lineWidth = bord
            disque.stroke()

            let encre = StickerTemplatePalette.ink
            let trait = max(1.5, metrics.fontSize * 0.13)
            func point(_ fx: CGFloat, _ fy: CGFloat) -> CGPoint {
                CGPoint(x: cadre.minX + cadre.width * fx, y: cadre.minY + cadre.height * fy)
            }
            switch expression {
            case .angry:
                // Les sourcils DESCENDENT vers le nez : c'est l'inclinaison, pas
                // la bouche, qui fait la colère.
                Self.faceLine(from: point(0.22, 0.30), to: point(0.42, 0.41), width: trait, color: encre)
                Self.faceLine(from: point(0.78, 0.30), to: point(0.58, 0.41), width: trait, color: encre)
                encre.setFill()
                let œil = trait * 1.15
                for centre in [point(0.35, 0.52), point(0.65, 0.52)] {
                    UIBezierPath(ovalIn: CGRect(x: centre.x - œil / 2, y: centre.y - œil / 2,
                                                width: œil, height: œil)).fill()
                }
                Self.faceLine(from: point(0.32, 0.73), to: point(0.68, 0.73), width: trait, color: encre)
            case .bored:
                // Des yeux mi-clos : deux traits horizontaux, et une bouche
                // plate plus courte que la colère — l'ennui n'appuie sur rien.
                Self.faceLine(from: point(0.24, 0.45), to: point(0.42, 0.45), width: trait, color: encre)
                Self.faceLine(from: point(0.58, 0.45), to: point(0.76, 0.45), width: trait, color: encre)
                Self.faceLine(from: point(0.38, 0.71), to: point(0.62, 0.71), width: trait, color: encre)
            }
        }
    }

    // MARK: - mood.zen — la fleur de lotus

    @MainActor
    private static var zenCaption: String {
        String(localized: "sticker.template.mood.zen", defaultValue: "Zen", bundle: .module)
    }

    @MainActor
    private static func zenLayout(metrics: StickerTemplateMetrics)
        -> (légende: String, police: UIFont, tailleTexte: CGSize, fleur: CGSize, taille: CGSize) {
        let légende = zenCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.70, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let fleur = CGSize(width: metrics.fontSize * 2.4, height: metrics.fontSize * 1.5)
        let taille = CGSize(
            width: ceil(max(fleur.width, tailleTexte.width) + metrics.horizontalPadding * 2),
            height: ceil(metrics.verticalPadding * 2 + fleur.height + metrics.gap * 0.5 + tailleTexte.height)
        )
        return (légende, police, tailleTexte, fleur, taille)
    }

    /// Cinq pétales — une goutte tournée autour du cœur de la fleur — sur un
    /// nénuphar. Tournée par le CONTEXTE, pas par cinq tracés différents : une
    /// seule forme, cinq angles.
    @MainActor
    private static func lotus(in r: CGRect) {
        guard let contexte = UIGraphicsGetCurrentContext() else { return }
        StickerTemplatePalette.leaf.setFill()
        UIBezierPath(ovalIn: CGRect(x: r.minX + r.width * 0.20, y: r.maxY - r.height * 0.18,
                                    width: r.width * 0.60, height: r.height * 0.18)).fill()

        let centre = CGPoint(x: r.midX, y: r.maxY - r.height * 0.12)
        let pétale = CGRect(x: centre.x - r.width * 0.13, y: centre.y - r.height * 0.85,
                            width: r.width * 0.26, height: r.height * 0.85)
        let liseré = max(1, r.width * 0.02)
        // Les pétales du bord d'abord, celui du milieu en dernier : l'ordre de
        // dessin EST la profondeur.
        let pétales: [(angle: CGFloat, couleur: UIColor)] = [
            (-0.95, StickerTemplatePalette.lilac), (0.95, StickerTemplatePalette.lilac),
            (-0.48, StickerTemplatePalette.indigoLight), (0.48, StickerTemplatePalette.indigoLight),
            (0, StickerTemplatePalette.loveWarm),
        ]
        for (angle, couleur) in pétales {
            contexte.saveGState()
            contexte.translateBy(x: centre.x, y: centre.y)
            contexte.rotate(by: angle)
            contexte.translateBy(x: -centre.x, y: -centre.y)
            StickerTemplateDrawing.fillWithOutline(StickerTemplateDrawing.dropPath(in: pétale),
                                                   fill: couleur, outline: StickerTemplatePalette.surface,
                                                   width: liseré)
            contexte.restoreGState()
        }
    }

    @MainActor
    private static func zenSize(metrics: StickerTemplateMetrics) -> CGSize {
        zenLayout(metrics: metrics).taille
    }

    @MainActor
    private static func zenImage(metrics: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = zenLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let carte = UIBezierPath(roundedRect: cadre, cornerRadius: metrics.fontSize * 0.45)
            StickerTemplateDrawing.fill(carte, gradientFrom: StickerTemplatePalette.surface,
                                        to: StickerTemplatePalette.indigoLight.withAlphaComponent(0.55),
                                        in: cadre)
            StickerTemplatePalette.lilac.withAlphaComponent(0.5).setStroke()
            carte.lineWidth = max(1, metrics.fontSize * 0.05)
            carte.stroke()
            Self.lotus(in: CGRect(x: cadre.midX - l.fleur.width / 2, y: metrics.verticalPadding,
                                  width: l.fleur.width, height: l.fleur.height))
            StickerTemplateDrawing.draw(
                l.légende, font: l.police, color: StickerTemplatePalette.night,
                at: CGPoint(x: cadre.midX - l.tailleTexte.width / 2,
                            y: metrics.verticalPadding + l.fleur.height + metrics.gap * 0.5))
        }
    }

    // MARK: - mood.proud — le badge rond à la médaille

    @MainActor
    private static var proudCaption: String {
        String(localized: "sticker.template.mood.proud", defaultValue: "Fier·e", bundle: .module)
    }

    @MainActor
    private static func proudLayout(metrics: StickerTemplateMetrics)
        -> (légende: String, police: UIFont, tailleTexte: CGSize, médaille: CGFloat, taille: CGSize) {
        let légende = proudCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.62, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let médaille = metrics.fontSize * 1.25
        // Un badge est un DISQUE : son diamètre est celui de la plus large des
        // deux contraintes — le mot en largeur, la médaille et le mot en hauteur.
        let diamètre = ceil(max(tailleTexte.width + metrics.horizontalPadding * 2,
                                médaille + metrics.gap * 0.6 + tailleTexte.height + metrics.verticalPadding * 2.4))
        return (légende, police, tailleTexte, médaille, CGSize(width: diamètre, height: diamètre))
    }

    @MainActor
    private static func proudSize(metrics: StickerTemplateMetrics) -> CGSize {
        proudLayout(metrics: metrics).taille
    }

    @MainActor
    private static func proudImage(metrics: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = proudLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1.5, metrics.fontSize * 0.08)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord / 2, dy: bord / 2)
            let disque = UIBezierPath(ovalIn: cadre)
            StickerTemplateDrawing.fill(disque, gradientFrom: StickerTemplatePalette.lilac,
                                        to: StickerTemplatePalette.night, in: cadre)
            StickerTemplatePalette.surface.setStroke()
            disque.lineWidth = bord
            disque.stroke()
            // L'anneau pointillé doré, à l'intérieur du liseré : c'est lui qui
            // fait la médaille d'un simple rond.
            let anneau = UIBezierPath(ovalIn: cadre.insetBy(dx: bord * 2.2, dy: bord * 2.2))
            anneau.lineWidth = max(1, metrics.fontSize * 0.04)
            anneau.setLineDash([bord, bord], count: 2, phase: 0)
            StickerTemplatePalette.warmBulb.setStroke()
            anneau.stroke()

            let hauteurContenu = l.médaille + metrics.gap * 0.6 + l.tailleTexte.height
            let yHaut = (l.taille.height - hauteurContenu) / 2
            StickerTemplateDrawing.drawSymbol(
                "medal.fill",
                in: CGRect(x: cadre.midX - l.médaille / 2, y: yHaut, width: l.médaille, height: l.médaille),
                color: StickerTemplatePalette.warmBulb, weight: .bold)
            StickerTemplateDrawing.draw(
                l.légende, font: l.police, color: StickerTemplatePalette.surface,
                at: CGPoint(x: cadre.midX - l.tailleTexte.width / 2,
                            y: yHaut + l.médaille + metrics.gap * 0.6))
        }
    }

    // MARK: - mood.nostalgic — le polaroid

    @MainActor
    private static var nostalgicCaption: String {
        String(localized: "sticker.template.mood.nostalgic", defaultValue: "Nostalgie", bundle: .module)
    }

    @MainActor
    private static func nostalgicLayout(metrics: StickerTemplateMetrics)
        -> (légende: String, police: UIFont, tailleTexte: CGSize, marge: CGFloat, photo: CGSize, taille: CGSize) {
        let légende = nostalgicCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.58, weight: .semibold)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let marge = metrics.horizontalPadding * 0.7
        let photo = CGSize(width: metrics.fontSize * 2.6, height: metrics.fontSize * 2.1)
        // La marge du bas est PLUS LARGE que les trois autres : c'est elle qui
        // fait le polaroid, et c'est là que la légende s'écrit.
        let taille = CGSize(
            width: ceil(max(photo.width, tailleTexte.width) + marge * 2),
            height: ceil(marge + photo.height + metrics.gap + tailleTexte.height + marge * 1.4)
        )
        return (légende, police, tailleTexte, marge, photo, taille)
    }

    @MainActor
    private static func nostalgicSize(metrics: StickerTemplateMetrics) -> CGSize {
        nostalgicLayout(metrics: metrics).taille
    }

    @MainActor
    private static func nostalgicImage(metrics: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = nostalgicLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let carte = UIBezierPath(roundedRect: cadre, cornerRadius: metrics.fontSize * 0.10)
            StickerTemplatePalette.surface.setFill()
            carte.fill()
            StickerTemplatePalette.lilac.withAlphaComponent(0.5).setStroke()
            carte.lineWidth = max(1, metrics.fontSize * 0.04)
            carte.stroke()

            // La « photo » : un ciel indigo pâle, un soleil et une colline —
            // assez pour dire une image, sans en montrer une.
            let photo = CGRect(x: cadre.midX - l.photo.width / 2, y: l.marge,
                               width: l.photo.width, height: l.photo.height)
            let cheminPhoto = UIBezierPath(rect: photo)
            StickerTemplateDrawing.fill(cheminPhoto, gradientFrom: StickerTemplatePalette.indigoLight,
                                        to: StickerTemplatePalette.lilac, in: photo)
            if let contexte = UIGraphicsGetCurrentContext() {
                contexte.saveGState()
                cheminPhoto.addClip()
                StickerTemplatePalette.warmBulb.setFill()
                let soleil = photo.width * 0.22
                UIBezierPath(ovalIn: CGRect(x: photo.maxX - soleil * 1.5, y: photo.minY + soleil * 0.6,
                                            width: soleil, height: soleil)).fill()
                StickerTemplatePalette.night.withAlphaComponent(0.35).setFill()
                UIBezierPath(ovalIn: CGRect(x: photo.minX - photo.width * 0.2, y: photo.maxY - photo.height * 0.28,
                                            width: photo.width * 1.4, height: photo.height * 0.6)).fill()
                contexte.restoreGState()
            }
            StickerTemplatePalette.indigoLight.setStroke()
            cheminPhoto.lineWidth = max(1, metrics.fontSize * 0.04)
            cheminPhoto.stroke()

            StickerTemplateDrawing.draw(
                l.légende, font: l.police, color: StickerTemplatePalette.night,
                at: CGPoint(x: cadre.midX - l.tailleTexte.width / 2,
                            y: photo.maxY + metrics.gap))
        }
    }

    // MARK: - Le registre de la famille HUMEURS

    static let moodDrawers: [StickerTemplateDrawer] = moodCards.map { moodCardDrawer($0) } + [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.moodAngry,
            name: { String(localized: "sticker.template.mood.angry", defaultValue: "En colère", bundle: .module) },
            measure: { _, m in Self.faceSize(metrics: m) },
            draw: { _, m, échelle in Self.faceImage(.angry, metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.moodBored,
            name: { String(localized: "sticker.template.mood.bored", defaultValue: "Ennui", bundle: .module) },
            measure: { _, m in Self.faceSize(metrics: m) },
            draw: { _, m, échelle in Self.faceImage(.bored, metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.moodZen,
            name: { Self.zenCaption },
            measure: { _, m in Self.zenSize(metrics: m) },
            draw: { _, m, échelle in Self.zenImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.moodProud,
            name: { Self.proudCaption },
            measure: { _, m in Self.proudSize(metrics: m) },
            draw: { _, m, échelle in Self.proudImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.moodNostalgic,
            name: { Self.nostalgicCaption },
            measure: { _, m in Self.nostalgicSize(metrics: m) },
            draw: { _, m, échelle in Self.nostalgicImage(metrics: m, screenScale: échelle) }),
    ]
}
