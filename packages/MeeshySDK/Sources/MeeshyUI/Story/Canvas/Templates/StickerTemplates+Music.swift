import Foundation
import UIKit
import MeeshySDK

// MARK: - Les dix décorations de MUSIQUE (#4820)

/// Ce qu'on écoute — huit OBJETS tracés nus (la note, le casque, le vinyle, la
/// guitare, le micro, le clavier, l'enceinte, le poste) et deux CARTOUCHES
/// (les barres d'égaliseur, « En écoute »). Dix cartouches au glyphe près se
/// ressembleraient trop pour se distinguer du coin de l'œil dans la palette :
/// c'est la SILHOUETTE, pas la couleur, qui identifie une décoration.
///
/// Tout est tracé en Bézier, sans un seul emoji ni symbole SF : un vinyle emoji
/// change de dessin d'une version d'iOS à l'autre, et une décoration doit se
/// rendre pareil sur iOS 16 et sur iOS 26 — la raison même pour laquelle
/// `heartPath` existe.
///
/// La famille est la plus ANIMÉE du catalogue, et c'est voulu : la musique est
/// du mouvement, un vinyle immobile a l'air en panne. Le mouvement est appliqué
/// PAR-DESSUS le raster (`StickerAnimation`) — ici on dessine la pose au repos,
/// donc chaque objet est dessiné dans l'attitude qui rend son geste lisible :
/// le disque a son reflet, les barres ont des hauteurs INÉGALES, l'aiguille du
/// poste est posée de biais.
///
/// Aucun emplacement : un TITRE écrit par l'auteur relève de la famille TEXTE.
/// Les mots dessinés appartiennent donc au GABARIT, pas à l'auteur — ils
/// viennent de `String(localized:)` à clé LITTÉRALE, et le LECTEUR lit
/// « Now playing » là où l'auteur a posé « En écoute ».
extension StickerTemplateRenderer {

    // MARK: - Le patron des objets nus

    /// Un motif posé seul : ses dimensions se déclarent en CORPS (`fontSize`),
    /// jamais en points — sans quoi la décoration ne grandirait pas avec
    /// l'échelle de l'auteur.
    private struct MusicMotif {
        let id: String
        /// Une clé LITTÉRALE par motif : une clé construite serait invisible au
        /// catalogue de chaînes, donc jamais traduite.
        let name: @MainActor () -> String
        let largeur: CGFloat
        let hauteur: CGFloat
        let dessin: @MainActor (CGRect) -> Void
    }

    /// La marge que le raster garde AUTOUR du motif.
    ///
    /// `fillWithOutline` trace à `lineWidth = trait * 2` : la moitié externe du
    /// liseré déborde de la forme. Sans cette rentrée, tout objet qui épouse le
    /// bord se ferait couper net — un défaut qui ne se voit qu'à l'export.
    private static let musicBleed: CGFloat = 0.06

    /// La mesure UNIQUE des motifs, servie à `measure` comme à `draw` : deux
    /// calculs feraient dériver la cible de tap du pixel dessiné.
    @MainActor
    private static func musicMotifSize(_ motif: MusicMotif,
                                       metrics m: StickerTemplateMetrics) -> CGSize {
        CGSize(width: ceil(m.fontSize * motif.largeur),
               height: ceil(m.fontSize * motif.hauteur))
    }

