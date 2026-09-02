import Foundation
import CoreText
import UIKit
import MeeshySDK

// MARK: - Les dix décorations de RÉACTION (#4820)

/// Ici la TYPOGRAPHIE fait le sticker. Trois gabarits sont un mot NU — pas de
/// fond, un halo `surface` autour des lettres pour tenir sur une photo sombre ;
/// les sept autres posent le mot sur une silhouette qui dit la réaction :
/// disque pour un verdict, hexagone pour un badge, éclat pour un bravo, bulle
/// de pensée pour un « Oups ». La légende vient de `String(localized:)`, donc
/// de la langue du LECTEUR.
extension StickerTemplateRenderer {

    // MARK: Le mot nu — halo, dégradé, inclinaison

    private struct WordLayout {
        let police: UIFont
        let tailleTexte: CGSize
        /// L'épaisseur du halo `surface` ; la boîte l'inclut, sinon les
        /// lettres déborderaient du PNG de leur propre contour.
        let contour: CGFloat
        let taille: CGSize
    }

    /// La boîte d'un mot nu, éventuellement INCLINÉ de `tilt` radians : la
    /// boîte enveloppe le rectangle tourné, pas le rectangle droit — un « MDR »
    /// penché coupé aux coins ne serait plus un sticker.
    @MainActor
    private static func wordLayout(_ mot: String, police: UIFont, metrics: StickerTemplateMetrics,
                                   tilt: CGFloat = 0, extraHeight: CGFloat = 0) -> WordLayout {
        let tailleTexte = StickerTemplateDrawing.measure(mot, font: police)
        let contour = metrics.fontSize * 0.09
        let c = abs(cos(tilt)), s = abs(sin(tilt))
        let largeur = tailleTexte.width * c + tailleTexte.height * s
        let hauteur = tailleTexte.width * s + tailleTexte.height * c
        let taille = CGSize(
            width: ceil(largeur + contour * 2 + metrics.horizontalPadding * 0.6),
            height: ceil(hauteur + contour * 2 + metrics.verticalPadding * 0.6 + extraHeight)
        )
        return WordLayout(police: police, tailleTexte: tailleTexte, contour: contour, taille: taille)
    }

    /// Le halo : le mot écrit huit fois en `surface`, décalé sur les huit
    /// directions. Quatre laisseraient une encoche à chaque diagonale des
    /// lettres rondes.
    @MainActor
    private static func drawHalo(_ mot: String, font: UIFont, contour: CGFloat, centeredIn cadre: CGRect) {
        let taille = StickerTemplateDrawing.measure(mot, font: font)
        let origine = CGPoint(x: cadre.midX - taille.width / 2, y: cadre.midY - taille.height / 2)
        for index in 0..<8 {
            let angle = CGFloat(index) * .pi / 4
            StickerTemplateDrawing.draw(
                mot, font: font, color: StickerTemplatePalette.surface,
                at: CGPoint(x: origine.x + cos(angle) * contour, y: origine.y + sin(angle) * contour))
        }
    }

    /// Un mot rempli d'un dégradé haut→bas. Core Text plutôt que
    /// `NSString.draw` : seul `CTLineDraw` honore le mode `.clip` du contexte,
    /// qui fait des glyphes un masque pour le dégradé. Le contexte UIKit est
    /// retourné le temps du tracé — Core Text compte ses `y` vers le HAUT.
    @MainActor
    private static func drawGradientWord(_ mot: String, font: UIFont, from haut: UIColor, to bas: UIColor,
                                         centeredIn cadre: CGRect, canvasHeight: CGFloat) {
        let tailleTexte = StickerTemplateDrawing.measure(mot, font: font)
        guard let contexte = UIGraphicsGetCurrentContext(),
              let dégradé = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                       colors: [haut.cgColor, bas.cgColor] as CFArray,
                                       locations: [0, 1])
        else {
            StickerTemplateDrawing.drawCentered(mot, font: font, color: haut, in: cadre)
            return
        }
        let ligne = CTLineCreateWithAttributedString(
            NSAttributedString(string: mot, attributes: [.font: font]))
        let ligneDeBase = cadre.midY - tailleTexte.height / 2 + font.ascender
        contexte.saveGState()
        contexte.translateBy(x: 0, y: canvasHeight)
        contexte.scaleBy(x: 1, y: -1)
        contexte.textMatrix = .identity
        contexte.setTextDrawingMode(.clip)
        contexte.textPosition = CGPoint(x: cadre.midX - tailleTexte.width / 2,
                                        y: canvasHeight - ligneDeBase)
        CTLineDraw(ligne, contexte)
        contexte.drawLinearGradient(dégradé,
                                    start: CGPoint(x: cadre.midX, y: canvasHeight - cadre.minY),
                                    end: CGPoint(x: cadre.midX, y: canvasHeight - cadre.maxY),
                                    options: [])
        contexte.restoreGState()
    }

    /// Exécute `dessin` dans un contexte tourné de `angle` autour de `centre`,
    /// puis le remet d'aplomb : la rotation ne fuit jamais sur ce qu'un gabarit
    /// dessine ensuite.
    @MainActor
    private static func tilted(by angle: CGFloat, around centre: CGPoint, _ dessin: () -> Void) {
        guard let contexte = UIGraphicsGetCurrentContext() else { dessin(); return }
        contexte.saveGState()
        contexte.translateBy(x: centre.x, y: centre.y)
        contexte.rotate(by: angle)
        contexte.translateBy(x: -centre.x, y: -centre.y)
        dessin()
        contexte.restoreGState()
    }

    // MARK: - reaction.lol — le mot en dégradé ambre

    @MainActor
    private static var lolCaption: String {
        String(localized: "sticker.template.reaction.lol", defaultValue: "LOL", bundle: .module)
    }

    @MainActor
    private static func lolLayout(metrics: StickerTemplateMetrics) -> WordLayout {
        wordLayout(lolCaption,
                   police: StickerTemplateDrawing.font(size: metrics.fontSize * 1.5, weight: .heavy),
                   metrics: metrics)
    }

    @MainActor
    private static func lolSize(metrics: StickerTemplateMetrics) -> CGSize {
        lolLayout(metrics: metrics).taille
    }

    @MainActor
    private static func lolImage(metrics: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = lolLayout(metrics: metrics)
        let mot = lolCaption
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            Self.drawHalo(mot, font: l.police, contour: l.contour, centeredIn: cadre)
            Self.drawGradientWord(mot, font: l.police,
                                  from: StickerTemplatePalette.warmBulb, to: StickerTemplatePalette.pin,
                                  centeredIn: cadre, canvasHeight: l.taille.height)
        }
    }

    // MARK: - reaction.mdr — le mot rose, penché

    /// −8° : assez pour dire le rire, pas assez pour gêner la lecture.
    private static let mdrTilt: CGFloat = -8 * .pi / 180

    @MainActor
    private static var mdrCaption: String {
        String(localized: "sticker.template.reaction.mdr", defaultValue: "MDR", bundle: .module)
    }

    @MainActor
    private static func mdrLayout(metrics: StickerTemplateMetrics) -> WordLayout {
        wordLayout(mdrCaption,
                   police: StickerTemplateDrawing.font(size: metrics.fontSize * 1.5, weight: .heavy),
                   metrics: metrics, tilt: mdrTilt)
    }

    @MainActor
    private static func mdrSize(metrics: StickerTemplateMetrics) -> CGSize {
        mdrLayout(metrics: metrics).taille
    }

    @MainActor
    private static func mdrImage(metrics: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = mdrLayout(metrics: metrics)
        let mot = mdrCaption
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            Self.tilted(by: Self.mdrTilt, around: CGPoint(x: cadre.midX, y: cadre.midY)) {
                Self.drawHalo(mot, font: l.police, contour: l.contour, centeredIn: cadre)
                StickerTemplateDrawing.drawCentered(mot, font: l.police,
                                                    color: StickerTemplatePalette.loveWarm, in: cadre)
            }
        }
    }

    // MARK: - reaction.hundred — « 100 » souligné deux fois

    @MainActor
    private static var hundredCaption: String {
        String(localized: "sticker.template.reaction.hundred", defaultValue: "100", bundle: .module)
    }

    /// L'épaisseur d'un trait de soulignement, et ce que les deux traits
    /// ajoutent sous le chiffre — dans la MESURE, pour que la boîte les
    /// contienne.
    private static func hundredStroke(metrics: StickerTemplateMetrics) -> (trait: CGFloat, sous: CGFloat) {
        let trait = metrics.fontSize * 0.08
        return (trait, metrics.gap * 0.3 + trait * 3.4)
    }

    @MainActor
    private static func hundredLayout(metrics: StickerTemplateMetrics) -> WordLayout {
        wordLayout(hundredCaption,
                   police: StickerTemplateDrawing.digitFont(size: metrics.fontSize * 1.4, weight: .heavy),
                   metrics: metrics, extraHeight: hundredStroke(metrics: metrics).sous)
    }

    @MainActor
    private static func hundredSize(metrics: StickerTemplateMetrics) -> CGSize {
        hundredLayout(metrics: metrics).taille
    }

    @MainActor
    private static func hundredImage(metrics: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = hundredLayout(metrics: metrics)
        let mot = hundredCaption
        let (trait, sous) = hundredStroke(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadreMot = CGRect(x: 0, y: 0, width: l.taille.width, height: l.taille.height - sous)
            Self.drawHalo(mot, font: l.police, contour: l.contour, centeredIn: cadreMot)
            StickerTemplateDrawing.drawCentered(mot, font: l.police,
                                                color: StickerTemplatePalette.pin, in: cadreMot)

            // Deux traits, le second plus court : un seul serait un soulignement,
            // deux sont une insistance.
            let yPremier = cadreMot.midY + l.tailleTexte.height / 2 + metrics.gap * 0.3 + trait / 2
            let largeurs: [(y: CGFloat, largeur: CGFloat)] = [
                (yPremier, l.tailleTexte.width),
                (yPremier + trait * 2.2, l.tailleTexte.width * 0.62),
            ]
            for ligne in largeurs {
                let halo = UIBezierPath()
                halo.move(to: CGPoint(x: cadreMot.midX - ligne.largeur / 2, y: ligne.y))
                halo.addLine(to: CGPoint(x: cadreMot.midX + ligne.largeur / 2, y: ligne.y))
                halo.lineCapStyle = .round
                halo.lineWidth = trait + l.contour * 2
                StickerTemplatePalette.surface.setStroke()
                halo.stroke()
                halo.lineWidth = trait
                StickerTemplatePalette.pin.setStroke()
                halo.stroke()
            }
        }
    }

    // MARK: - reaction.gg — le badge hexagonal

    /// Un hexagone à côtés plats en haut et en bas — un sommet à droite, un à
    /// gauche : la forme d'un badge de jeu, pas d'un panneau routier.
    private static func hexagonPath(in rect: CGRect) -> UIBezierPath {
        let centre = CGPoint(x: rect.midX, y: rect.midY)
        let rayon = rect.width / 2
        let chemin = UIBezierPath()
        for index in 0..<6 {
            let angle = CGFloat(index) * .pi / 3
            let point = CGPoint(x: centre.x + cos(angle) * rayon, y: centre.y + sin(angle) * rayon)
            if index == 0 { chemin.move(to: point) } else { chemin.addLine(to: point) }
        }
        chemin.close()
        return chemin
    }

    @MainActor
    private static var ggCaption: String {
        String(localized: "sticker.template.reaction.gg", defaultValue: "GG", bundle: .module)
    }

    @MainActor
    private static func ggLayout(metrics: StickerTemplateMetrics) -> (police: UIFont, contour: CGFloat, taille: CGSize) {
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 1.1, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(ggCaption, font: police)
        let contour = metrics.fontSize * 0.07
        // Un hexagone régulier est haut de 0,866 fois sa largeur ; le mot
        // fixe la largeur, la géométrie fixe la hauteur.
        let largeur = ceil(max(metrics.fontSize * 2.8, tailleTexte.width + metrics.horizontalPadding * 2.4) + contour * 2)
        let hauteur = ceil(largeur * 0.866)
        return (police, contour, CGSize(width: largeur, height: hauteur))
    }

    @MainActor
    private static func ggSize(metrics: StickerTemplateMetrics) -> CGSize {
        ggLayout(metrics: metrics).taille
    }

    @MainActor
    private static func ggImage(metrics: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = ggLayout(metrics: metrics)
        let mot = ggCaption
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: l.contour, dy: l.contour)
            StickerTemplateDrawing.fillWithOutline(
                Self.hexagonPath(in: cadre),
                gradientFrom: StickerTemplatePalette.accent, to: StickerTemplatePalette.night,
                in: cadre, outline: StickerTemplatePalette.surface, width: l.contour)
            StickerTemplateDrawing.drawCentered(mot, font: l.police,
                                                color: StickerTemplatePalette.surface, in: cadre)
        }
    }

    // MARK: - reaction.ok / .no / .yes — les disques à verdict

    /// Un disque, un symbole en haut, le mot en bas : trois verdicts, une seule
    /// géométrie. Le disque est CARRÉ et s'élargit au mot le plus long — un
    /// « Nein » ne doit pas déborder d'un cercle taillé pour « No ».
    private struct ReactionDisc {
        let id: String
        let name: @MainActor () -> String
        let symbole: String
        let haut: UIColor
        let bas: UIColor
    }

    private struct DiscLayout {
        let police: UIFont
        let tailleTexte: CGSize
        let glyphe: CGFloat
        let contour: CGFloat
        let taille: CGSize
    }

    @MainActor
    private static func discLayout(_ disque: ReactionDisc, metrics: StickerTemplateMetrics) -> DiscLayout {
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.70, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(disque.name(), font: police)
        let glyphe = metrics.fontSize * 0.95
        let contour = metrics.fontSize * 0.07
        let diamètre = ceil(max(metrics.fontSize * 3.0,
                                tailleTexte.width + metrics.horizontalPadding * 2,
                                glyphe + tailleTexte.height + metrics.verticalPadding * 2.4)
                            + contour * 2)
        return DiscLayout(police: police, tailleTexte: tailleTexte, glyphe: glyphe, contour: contour,
                          taille: CGSize(width: diamètre, height: diamètre))
    }

    @MainActor
    private static func discSize(_ disque: ReactionDisc, metrics: StickerTemplateMetrics) -> CGSize {
        discLayout(disque, metrics: metrics).taille
    }

    @MainActor
    private static func discImage(_ disque: ReactionDisc, metrics: StickerTemplateMetrics,
                                  screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = discLayout(disque, metrics: metrics)
        let légende = disque.name()
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: l.contour, dy: l.contour)
            StickerTemplateDrawing.fillWithOutline(
                UIBezierPath(ovalIn: cadre),
                gradientFrom: disque.haut, to: disque.bas,
                in: cadre, outline: StickerTemplatePalette.surface, width: l.contour)

            let bloc = l.glyphe + metrics.gap * 0.4 + l.tailleTexte.height
            let yHaut = cadre.midY - bloc / 2
            StickerTemplateDrawing.drawSymbol(
                disque.symbole,
                in: CGRect(x: cadre.midX - l.glyphe / 2, y: yHaut, width: l.glyphe, height: l.glyphe),
                color: StickerTemplatePalette.surface, weight: .bold)
            StickerTemplateDrawing.draw(
                légende, font: l.police, color: StickerTemplatePalette.surface,
                at: CGPoint(x: cadre.midX - l.tailleTexte.width / 2,
                            y: yHaut + l.glyphe + metrics.gap * 0.4))
        }
    }

    private static func discDrawer(_ disque: ReactionDisc) -> StickerTemplateDrawer {
        StickerTemplateDrawer(
            id: disque.id,
            name: { disque.name() },
            measure: { _, m in Self.discSize(disque, metrics: m) },
            draw: { _, m, échelle in Self.discImage(disque, metrics: m, screenScale: échelle) })
    }

    private static let discs: [ReactionDisc] = [
        ReactionDisc(id: StickerTemplateCatalog.ID.reactionOk,
                     name: { String(localized: "sticker.template.reaction.ok", defaultValue: "OK", bundle: .module) },
                     symbole: "checkmark",
                     haut: StickerTemplatePalette.leaf, bas: StickerTemplatePalette.sky),
        ReactionDisc(id: StickerTemplateCatalog.ID.reactionNo,
                     name: { String(localized: "sticker.template.reaction.no", defaultValue: "Non", bundle: .module) },
                     symbole: "xmark",
                     haut: StickerTemplatePalette.pin, bas: StickerTemplatePalette.loveCool),
        ReactionDisc(id: StickerTemplateCatalog.ID.reactionYes,
                     name: { String(localized: "sticker.template.reaction.yes", defaultValue: "Oui", bundle: .module) },
                     symbole: "checkmark.circle.fill",
                     haut: StickerTemplatePalette.leaf, bas: StickerTemplatePalette.accent),
    ]

    // MARK: - reaction.top — la pastille au pouce levé

    @MainActor
    private static var topCaption: String {
        String(localized: "sticker.template.reaction.top", defaultValue: "TOP", bundle: .module)
    }

    private static let topGlyph = StickerTemplateDrawing.Glyph.symbol("hand.thumbsup.fill")

    @MainActor
    private static func topSize(metrics: StickerTemplateMetrics) -> CGSize {
        StickerTemplateDrawing.captionLayout(caption: topCaption, glyph: topGlyph, metrics: metrics).taille
    }

    @MainActor
    private static func topImage(metrics: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let légende = topCaption
        let l = StickerTemplateDrawing.captionLayout(caption: légende, glyph: topGlyph, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let contour = metrics.fontSize * 0.06
            let pastille = StickerTemplateDrawing.pillPath(in: cadre.insetBy(dx: contour, dy: contour))
            StickerTemplateDrawing.fillWithOutline(
                pastille,
                gradientFrom: StickerTemplatePalette.warmBulb, to: StickerTemplatePalette.pin,
                in: cadre, outline: StickerTemplatePalette.surface, width: contour)
            StickerTemplateDrawing.drawCaptionContent(
                l, caption: légende, glyph: Self.topGlyph, metrics: metrics, in: cadre,
                textColor: StickerTemplatePalette.surface, glyphColor: StickerTemplatePalette.surface)
        }
    }

    // MARK: - reaction.bravo — l'éclat

    @MainActor
    private static var bravoCaption: String {
        String(localized: "sticker.template.reaction.bravo", defaultValue: "Bravo", bundle: .module)
    }

    @MainActor
    private static func bravoLayout(metrics: StickerTemplateMetrics) -> (police: UIFont, contour: CGFloat, taille: CGSize) {
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.82, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(bravoCaption, font: police)
        let contour = metrics.fontSize * 0.07
        // L'éclat est rond : le mot doit tenir dans son cercle INTÉRIEUR
        // (0,78 du rayon), d'où la marge d'une moitié en plus sur sa largeur.
        let côté = ceil(max(metrics.fontSize * 3.4,
                            tailleTexte.width * 1.5 + metrics.horizontalPadding)
                        + contour * 2)
        return (police, contour, CGSize(width: côté, height: côté))
    }

    @MainActor
    private static func bravoSize(metrics: StickerTemplateMetrics) -> CGSize {
        bravoLayout(metrics: metrics).taille
    }

    @MainActor
    private static func bravoImage(metrics: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = bravoLayout(metrics: metrics)
        let légende = bravoCaption
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: l.contour, dy: l.contour)
            StickerTemplateDrawing.fillWithOutline(
                StickerTemplateDrawing.burstPath(in: cadre),
                gradientFrom: StickerTemplatePalette.accent, to: StickerTemplatePalette.loveCool,
                in: cadre, outline: StickerTemplatePalette.surface, width: l.contour)
            StickerTemplateDrawing.drawCentered(légende, font: l.police,
                                                color: StickerTemplatePalette.surface, in: cadre)
        }
    }

    // MARK: - reaction.oops — la bulle de pensée

    @MainActor
    private static var oopsCaption: String {
        String(localized: "sticker.template.reaction.oops", defaultValue: "Oups", bundle: .module)
    }

    @MainActor
    private static func oopsLayout(metrics: StickerTemplateMetrics)
        -> (police: UIFont, contour: CGFloat, queue: CGFloat, taille: CGSize) {
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.80, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(oopsCaption, font: police)
        let contour = metrics.fontSize * 0.07
        let queue = metrics.fontSize * 0.9
        let corpsLargeur = tailleTexte.width + metrics.horizontalPadding * 2.4
        // Le nuage de `cloudPath` pose ses disques en fractions de la LARGEUR :
        // sous 0,62 de hauteur pour une largeur, ils déborderaient du corps.
        let corpsHauteur = max(tailleTexte.height + metrics.verticalPadding * 2.4, corpsLargeur * 0.62)
        let taille = CGSize(width: ceil(corpsLargeur + contour * 2),
                            height: ceil(corpsHauteur + queue + contour * 2))
        return (police, contour, queue, taille)
    }

    @MainActor
    private static func oopsSize(metrics: StickerTemplateMetrics) -> CGSize {
        oopsLayout(metrics: metrics).taille
    }

    @MainActor
    private static func oopsImage(metrics: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = oopsLayout(metrics: metrics)
        let légende = oopsCaption
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: l.contour, dy: l.contour)
            StickerTemplateDrawing.fillWithOutline(
                StickerTemplateDrawing.thoughtBubblePath(in: cadre, tail: l.queue),
                fill: StickerTemplatePalette.surface, outline: StickerTemplatePalette.lilac,
                width: l.contour)
            // Le mot se centre sur le SOCLE du nuage, pas sur son enveloppe :
            // les disques du haut sont du volume, pas de la place pour lire.
            let corps = CGRect(x: cadre.minX, y: cadre.minY,
                               width: cadre.width, height: cadre.height - l.queue)
            StickerTemplateDrawing.drawCentered(
                légende, font: l.police, color: StickerTemplatePalette.label,
                in: CGRect(x: corps.minX, y: corps.minY + corps.height * 0.12,
                           width: corps.width, height: corps.height * 0.88))
        }
    }

    // MARK: - Le registre de la famille RÉACTIONS

    /// L'ordre de la palette : les mots nus d'abord, les verdicts, puis les
    /// silhouettes — trois listes, parce qu'une seule expression de dix
    /// fermetures fatiguerait l'inférence de types pour rien.
    private static let wordDrawers: [StickerTemplateDrawer] = [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.reactionLol,
            name: { Self.lolCaption },
            measure: { _, m in Self.lolSize(metrics: m) },
            draw: { _, m, échelle in Self.lolImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.reactionMdr,
            name: { Self.mdrCaption },
            measure: { _, m in Self.mdrSize(metrics: m) },
            draw: { _, m, échelle in Self.mdrImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.reactionHundred,
            name: { Self.hundredCaption },
            measure: { _, m in Self.hundredSize(metrics: m) },
            draw: { _, m, échelle in Self.hundredImage(metrics: m, screenScale: échelle) }),
    ]

    private static let shapeDrawers: [StickerTemplateDrawer] = [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.reactionGg,
            name: { Self.ggCaption },
            measure: { _, m in Self.ggSize(metrics: m) },
            draw: { _, m, échelle in Self.ggImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.reactionTop,
            name: { Self.topCaption },
            measure: { _, m in Self.topSize(metrics: m) },
            draw: { _, m, échelle in Self.topImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.reactionBravo,
            name: { Self.bravoCaption },
            measure: { _, m in Self.bravoSize(metrics: m) },
            draw: { _, m, échelle in Self.bravoImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.reactionOops,
            name: { Self.oopsCaption },
            measure: { _, m in Self.oopsSize(metrics: m) },
            draw: { _, m, échelle in Self.oopsImage(metrics: m, screenScale: échelle) }),
    ]

    static let reactionDrawers: [StickerTemplateDrawer] =
        wordDrawers + discs.map(discDrawer) + shapeDrawers
}