    @MainActor
    private static func musicMotifImage(_ motif: MusicMotif, metrics m: StickerTemplateMetrics,
                                        screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = musicMotifSize(motif, metrics: m)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            motif.dessin(CGRect(origin: .zero, size: taille)
                .insetBy(dx: taille.width * Self.musicBleed, dy: taille.height * Self.musicBleed))
        }
    }

    private static func musicMotifDrawer(_ motif: MusicMotif) -> StickerTemplateDrawer {
        StickerTemplateDrawer(
            id: motif.id,
            name: motif.name,
            measure: { _, m in Self.musicMotifSize(motif, metrics: m) },
            draw: { _, m, échelle in Self.musicMotifImage(motif, metrics: m, screenScale: échelle) })
    }

    // MARK: - music.note — la croche

    /// Tête inclinée, hampe, drapeau : une note DROITE se lit comme un « d »
    /// minuscule. L'inclinaison est ce qui fait lire une note.
    @MainActor
    private static func musicNoteArt(in r: CGRect) {
        let l = r.width, h = r.height
        let trait = max(1, l * 0.06)
        let hampeX = r.minX + l * 0.56
        let hampeLargeur = l * 0.11
        let note = UIBezierPath(roundedRect: CGRect(x: hampeX, y: r.minY + h * 0.04,
                                                    width: hampeLargeur, height: h * 0.78),
                                cornerRadius: hampeLargeur * 0.5)

        let drapeau = UIBezierPath()
        drapeau.move(to: CGPoint(x: hampeX + hampeLargeur, y: r.minY + h * 0.05))
        drapeau.addCurve(to: CGPoint(x: r.maxX - l * 0.04, y: r.minY + h * 0.40),
                         controlPoint1: CGPoint(x: r.maxX, y: r.minY + h * 0.11),
                         controlPoint2: CGPoint(x: r.maxX, y: r.minY + h * 0.27))
        drapeau.addCurve(to: CGPoint(x: hampeX + hampeLargeur, y: r.minY + h * 0.30),
                         controlPoint1: CGPoint(x: r.maxX - l * 0.12, y: r.minY + h * 0.23),
                         controlPoint2: CGPoint(x: hampeX + hampeLargeur * 2, y: r.minY + h * 0.22))
        drapeau.close()
        note.append(drapeau)

        let têteL = l * 0.62, têteH = h * 0.26
        let tête = UIBezierPath(ovalIn: CGRect(x: -têteL / 2, y: -têteH / 2,
                                               width: têteL, height: têteH))
        var repère = CGAffineTransform(translationX: hampeX + hampeLargeur / 2 - têteL * 0.34,
                                       y: r.minY + h * 0.80)
        repère = repère.rotated(by: -CGFloat.pi / 10)
        tête.apply(repère)
        note.append(tête)

        StickerTemplateDrawing.fillWithOutline(note, gradientFrom: StickerTemplatePalette.accent,
                                               to: StickerTemplatePalette.loveCool, in: r,
                                               outline: StickerTemplatePalette.surface,
                                               width: trait * 0.5)
    }

    // MARK: - music.headphones — le casque

    /// L'arceau est tracé DEUX fois — clair dessous, accent dessus — plutôt que
    /// rempli : un arc épais posé sur une photo sombre disparaît sans son
    /// liseré.
    @MainActor
    private static func musicHeadphonesArt(in r: CGRect) {
        let l = r.width, h = r.height
        let trait = max(1.5, l * 0.05)
        let rayon = l * 0.34
        let centre = CGPoint(x: r.midX, y: r.minY + h * 0.58)

        let arceau = UIBezierPath(arcCenter: centre, radius: rayon,
                                  startAngle: CGFloat.pi, endAngle: 2 * CGFloat.pi, clockwise: true)
        arceau.lineCapStyle = .round
        arceau.lineWidth = trait * 3.0
        StickerTemplatePalette.surface.setStroke()
        arceau.stroke()
        arceau.lineWidth = trait * 1.9
        StickerTemplatePalette.accent.setStroke()
        arceau.stroke()

        let coussinL = l * 0.24, coussinH = h * 0.42
        for côté in [CGFloat(-1), CGFloat(1)] {
            let cadre = CGRect(x: centre.x + côté * rayon - coussinL / 2,
                               y: centre.y - coussinH * 0.14,
                               width: coussinL, height: coussinH)
            StickerTemplateDrawing.fillWithOutline(
                UIBezierPath(roundedRect: cadre, cornerRadius: coussinL * 0.42),
                gradientFrom: StickerTemplatePalette.lilac, to: StickerTemplatePalette.night,
                in: cadre, outline: StickerTemplatePalette.surface, width: trait * 0.5)
        }
    }

    // MARK: - music.vinyl — le disque

    /// Sillons, étiquette, trou et un quart de reflet. Le reflet n'est pas un
    /// ornement : c'est lui qui donne au disque un HAUT, donc une rotation
    /// visible quand `.spin` le fait tourner.
    @MainActor
    private static func musicVinylArt(in r: CGRect) {
        let côté = min(r.width, r.height)
        let trait = max(1.5, côté * 0.05)
        let cadre = CGRect(x: r.midX - côté / 2, y: r.midY - côté / 2, width: côté, height: côté)

        let disque = UIBezierPath(ovalIn: cadre)
        StickerTemplateDrawing.fill(disque, gradientFrom: StickerTemplatePalette.night,
                                    to: StickerTemplatePalette.ink, in: cadre)
        StickerTemplatePalette.surface.setStroke()
        disque.lineWidth = trait
        disque.stroke()

        StickerTemplatePalette.surface.withAlphaComponent(0.28).setStroke()
        for index in 1...4 {
            let creux = côté * CGFloat(index) * 0.055
            let sillon = UIBezierPath(ovalIn: cadre.insetBy(dx: creux, dy: creux))
            sillon.lineWidth = trait * 0.35
            sillon.stroke()
        }

        let reflet = UIBezierPath(arcCenter: CGPoint(x: cadre.midX, y: cadre.midY),
                                  radius: côté * 0.38,
                                  startAngle: -3 * CGFloat.pi / 4, endAngle: -CGFloat.pi / 3,
                                  clockwise: true)
        reflet.lineWidth = trait * 0.9
        reflet.lineCapStyle = .round
        StickerTemplatePalette.surface.withAlphaComponent(0.60).setStroke()
        reflet.stroke()

        let étiquette = cadre.insetBy(dx: côté * 0.32, dy: côté * 0.32)
        StickerTemplateDrawing.fillWithOutline(UIBezierPath(ovalIn: étiquette),
                                               gradientFrom: StickerTemplatePalette.pin,
                                               to: StickerTemplatePalette.loveCool, in: étiquette,
                                               outline: StickerTemplatePalette.surface,
                                               width: trait * 0.4)
        let trou = côté * 0.07
        StickerTemplatePalette.surface.setFill()
        UIBezierPath(ovalIn: CGRect(x: cadre.midX - trou / 2, y: cadre.midY - trou / 2,
                                    width: trou, height: trou)).fill()
    }

    // MARK: - music.guitar — la guitare

    /// Manche et tête d'abord, caisse ensuite : le corps RECOUVRE la naissance
    /// du manche, comme sur l'instrument. L'ordre inverse ferait une raquette.
    @MainActor
    private static func musicGuitarArt(in r: CGRect) {
        let l = r.width, h = r.height
        let trait = max(1.5, l * 0.05)

        StickerTemplatePalette.night.setFill()
        UIBezierPath(roundedRect: CGRect(x: r.minX + l * 0.42, y: r.minY + h * 0.09,
                                         width: l * 0.16, height: h * 0.52),
                     cornerRadius: l * 0.04).fill()
        StickerTemplateDrawing.fillWithOutline(
            UIBezierPath(roundedRect: CGRect(x: r.minX + l * 0.33, y: r.minY + h * 0.02,
                                             width: l * 0.34, height: h * 0.12),
                         cornerRadius: l * 0.05),
            fill: StickerTemplatePalette.ink,
            outline: StickerTemplatePalette.surface, width: trait * 0.4)

        // Les deux bouts se recouvrent : leur union en enroulement NON NUL
        // dessine la taille de la caisse sans qu'aucun arc intérieur ne sorte.
        let caisse = UIBezierPath(ovalIn: CGRect(x: r.minX + l * 0.16, y: r.minY + h * 0.44,
                                                 width: l * 0.68, height: h * 0.26))
        caisse.append(UIBezierPath(ovalIn: CGRect(x: r.minX + l * 0.04, y: r.minY + h * 0.60,
                                                  width: l * 0.92, height: h * 0.38)))
        StickerTemplateDrawing.fillWithOutline(caisse, gradientFrom: StickerTemplatePalette.warmBulb,
                                               to: StickerTemplatePalette.pin, in: r,
                                               outline: StickerTemplatePalette.surface,
                                               width: trait * 0.5)

        let rosace = l * 0.22
        StickerTemplatePalette.night.setFill()
        UIBezierPath(ovalIn: CGRect(x: r.midX - rosace / 2, y: r.minY + h * 0.70 - rosace / 2,
                                    width: rosace, height: rosace)).fill()
        UIBezierPath(roundedRect: CGRect(x: r.midX - l * 0.15, y: r.minY + h * 0.85,
                                         width: l * 0.30, height: h * 0.04),
                     cornerRadius: h * 0.02).fill()

        StickerTemplatePalette.surface.withAlphaComponent(0.85).setStroke()
        for index in 0..<4 {
            let x = r.midX + l * (CGFloat(index) - 1.5) * 0.045
            let corde = UIBezierPath()
            corde.move(to: CGPoint(x: x, y: r.minY + h * 0.10))
            corde.addLine(to: CGPoint(x: x, y: r.minY + h * 0.86))
            corde.lineWidth = trait * 0.22
            corde.stroke()
        }
    }

    // MARK: - music.mic — le micro

    /// Un micro à main : le corps effilé, la grille striée, la bague chaude qui
    /// sépare les deux. Sans la bague, la tête et le corps se lisent comme un
    /// seul bâton.
    @MainActor
    private static func musicMicArt(in r: CGRect) {
        let l = r.width, h = r.height
        let trait = max(1.5, l * 0.07)

        let corps = UIBezierPath()
        corps.move(to: CGPoint(x: r.minX + l * 0.24, y: r.minY + h * 0.40))
        corps.addLine(to: CGPoint(x: r.maxX - l * 0.24, y: r.minY + h * 0.40))
        corps.addCurve(to: CGPoint(x: r.maxX - l * 0.34, y: r.maxY - h * 0.02),
                       controlPoint1: CGPoint(x: r.maxX - l * 0.26, y: r.minY + h * 0.70),
                       controlPoint2: CGPoint(x: r.maxX - l * 0.32, y: r.maxY - h * 0.14))
        corps.addLine(to: CGPoint(x: r.minX + l * 0.34, y: r.maxY - h * 0.02))
        corps.addCurve(to: CGPoint(x: r.minX + l * 0.24, y: r.minY + h * 0.40),
                       controlPoint1: CGPoint(x: r.minX + l * 0.32, y: r.maxY - h * 0.14),
                       controlPoint2: CGPoint(x: r.minX + l * 0.26, y: r.minY + h * 0.70))
        corps.close()
        StickerTemplateDrawing.fillWithOutline(corps, gradientFrom: StickerTemplatePalette.lilac,
                                               to: StickerTemplatePalette.night, in: r,
                                               outline: StickerTemplatePalette.surface,
                                               width: trait * 0.4)

        let tête = CGRect(x: r.minX + l * 0.08, y: r.minY + h * 0.02,
                          width: l * 0.84, height: h * 0.42)
        StickerTemplateDrawing.fillWithOutline(
            UIBezierPath(roundedRect: tête, cornerRadius: tête.width * 0.46),
            gradientFrom: StickerTemplatePalette.indigoLight, to: StickerTemplatePalette.accent,
            in: tête, outline: StickerTemplatePalette.surface, width: trait * 0.4)

        StickerTemplatePalette.night.withAlphaComponent(0.40).setStroke()
        for index in 0..<3 {
            let strie = UIBezierPath()
            let y = tête.minY + tête.height * (0.30 + CGFloat(index) * 0.20)
            strie.move(to: CGPoint(x: tête.minX + tête.width * 0.16, y: y))
            strie.addLine(to: CGPoint(x: tête.maxX - tête.width * 0.16, y: y))
            strie.lineWidth = trait * 0.28
            strie.lineCapStyle = .round
            strie.stroke()
        }

        StickerTemplatePalette.warmBulb.setFill()
        UIBezierPath(roundedRect: CGRect(x: r.minX + l * 0.20, y: r.minY + h * 0.42,
                                         width: l * 0.60, height: h * 0.05),
                     cornerRadius: h * 0.025).fill()
    }

    // MARK: - music.piano — le clavier

    /// Sept blanches, cinq noires — le motif d'une octave. Le nombre est DONNÉ,
    /// pas déduit d'une largeur : un clavier tronqué en plein milieu d'un dièse
    /// se lit comme une erreur de rendu.
    @MainActor
    private static func musicPianoArt(in r: CGRect) {
        let trait = max(1, r.width * 0.025)
        let caisse = UIBezierPath(roundedRect: r, cornerRadius: r.height * 0.16)
        StickerTemplateDrawing.fill(caisse, gradientFrom: StickerTemplatePalette.accent,
                                    to: StickerTemplatePalette.night, in: r)
        StickerTemplatePalette.surface.setStroke()
        caisse.lineWidth = trait * 1.6
        caisse.stroke()

        let clavier = CGRect(x: r.minX + r.width * 0.05, y: r.minY + r.height * 0.26,
                             width: r.width * 0.90, height: r.height * 0.64)
        let blanche = clavier.width / 7
        for index in 0..<7 {
            let touche = CGRect(x: clavier.minX + blanche * CGFloat(index) + trait * 0.5,
                                y: clavier.minY, width: blanche - trait, height: clavier.height)
            StickerTemplateDrawing.fillWithOutline(
                UIBezierPath(roundedRect: touche, cornerRadius: blanche * 0.16),
                fill: StickerTemplatePalette.surface, outline: StickerTemplatePalette.hairline,
                width: trait * 0.4)
        }

        let noireL = blanche * 0.58, noireH = clavier.height * 0.60
        for index in [0, 1, 3, 4, 5] {
            let touche = CGRect(x: clavier.minX + blanche * CGFloat(index + 1) - noireL / 2,
                                y: clavier.minY, width: noireL, height: noireH)
            StickerTemplateDrawing.fill(
                UIBezierPath(roundedRect: touche, cornerRadius: noireL * 0.22),
                gradientFrom: StickerTemplatePalette.ink, to: StickerTemplatePalette.night,
                in: touche)
        }
    }

    // MARK: - music.speaker — l'enceinte

    /// Caisson, boomer, tweeter et TROIS ondes. Les ondes ne sont pas un
    /// décor : une enceinte muette n'est qu'une boîte, et c'est la seule chose
    /// que `.shake` fait vibrer aux yeux du lecteur.
    @MainActor
    private static func musicSpeakerArt(in r: CGRect) {
        let l = r.width
        let trait = max(1.5, l * 0.04)
        let caisson = CGRect(x: r.minX, y: r.minY, width: l * 0.60, height: r.height)
            .insetBy(dx: trait, dy: trait)
        StickerTemplateDrawing.fillWithOutline(
            UIBezierPath(roundedRect: caisson, cornerRadius: l * 0.07),
            gradientFrom: StickerTemplatePalette.night, to: StickerTemplatePalette.ink,
            in: caisson, outline: StickerTemplatePalette.surface, width: trait * 0.7)

        let boomer = min(caisson.width * 0.66, caisson.height * 0.44)
        let cadreBoomer = CGRect(x: caisson.midX - boomer / 2,
                                 y: caisson.maxY - caisson.height * 0.10 - boomer,
                                 width: boomer, height: boomer)
        StickerTemplateDrawing.fillWithOutline(UIBezierPath(ovalIn: cadreBoomer),
                                               gradientFrom: StickerTemplatePalette.lilac,
                                               to: StickerTemplatePalette.accent, in: cadreBoomer,
                                               outline: StickerTemplatePalette.surface,
                                               width: trait * 0.5)
        StickerTemplatePalette.night.setFill()
        UIBezierPath(ovalIn: cadreBoomer.insetBy(dx: boomer * 0.34, dy: boomer * 0.34)).fill()

        let tweeter = boomer * 0.42
        StickerTemplateDrawing.fillWithOutline(
            UIBezierPath(ovalIn: CGRect(x: caisson.midX - tweeter / 2,
                                        y: caisson.minY + caisson.height * 0.10,
                                        width: tweeter, height: tweeter)),
            fill: StickerTemplatePalette.warmBulb,
            outline: StickerTemplatePalette.surface, width: trait * 0.4)

        StickerTemplatePalette.warmBulb.setStroke()
        for index in 1...3 {
            let onde = UIBezierPath(arcCenter: CGPoint(x: caisson.maxX, y: r.midY),
                                    radius: l * 0.04 + l * 0.10 * CGFloat(index),
                                    startAngle: -CGFloat.pi / 3, endAngle: CGFloat.pi / 3,
                                    clockwise: true)
            onde.lineWidth = trait * 1.1
            onde.lineCapStyle = .round
            onde.stroke()
        }
    }

    // MARK: - music.radio — le poste

    /// Antenne, grille, cadran, bande de fréquences. L'aiguille est posée DE
    /// BIAIS : à midi pile elle se confondrait avec un bouton de volume.
    @MainActor
    private static func musicRadioArt(in r: CGRect) {
        let l = r.width, h = r.height
        let trait = max(1.5, l * 0.035)
        let pointe = CGPoint(x: r.maxX - l * 0.06, y: r.minY + h * 0.04)

        let antenne = UIBezierPath()
        antenne.move(to: CGPoint(x: r.minX + l * 0.68, y: r.minY + h * 0.34))
        antenne.addLine(to: pointe)
        antenne.lineWidth = trait * 1.1
        antenne.lineCapStyle = .round
        StickerTemplatePalette.surface.setStroke()
        antenne.stroke()
        let bille = l * 0.07
        StickerTemplatePalette.warmBulb.setFill()
        UIBezierPath(ovalIn: CGRect(x: pointe.x - bille / 2, y: pointe.y - bille / 2,
                                    width: bille, height: bille)).fill()

        let poste = CGRect(x: r.minX + trait, y: r.minY + h * 0.30,
                           width: l - trait * 2, height: h * 0.68)
        StickerTemplateDrawing.fillWithOutline(
            UIBezierPath(roundedRect: poste, cornerRadius: h * 0.10),
            gradientFrom: StickerTemplatePalette.lilac, to: StickerTemplatePalette.accent,
            in: poste, outline: StickerTemplatePalette.surface, width: trait * 0.7)

        let grille = CGRect(x: poste.minX + poste.width * 0.06,
                            y: poste.minY + poste.height * 0.16,
                            width: poste.width * 0.46, height: poste.height * 0.68)
        StickerTemplateDrawing.fillWithOutline(
            UIBezierPath(roundedRect: grille, cornerRadius: grille.height * 0.18),
            fill: StickerTemplatePalette.night,
            outline: StickerTemplatePalette.surface, width: trait * 0.3)
        StickerTemplatePalette.surface.withAlphaComponent(0.45).setStroke()
        for index in 1..<5 {
            let barreau = UIBezierPath()
            let x = grille.minX + grille.width * CGFloat(index) / 5
            barreau.move(to: CGPoint(x: x, y: grille.minY + grille.height * 0.18))
            barreau.addLine(to: CGPoint(x: x, y: grille.maxY - grille.height * 0.18))
            barreau.lineWidth = trait * 0.5
            barreau.lineCapStyle = .round
            barreau.stroke()
        }

        let cadran = min(poste.width * 0.32, poste.height * 0.44)
        let centreCadran = CGPoint(x: poste.minX + poste.width * 0.74,
                                   y: poste.minY + poste.height * 0.38)
        StickerTemplateDrawing.fillWithOutline(
            UIBezierPath(ovalIn: CGRect(x: centreCadran.x - cadran / 2,
                                        y: centreCadran.y - cadran / 2,
                                        width: cadran, height: cadran)),
            fill: StickerTemplatePalette.surface,
            outline: StickerTemplatePalette.night, width: trait * 0.35)
        let aiguille = UIBezierPath()
        aiguille.move(to: centreCadran)
        aiguille.addLine(to: CGPoint(x: centreCadran.x + cadran * 0.30,
                                     y: centreCadran.y - cadran * 0.28))
        aiguille.lineWidth = trait * 0.7
        aiguille.lineCapStyle = .round
        StickerTemplatePalette.pin.setStroke()
        aiguille.stroke()

        let bande = UIBezierPath()
        let yBande = poste.maxY - poste.height * 0.18
        bande.move(to: CGPoint(x: centreCadran.x - cadran * 0.70, y: yBande))
        bande.addLine(to: CGPoint(x: centreCadran.x + cadran * 0.70, y: yBande))
        bande.lineWidth = trait * 0.5
        bande.lineCapStyle = .round
        StickerTemplatePalette.surface.setStroke()
        bande.stroke()
    }

    // MARK: - music.beat — la carte d'égaliseur

    /// Cinq barres de hauteurs INÉGALES sur une carte sombre. Des barres égales
    /// se liraient comme un code-barres ; c'est l'irrégularité qui dit le
    /// niveau, et c'est elle que `.bounce` fait sauter.
    @MainActor
    private static func musicBeatArt(in r: CGRect) {
        let trait = max(1.5, r.width * 0.04)
        let carte = r.insetBy(dx: trait, dy: trait)
        StickerTemplateDrawing.fillWithOutline(
            UIBezierPath(roundedRect: carte, cornerRadius: carte.height * 0.26),
            gradientFrom: StickerTemplatePalette.night, to: StickerTemplatePalette.ink,
            in: carte, outline: StickerTemplatePalette.surface, width: trait * 0.7)

        let hauteurs: [CGFloat] = [0.40, 0.74, 0.30, 0.92, 0.56]
        let couleurs: [UIColor] = [StickerTemplatePalette.sky, StickerTemplatePalette.leaf,
                                   StickerTemplatePalette.warmBulb, StickerTemplatePalette.pin,
                                   StickerTemplatePalette.lilac]
        let zone = carte.insetBy(dx: carte.width * 0.14, dy: carte.height * 0.16)
        let pas = zone.width / CGFloat(hauteurs.count)
        let largeur = pas * 0.56
        for (index, facteur) in hauteurs.enumerated() {
            let hauteur = zone.height * facteur
            couleurs[index].setFill()
            UIBezierPath(roundedRect: CGRect(x: zone.minX + pas * (CGFloat(index) + 0.5) - largeur / 2,
                                             y: zone.maxY - hauteur,
                                             width: largeur, height: hauteur),
                         cornerRadius: largeur * 0.42).fill()
        }
    }

    // MARK: - music.nowPlaying — le cartouche « En écoute »

    /// Le seul gabarit de la famille qui porte un MOT, donc le seul qui mesure
    /// son texte : sa largeur suit la traduction du lecteur.
    @MainActor
    private static var musicNowPlayingCaption: String {
        String(localized: "sticker.template.music.nowPlaying",
               defaultValue: "En écoute", bundle: .module)
    }

    @MainActor
    private static func musicNowPlayingLayout(metrics m: StickerTemplateMetrics)
        -> StickerTemplateDrawing.CaptionLayout {
        StickerTemplateDrawing.captionLayout(caption: musicNowPlayingCaption, glyph: .custom,
                                             metrics: m)
    }

    @MainActor
    private static func musicNowPlayingSize(metrics m: StickerTemplateMetrics) -> CGSize {
        musicNowPlayingLayout(metrics: m).taille
    }

    /// Le triangle de lecture dans son anneau — tracé, jamais emprunté à un
    /// symbole : c'est le seul glyphe du dépôt qui doive tenir dans une
    /// pastille de 1,05 corps sans jamais changer de graisse.
    @MainActor
    private static func musicPlayGlyph(in r: CGRect) {
        let anneau = UIBezierPath(ovalIn: r.insetBy(dx: r.width * 0.08, dy: r.height * 0.08))
        anneau.lineWidth = max(1, r.width * 0.10)
        StickerTemplatePalette.surface.setStroke()
        anneau.stroke()

        let triangle = UIBezierPath()
        triangle.move(to: CGPoint(x: r.minX + r.width * 0.40, y: r.minY + r.height * 0.32))
        triangle.addLine(to: CGPoint(x: r.minX + r.width * 0.70, y: r.midY))
        triangle.addLine(to: CGPoint(x: r.minX + r.width * 0.40, y: r.maxY - r.height * 0.32))
        triangle.close()
        triangle.lineJoinStyle = .round
        StickerTemplatePalette.surface.setFill()
        triangle.fill()
    }

    @MainActor
    private static func musicNowPlayingImage(metrics m: StickerTemplateMetrics,
                                             screenScale: CGFloat) -> (UIImage?, CGSize) {
        let mise = musicNowPlayingLayout(metrics: m)
        let légende = musicNowPlayingCaption
        return StickerTemplateDrawing.rasterize(size: mise.taille, screenScale: screenScale) {
            let trait = max(1, m.fontSize * 0.05)
            let plein = CGRect(origin: .zero, size: mise.taille)
            // Le liseré de `fillWithOutline` déborde d'un trait vers l'EXTÉRIEUR :
            // sans ce retrait, le bord de la pastille serait coupé net.
            let contour = plein.insetBy(dx: trait, dy: trait)
            StickerTemplateDrawing.fillWithOutline(
                StickerTemplateDrawing.pillPath(in: contour),
                gradientFrom: StickerTemplatePalette.accent, to: StickerTemplatePalette.loveCool,
                in: contour, outline: StickerTemplatePalette.surface, width: trait)
            Self.musicPlayGlyph(in: CGRect(x: m.horizontalPadding,
                                           y: plein.midY - mise.glyphe / 2,
                                           width: mise.glyphe, height: mise.glyphe))
            StickerTemplateDrawing.draw(
                légende, font: mise.police, color: StickerTemplatePalette.surface,
                at: CGPoint(x: m.horizontalPadding + mise.glyphe + m.gap,
                            y: plein.midY - mise.tailleTexte.height / 2))
        }
    }

    // MARK: - Le registre de la famille MUSIQUE

    private static let musicMotifs: [MusicMotif] = [
        MusicMotif(id: StickerTemplateCatalog.ID.musicNote,
                   name: { String(localized: "sticker.template.music.note",
                                  defaultValue: "Note de musique", bundle: .module) },
                   largeur: 2.2, hauteur: 3.0,
                   dessin: { r in Self.musicNoteArt(in: r) }),
        MusicMotif(id: StickerTemplateCatalog.ID.musicHeadphones,
                   name: { String(localized: "sticker.template.music.headphones",
                                  defaultValue: "Casque", bundle: .module) },
                   largeur: 3.0, hauteur: 2.6,
                   dessin: { r in Self.musicHeadphonesArt(in: r) }),
        MusicMotif(id: StickerTemplateCatalog.ID.musicVinyl,
                   name: { String(localized: "sticker.template.music.vinyl",
                                  defaultValue: "Vinyle", bundle: .module) },
                   largeur: 3.0, hauteur: 3.0,
                   dessin: { r in Self.musicVinylArt(in: r) }),
        MusicMotif(id: StickerTemplateCatalog.ID.musicGuitar,
                   name: { String(localized: "sticker.template.music.guitar",
                                  defaultValue: "Guitare", bundle: .module) },
                   largeur: 2.4, hauteur: 3.6,
                   dessin: { r in Self.musicGuitarArt(in: r) }),
        MusicMotif(id: StickerTemplateCatalog.ID.musicMic,
                   name: { String(localized: "sticker.template.music.mic",
                                  defaultValue: "Micro", bundle: .module) },
                   largeur: 1.9, hauteur: 3.4,
                   dessin: { r in Self.musicMicArt(in: r) }),
        MusicMotif(id: StickerTemplateCatalog.ID.musicPiano,
                   name: { String(localized: "sticker.template.music.piano",
                                  defaultValue: "Piano", bundle: .module) },
                   largeur: 3.4, hauteur: 2.0,
                   dessin: { r in Self.musicPianoArt(in: r) }),
        MusicMotif(id: StickerTemplateCatalog.ID.musicSpeaker,
                   name: { String(localized: "sticker.template.music.speaker",
                                  defaultValue: "Enceinte", bundle: .module) },
                   largeur: 3.2, hauteur: 2.6,
                   dessin: { r in Self.musicSpeakerArt(in: r) }),
        MusicMotif(id: StickerTemplateCatalog.ID.musicBeat,
                   name: { String(localized: "sticker.template.music.beat",
                                  defaultValue: "Rythme", bundle: .module) },
                   largeur: 2.6, hauteur: 2.2,
                   dessin: { r in Self.musicBeatArt(in: r) }),
        MusicMotif(id: StickerTemplateCatalog.ID.musicRadio,
                   name: { String(localized: "sticker.template.music.radio",
                                  defaultValue: "Radio", bundle: .module) },
                   largeur: 3.2, hauteur: 2.6,
                   dessin: { r in Self.musicRadioArt(in: r) }),
    ]

    static let musicDrawers: [StickerTemplateDrawer] = musicMotifs.map { musicMotifDrawer($0) } + [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.musicNowPlaying,
            name: { Self.musicNowPlayingCaption },
            measure: { _, m in Self.musicNowPlayingSize(metrics: m) },
            draw: { _, m, échelle in Self.musicNowPlayingImage(metrics: m, screenScale: échelle) }),
    ]
}
