import Foundation
import UIKit
import MeeshySDK

// MARK: - Sept décorations d'HEURE de plus (#4820)

/// Les trois premières disaient l'heure en CHIFFRES, en CADRAN, en RUBAN ;
/// celles-ci la disent par un OBJET — un sablier, un chrono, un réveil, une
/// montre à gousset — parce que c'est l'objet que l'œil reconnaît du coin de
/// la palette, avant de lire l'heure qu'il porte.
///
/// **Rien ici ne lit l'horloge** (décision D1 du 2026-09-01) : chaque gabarit
/// dessine ce que ses emplacements portent, et une valeur absente laisse une
/// boîte non nulle — l'objet sans son heure, jamais un vide.
extension StickerTemplateRenderer {

    /// Les chiffres au CENTRE d'un objet rond : plus petits que dans l'afficheur
    /// numérique, sinon l'heure déborde du cadran qui la porte.
    @MainActor
    private static func dialDigitFont(_ metrics: StickerTemplateMetrics) -> UIFont {
        StickerTemplateDrawing.digitFont(size: metrics.fontSize * 0.62, weight: .heavy)
    }

    /// Le diamètre d'un objet rond à chiffres : un plancher qui fait l'objet,
    /// relevé si l'heure affichée est plus large (« 12:45 PM ») — l'heure ne
    /// sort jamais du cadran, et le cadran ne rétrécit jamais sous sa forme.
    private static func dialDiameter(text: CGSize, metrics: StickerTemplateMetrics) -> CGFloat {
        ceil(max(metrics.fontSize * 2.6, text.width + metrics.horizontalPadding * 1.6))
    }

    /// Les douze index d'un cadran, les quatre cardinaux plus longs : sans eux,
    /// un cadran lu du coin de l'œil n'a plus d'orientation.
    @MainActor
    private static func dialTicks(center centre: CGPoint, radius rayon: CGFloat,
                                  width: CGFloat, color: UIColor) {
        color.setStroke()
        for index in 0..<12 {
            let angle = CGFloat(index) * .pi / 6
            let cardinal = index % 3 == 0
            let longueur = rayon * (cardinal ? 0.16 : 0.08)
            let trait = UIBezierPath()
            trait.move(to: CGPoint(x: centre.x + sin(angle) * (rayon - longueur),
                                   y: centre.y - cos(angle) * (rayon - longueur)))
            trait.addLine(to: CGPoint(x: centre.x + sin(angle) * rayon,
                                      y: centre.y - cos(angle) * rayon))
            trait.lineWidth = width * (cardinal ? 1 : 0.6); trait.lineCapStyle = .round
            trait.stroke()
        }
    }

    // MARK: - time.hourglass — le sablier

    @MainActor
    private static func hourglassLayout(slots: [String: String],
                                        metrics: StickerTemplateMetrics)
        -> (texte: String, police: UIFont, tailleTexte: CGSize,
            verre: CGRect, pilule: CGRect, taille: CGSize) {
        let texte = timeText(slots)
        let police = StickerTemplateDrawing.digitFont(size: metrics.fontSize * 0.78, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(texte, font: police)
        let largeurVerre = metrics.fontSize * 1.7
        let hauteurVerre = metrics.fontSize * 2.1
        // L'heure sous le sablier vit dans sa propre pilule sombre : posée nue
        // sous l'objet, elle se perdrait sur une photo claire.
        let pilule = CGSize(width: tailleTexte.width + metrics.horizontalPadding * 1.2,
                            height: tailleTexte.height + metrics.verticalPadding * 0.8)
        let largeur = ceil(max(largeurVerre, pilule.width) + metrics.horizontalPadding * 2)
        let hauteur = ceil(metrics.verticalPadding * 2 + hauteurVerre + metrics.gap + pilule.height)
        let verre = CGRect(x: (largeur - largeurVerre) / 2, y: metrics.verticalPadding,
                           width: largeurVerre, height: hauteurVerre)
        let cadrePilule = CGRect(x: (largeur - pilule.width) / 2, y: verre.maxY + metrics.gap,
                                 width: pilule.width, height: pilule.height)
        return (texte, police, tailleTexte, verre, cadrePilule, CGSize(width: largeur, height: hauteur))
    }

    @MainActor
    static func hourglassSize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        hourglassLayout(slots: slots, metrics: metrics).taille
    }

    /// Les deux ampoules d'un sablier, en UN tracé : les flancs se creusent en
    /// courbes vers la taille plutôt qu'en droites — deux triangles nus font un
    /// pictogramme, deux courbes font du verre.
    private static func hourglassPath(in g: CGRect) -> UIBezierPath {
        let taille = g.width * 0.07
        let h = g.height
        let chemin = UIBezierPath()
        chemin.move(to: CGPoint(x: g.minX, y: g.minY))
        chemin.addLine(to: CGPoint(x: g.maxX, y: g.minY))
        chemin.addCurve(to: CGPoint(x: g.midX + taille, y: g.midY),
                        controlPoint1: CGPoint(x: g.maxX, y: g.minY + h * 0.38),
                        controlPoint2: CGPoint(x: g.midX + taille, y: g.midY - h * 0.08))
        chemin.addCurve(to: CGPoint(x: g.maxX, y: g.maxY),
                        controlPoint1: CGPoint(x: g.midX + taille, y: g.midY + h * 0.08),
                        controlPoint2: CGPoint(x: g.maxX, y: g.maxY - h * 0.38))
        chemin.addLine(to: CGPoint(x: g.minX, y: g.maxY))
        chemin.addCurve(to: CGPoint(x: g.midX - taille, y: g.midY),
                        controlPoint1: CGPoint(x: g.minX, y: g.maxY - h * 0.38),
                        controlPoint2: CGPoint(x: g.midX - taille, y: g.midY + h * 0.08))
        chemin.addCurve(to: CGPoint(x: g.minX, y: g.minY),
                        controlPoint1: CGPoint(x: g.midX - taille, y: g.midY - h * 0.08),
                        controlPoint2: CGPoint(x: g.minX, y: g.minY + h * 0.38))
        chemin.close()
        return chemin
    }

    @MainActor
    static func hourglassImage(slots: [String: String], metrics: StickerTemplateMetrics,
                               screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = hourglassLayout(slots: slots, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let chapeau = l.verre.height * 0.09
            let verre = l.verre.insetBy(dx: l.verre.width * 0.07, dy: chapeau * 0.6)
            let ampoules = Self.hourglassPath(in: verre)
            StickerTemplatePalette.surface.withAlphaComponent(0.5).setFill()
            ampoules.fill()

            // Le sable : presque tout en bas, un reste en haut, un filet entre
            // les deux — c'est le filet qui dit « le temps passe ». Découpé par
            // le verre, pour que le tas épouse la courbe de l'ampoule.
            if let contexte = UIGraphicsGetCurrentContext() {
                contexte.saveGState()
                ampoules.addClip()
                StickerTemplatePalette.warmBulb.setFill()
                let tas = UIBezierPath()
                tas.move(to: CGPoint(x: verre.minX, y: verre.maxY))
                tas.addLine(to: CGPoint(x: verre.maxX, y: verre.maxY))
                tas.addQuadCurve(to: CGPoint(x: verre.minX, y: verre.maxY),
                                 controlPoint: CGPoint(x: verre.midX, y: verre.maxY - verre.height * 0.62))
                tas.close()
                tas.fill()
                UIBezierPath(rect: CGRect(x: verre.minX, y: verre.midY - verre.height * 0.14,
                                          width: verre.width, height: verre.height * 0.14)).fill()
                let filet = UIBezierPath()
                filet.move(to: CGPoint(x: verre.midX, y: verre.midY))
                filet.addLine(to: CGPoint(x: verre.midX, y: verre.maxY - verre.height * 0.28))
                filet.lineWidth = max(1, verre.width * 0.05); filet.lineCapStyle = .round
                StickerTemplatePalette.warmBulb.setStroke()
                filet.stroke()
                contexte.restoreGState()
            }

            StickerTemplatePalette.surface.setStroke()
            ampoules.lineWidth = max(1, metrics.fontSize * 0.06)
            ampoules.lineJoinStyle = .round
            ampoules.stroke()

            StickerTemplatePalette.ink.setFill()
            for y in [l.verre.minY, l.verre.maxY - chapeau] {
                UIBezierPath(roundedRect: CGRect(x: l.verre.minX, y: y, width: l.verre.width, height: chapeau),
                             cornerRadius: chapeau * 0.4).fill()
            }

            StickerTemplateDrawing.fill(StickerTemplateDrawing.pillPath(in: l.pilule),
                                        gradientFrom: StickerTemplatePalette.night,
                                        to: StickerTemplatePalette.accent,
                                        in: l.pilule)
            StickerTemplateDrawing.drawCentered(l.texte, font: l.police,
                                                color: StickerTemplatePalette.surface, in: l.pilule)
        }
    }

    // MARK: - time.stopwatch — le chronomètre

    @MainActor
    private static func stopwatchLayout(slots: [String: String],
                                        metrics: StickerTemplateMetrics)
        -> (texte: String, police: UIFont, cadran: CGRect, couronne: CGFloat, taille: CGSize) {
        let texte = timeText(slots)
        let police = dialDigitFont(metrics)
        let diamètre = dialDiameter(text: StickerTemplateDrawing.measure(texte, font: police),
                                    metrics: metrics)
        let couronne = metrics.fontSize * 0.42
        let cadran = CGRect(x: 0, y: couronne, width: diamètre, height: diamètre)
        return (texte, police, cadran, couronne, CGSize(width: diamètre, height: ceil(diamètre + couronne)))
    }

    @MainActor
    static func stopwatchSize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        stopwatchLayout(slots: slots, metrics: metrics).taille
    }

    @MainActor
    static func stopwatchImage(slots: [String: String], metrics: StickerTemplateMetrics,
                               screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = stopwatchLayout(slots: slots, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = metrics.fontSize * 0.12
            let cadran = l.cadran.insetBy(dx: bord, dy: bord)
            let centre = CGPoint(x: cadran.midX, y: cadran.midY)
            let rayon = cadran.width / 2

            // Le poussoir du haut et son bouton, puis le petit poussoir à
            // deux heures : c'est lui qui distingue un chrono d'un réveil.
            StickerTemplatePalette.ink.setFill()
            UIBezierPath(rect: CGRect(x: centre.x - metrics.fontSize * 0.12, y: l.couronne * 0.35,
                                      width: metrics.fontSize * 0.24, height: l.couronne * 0.75)).fill()
            StickerTemplatePalette.accent.setFill()
            UIBezierPath(roundedRect: CGRect(x: centre.x - metrics.fontSize * 0.26, y: 0,
                                             width: metrics.fontSize * 0.52, height: l.couronne * 0.45),
                         cornerRadius: l.couronne * 0.15).fill()
            let poussoir = UIBezierPath()
            let angle = -CGFloat.pi / 4
            poussoir.move(to: CGPoint(x: centre.x + cos(angle) * rayon, y: centre.y + sin(angle) * rayon))
            poussoir.addLine(to: CGPoint(x: centre.x + cos(angle) * (rayon + bord * 0.9),
                                         y: centre.y + sin(angle) * (rayon + bord * 0.9)))
            poussoir.lineWidth = metrics.fontSize * 0.18; poussoir.lineCapStyle = .round
            StickerTemplatePalette.ink.setStroke()
            poussoir.stroke()

            let disque = UIBezierPath(ovalIn: cadran)
            StickerTemplatePalette.surface.setFill()
            disque.fill()
            StickerTemplatePalette.accent.setStroke()
            disque.lineWidth = metrics.fontSize * 0.10
            disque.stroke()
            let intérieur = UIBezierPath(ovalIn: cadran.insetBy(dx: rayon * 0.14, dy: rayon * 0.14))
            StickerTemplatePalette.hairline.setStroke()
            intérieur.lineWidth = max(1, metrics.fontSize * 0.03)
            intérieur.stroke()

            Self.dialTicks(center: centre, radius: rayon * 0.86 - metrics.fontSize * 0.05,
                           width: max(1, metrics.fontSize * 0.06),
                           color: StickerTemplatePalette.label.withAlphaComponent(0.5))
            StickerTemplateDrawing.drawCentered(l.texte, font: l.police,
                                                color: StickerTemplatePalette.ink, in: cadran)
        }
    }

    // MARK: - time.calendarDay — la feuille de calendrier

    /// La date en DEUX lignes : le premier mot en haut, le reste en dessous —
    /// « 1 » au-dessus de « septembre 2026 » en français, « September »
    /// au-dessus de « 1, 2026 » en anglais. La coupe suit la locale de
    /// l'auteur telle qu'elle a été figée, sans rien savoir du calendrier.
    static func calendarLines(_ date: String) -> (haut: String, bas: String) {
        let mots = date.split(separator: " ", maxSplits: 1)
        guard mots.count == 2 else { return (date, "") }
        return (String(mots[0]), String(mots[1]).trimmingCharacters(in: .whitespaces))
    }

    @MainActor
    private static func calendarDayLayout(slots: [String: String],
                                          metrics: StickerTemplateMetrics)
        -> (haut: String, bas: String, policeHaut: UIFont, policeBas: UIFont,
            hauteurHaut: CGFloat, tailleBas: CGSize, bandeau: CGFloat, anneau: CGFloat, taille: CGSize) {
        let (haut, bas) = calendarLines(slots[StickerSlotFiller.dateSlot] ?? "")
        let policeHaut = StickerTemplateDrawing.font(size: metrics.fontSize, weight: .heavy)
        let policeBas = StickerTemplateDrawing.font(size: metrics.fontSize * 0.48, weight: .semibold)
        let tailleHaut = StickerTemplateDrawing.measure(haut, font: policeHaut)
        let tailleBas = bas.isEmpty ? .zero : StickerTemplateDrawing.measure(bas, font: policeBas)
        // Une date absente mesure zéro : la ligne garde la hauteur de sa
        // police, pour que la feuille reste une feuille.
        let hauteurHaut = max(tailleHaut.height, policeHaut.lineHeight)
        let bandeau = metrics.fontSize * 0.5
        let anneau = metrics.fontSize * 0.26
        let largeur = ceil(max(tailleHaut.width, tailleBas.width, metrics.fontSize * 2.0)
                           + metrics.horizontalPadding * 2)
        let hauteur = ceil(anneau + bandeau + metrics.verticalPadding * 1.6 + hauteurHaut
                           + (bas.isEmpty ? 0 : tailleBas.height + metrics.gap * 0.4))
        return (haut, bas, policeHaut, policeBas, hauteurHaut, tailleBas, bandeau, anneau,
                CGSize(width: largeur, height: hauteur))
    }

    @MainActor
    static func calendarDaySize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        calendarDayLayout(slots: slots, metrics: metrics).taille
    }

    @MainActor
    static func calendarDayImage(slots: [String: String], metrics: StickerTemplateMetrics,
                                 screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = calendarDayLayout(slots: slots, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let feuille = CGRect(x: 0, y: l.anneau, width: l.taille.width, height: l.taille.height - l.anneau)
            let page = UIBezierPath(roundedRect: feuille, cornerRadius: metrics.fontSize * 0.22)
            StickerTemplatePalette.surface.setFill()
            page.fill()

            // Le bandeau rouge, découpé par la page pour épouser ses coins.
            if let contexte = UIGraphicsGetCurrentContext() {
                contexte.saveGState()
                page.addClip()
                StickerTemplatePalette.pin.setFill()
                UIBezierPath(rect: CGRect(x: feuille.minX, y: feuille.minY,
                                          width: feuille.width, height: l.bandeau)).fill()
                contexte.restoreGState()
            }
            StickerTemplatePalette.hairline.setStroke()
            page.lineWidth = max(1, metrics.fontSize * 0.05)
            page.stroke()

            // Les deux anneaux, passés dans deux œillets percés dans le bandeau.
            let rayon = metrics.fontSize * 0.08
            for x in [feuille.width * 0.28, feuille.width * 0.72] {
                StickerTemplatePalette.ink.withAlphaComponent(0.35).setFill()
                UIBezierPath(ovalIn: CGRect(x: x - rayon * 1.6, y: feuille.minY + l.bandeau * 0.55 - rayon * 1.6,
                                            width: rayon * 3.2, height: rayon * 3.2)).fill()
                let anneau = UIBezierPath(roundedRect: CGRect(x: x - rayon, y: 0, width: rayon * 2,
                                                              height: l.anneau + l.bandeau * 0.55),
                                          cornerRadius: rayon)
                StickerTemplatePalette.ink.setFill()
                anneau.fill()
                StickerTemplatePalette.surface.setStroke()
                anneau.lineWidth = max(1, metrics.fontSize * 0.03)
                anneau.stroke()
            }

            let yHaut = feuille.minY + l.bandeau + metrics.verticalPadding * 0.8
            StickerTemplateDrawing.drawCentered(
                l.haut, font: l.policeHaut, color: StickerTemplatePalette.label,
                in: CGRect(x: 0, y: yHaut, width: feuille.width, height: l.hauteurHaut))
            guard !l.bas.isEmpty else { return }
            StickerTemplateDrawing.drawCentered(
                l.bas, font: l.policeBas, color: StickerTemplatePalette.label.withAlphaComponent(0.65),
                in: CGRect(x: 0, y: yHaut + l.hauteurHaut + metrics.gap * 0.4,
                           width: feuille.width, height: l.tailleBas.height))
        }
    }

    // MARK: - time.alarm — le réveil

    @MainActor
    private static func alarmLayout(slots: [String: String],
                                    metrics: StickerTemplateMetrics)
        -> (texte: String, police: UIFont, cadran: CGRect, cloche: CGFloat, taille: CGSize) {
        let texte = timeText(slots)
        let police = dialDigitFont(metrics)
        let diamètre = dialDiameter(text: StickerTemplateDrawing.measure(texte, font: police),
                                    metrics: metrics)
        let cloche = metrics.fontSize * 0.36
        let pieds = metrics.fontSize * 0.32
        let cadran = CGRect(x: 0, y: cloche * 1.1, width: diamètre, height: diamètre)
        return (texte, police, cadran, cloche,
                CGSize(width: diamètre, height: ceil(cloche * 1.1 + diamètre + pieds)))
    }

    @MainActor
    static func alarmSize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        alarmLayout(slots: slots, metrics: metrics).taille
    }

    @MainActor
    static func alarmImage(slots: [String: String], metrics: StickerTemplateMetrics,
                           screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = alarmLayout(slots: slots, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = metrics.fontSize * 0.10
            let cadran = l.cadran.insetBy(dx: bord, dy: bord)
            let centre = CGPoint(x: cadran.midX, y: cadran.midY)
            let rayon = cadran.width / 2

            // Les deux cloches — des demi-disques posés sur les épaules du
            // cadran par un cou — et le marteau entre elles.
            for x in [cadran.width * 0.26, cadran.width * 0.74] {
                StickerTemplatePalette.ink.setFill()
                UIBezierPath(rect: CGRect(x: x - l.cloche * 0.3, y: l.cloche * 0.9,
                                          width: l.cloche * 0.6, height: l.cloche * 1.2)).fill()
                let dôme = UIBezierPath()
                dôme.move(to: CGPoint(x: x - l.cloche, y: l.cloche))
                dôme.addArc(withCenter: CGPoint(x: x, y: l.cloche), radius: l.cloche,
                            startAngle: .pi, endAngle: 0, clockwise: true)
                dôme.close()
                StickerTemplateDrawing.fillWithOutline(dôme, fill: StickerTemplatePalette.warmBulb,
                                                       outline: StickerTemplatePalette.ink,
                                                       width: max(1, metrics.fontSize * 0.03))
            }
            StickerTemplatePalette.ink.setFill()
            UIBezierPath(rect: CGRect(x: centre.x - metrics.fontSize * 0.05, y: l.cloche * 0.5,
                                      width: metrics.fontSize * 0.10, height: l.cloche)).fill()
            let marteau = metrics.fontSize * 0.09
            UIBezierPath(ovalIn: CGRect(x: centre.x - marteau, y: l.cloche * 0.5 - marteau,
                                        width: marteau * 2, height: marteau * 2)).fill()

            // Les pieds, écartés comme ceux d'un réveil posé sur une table de nuit.
            StickerTemplatePalette.ink.setStroke()
            for signe: CGFloat in [-1, 1] {
                let angle = CGFloat.pi / 2 + signe * .pi / 7
                let pied = UIBezierPath()
                pied.move(to: CGPoint(x: centre.x + cos(angle) * rayon * 0.9,
                                      y: centre.y + sin(angle) * rayon * 0.9))
                pied.addLine(to: CGPoint(x: centre.x + cos(angle) * (rayon + metrics.fontSize * 0.22),
                                         y: centre.y + sin(angle) * (rayon + metrics.fontSize * 0.22)))
                pied.lineWidth = metrics.fontSize * 0.14; pied.lineCapStyle = .round
                pied.stroke()
            }

            let disque = UIBezierPath(ovalIn: cadran)
            StickerTemplatePalette.surface.setFill()
            disque.fill()
            StickerTemplatePalette.pin.setStroke()
            disque.lineWidth = metrics.fontSize * 0.10
            disque.stroke()
            Self.dialTicks(center: centre, radius: rayon - metrics.fontSize * 0.14,
                           width: max(1, metrics.fontSize * 0.06),
                           color: StickerTemplatePalette.label.withAlphaComponent(0.5))
            StickerTemplateDrawing.drawCentered(l.texte, font: l.police,
                                                color: StickerTemplatePalette.ink, in: cadran)
        }
    }

    // MARK: - time.timeTag — l'étiquette « à 14:32 »

    /// La particule est DESSINÉE, donc localisée : « à » pour un lecteur
    /// français, « at » pour un anglais — le chiffre, lui, reste celui que
    /// l'auteur a figé.
    static var timeTagCaption: String {
        String(localized: "sticker.template.time.timeTag.caption", defaultValue: "à", bundle: .module)
    }

    @MainActor
    private static func timeTagLayout(slots: [String: String],
                                      metrics: StickerTemplateMetrics)
        -> (légende: String, heure: String, policeLégende: UIFont, policeHeure: UIFont,
            tailleLégende: CGSize, tailleHeure: CGSize, pointe: CGFloat, taille: CGSize) {
        let légende = timeTagCaption
        let heure = timeText(slots)
        let policeLégende = StickerTemplateDrawing.font(size: metrics.fontSize * 0.7, weight: .bold)
        let policeHeure = StickerTemplateDrawing.digitFont(size: metrics.fontSize * 0.9, weight: .heavy)
        let tailleLégende = StickerTemplateDrawing.measure(légende, font: policeLégende)
        let tailleHeure = StickerTemplateDrawing.measure(heure, font: policeHeure)
        let pointe = metrics.fontSize * 0.7
        let taille = CGSize(
            width: ceil(pointe + metrics.horizontalPadding * 0.8 + tailleLégende.width
                        + metrics.gap * 0.6 + tailleHeure.width + metrics.horizontalPadding),
            height: ceil(metrics.verticalPadding * 2 + max(tailleLégende.height, tailleHeure.height))
        )
        return (légende, heure, policeLégende, policeHeure, tailleLégende, tailleHeure, pointe, taille)
    }

    @MainActor
    static func timeTagSize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        timeTagLayout(slots: slots, metrics: metrics).taille
    }

    /// Une étiquette de bagage : la pointe à gauche, deux coins arrondis à
    /// droite. Tracée, jamais empruntée à `tag.fill` — le symbole ne se
    /// laisserait pas allonger pour contenir l'heure.
    private static func timeTagPath(in rect: CGRect, tip pointe: CGFloat) -> UIBezierPath {
        let r = rect.height * 0.22
        let chemin = UIBezierPath()
        chemin.move(to: CGPoint(x: rect.minX + pointe, y: rect.minY))
        chemin.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
        chemin.addArc(withCenter: CGPoint(x: rect.maxX - r, y: rect.minY + r), radius: r,
                      startAngle: -.pi / 2, endAngle: 0, clockwise: true)
        chemin.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
        chemin.addArc(withCenter: CGPoint(x: rect.maxX - r, y: rect.maxY - r), radius: r,
                      startAngle: 0, endAngle: .pi / 2, clockwise: true)
        chemin.addLine(to: CGPoint(x: rect.minX + pointe, y: rect.maxY))
        chemin.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        chemin.close()
        return chemin
    }

    @MainActor
    static func timeTagImage(slots: [String: String], metrics: StickerTemplateMetrics,
                             screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = timeTagLayout(slots: slots, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let étiquette = Self.timeTagPath(in: cadre, tip: l.pointe)
            StickerTemplateDrawing.fill(étiquette, gradientFrom: StickerTemplatePalette.accent,
                                        to: StickerTemplatePalette.night, in: cadre)
            StickerTemplatePalette.surface.withAlphaComponent(0.6).setStroke()
            étiquette.lineWidth = max(1, metrics.fontSize * 0.05)
            étiquette.lineJoinStyle = .round
            étiquette.stroke()

            // Le trou de la ficelle — CREUSÉ, pas peint : une étiquette se
            // pose sur une photo, et un rond opaque n'est pas un trou.
            let œillet = metrics.fontSize * 0.11
            let trou = UIBezierPath(ovalIn: CGRect(x: l.pointe * 0.62 - œillet, y: cadre.midY - œillet,
                                                   width: œillet * 2, height: œillet * 2))
            if let contexte = UIGraphicsGetCurrentContext() {
                contexte.saveGState()
                contexte.setBlendMode(.clear)
                trou.fill()
                contexte.restoreGState()
            }
            StickerTemplatePalette.surface.withAlphaComponent(0.7).setStroke()
            trou.lineWidth = max(1, metrics.fontSize * 0.03)
            trou.stroke()

            let x = l.pointe + metrics.horizontalPadding * 0.8
            StickerTemplateDrawing.draw(
                l.légende, font: l.policeLégende,
                color: StickerTemplatePalette.surface.withAlphaComponent(0.8),
                at: CGPoint(x: x, y: cadre.midY - l.tailleLégende.height / 2))
            StickerTemplateDrawing.draw(
                l.heure, font: l.policeHeure, color: StickerTemplatePalette.surface,
                at: CGPoint(x: x + l.tailleLégende.width + metrics.gap * 0.6,
                            y: cadre.midY - l.tailleHeure.height / 2))
        }
    }

    // MARK: - time.moon — l'heure de nuit

    @MainActor
    private static func moonLayout(slots: [String: String],
                                   metrics: StickerTemplateMetrics)
        -> (texte: String, police: UIFont, tailleTexte: CGSize, glyphe: CGFloat, taille: CGSize) {
        let texte = timeText(slots)
        let police = StickerTemplateDrawing.digitFont(size: metrics.fontSize * 0.85, weight: .bold)
        let tailleTexte = StickerTemplateDrawing.measure(texte, font: police)
        let glyphe = metrics.fontSize * 1.05
        let taille = CGSize(
            width: ceil(metrics.horizontalPadding * 2 + glyphe + metrics.gap + tailleTexte.width),
            height: ceil(metrics.verticalPadding * 2 + max(glyphe, tailleTexte.height))
        )
        return (texte, police, tailleTexte, glyphe, taille)
    }

    @MainActor
    static func moonSize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        moonLayout(slots: slots, metrics: metrics).taille
    }

    @MainActor
    static func moonImage(slots: [String: String], metrics: StickerTemplateMetrics,
                          screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = moonLayout(slots: slots, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let carte = UIBezierPath(roundedRect: cadre, cornerRadius: l.taille.height * 0.3)
            StickerTemplateDrawing.fill(carte, gradientFrom: StickerTemplatePalette.night,
                                        to: StickerTemplatePalette.ink, in: cadre)
            StickerTemplatePalette.surface.withAlphaComponent(0.45).setStroke()
            carte.lineWidth = max(1, metrics.fontSize * 0.05)
            carte.stroke()

            // Quelques étoiles semées sur le fond — ce qui fait de la carte
            // un ciel plutôt qu'un afficheur sombre.
            StickerTemplatePalette.warmBulb.withAlphaComponent(0.7).setFill()
            let étoile = metrics.fontSize * 0.045
            for point in [CGPoint(x: 0.52, y: 0.18), CGPoint(x: 0.90, y: 0.26),
                          CGPoint(x: 0.72, y: 0.84), CGPoint(x: 0.38, y: 0.88)] {
                UIBezierPath(ovalIn: CGRect(x: cadre.width * point.x - étoile, y: cadre.height * point.y - étoile,
                                            width: étoile * 2, height: étoile * 2)).fill()
            }

            StickerTemplateDrawing.drawSymbol(
                "moon.stars.fill",
                in: CGRect(x: metrics.horizontalPadding, y: cadre.midY - l.glyphe / 2,
                           width: l.glyphe, height: l.glyphe),
                color: StickerTemplatePalette.warmBulb, weight: .bold)
            StickerTemplateDrawing.draw(
                l.texte, font: l.police, color: StickerTemplatePalette.surface,
                at: CGPoint(x: metrics.horizontalPadding + l.glyphe + metrics.gap,
                            y: cadre.midY - l.tailleTexte.height / 2))
        }
    }

    // MARK: - time.pocketWatch — la montre à gousset

    @MainActor
    private static func pocketWatchLayout(metrics: StickerTemplateMetrics)
        -> (cadran: CGRect, couronne: CGFloat, taille: CGSize) {
        // Aucun texte : la montre garde sa taille quelle que soit l'heure,
        // comme le cadran de `time.analog`. La marge à droite loge la chaîne.
        let diamètre = metrics.fontSize * 2.8
        let couronne = metrics.fontSize * 0.5
        let cadran = CGRect(x: 0, y: couronne, width: diamètre, height: diamètre)
        return (cadran, couronne,
                CGSize(width: ceil(diamètre + metrics.fontSize * 0.8), height: ceil(diamètre + couronne)))
    }

    @MainActor
    static func pocketWatchSize(metrics: StickerTemplateMetrics) -> CGSize {
        pocketWatchLayout(metrics: metrics).taille
    }

    @MainActor
    static func pocketWatchImage(slots: [String: String], metrics: StickerTemplateMetrics,
                                 screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = pocketWatchLayout(metrics: metrics)
        let (heure, minute) = clockHands(slots)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = metrics.fontSize * 0.12
            let cadran = l.cadran.insetBy(dx: bord / 2, dy: bord / 2)
            let centre = CGPoint(x: cadran.midX, y: cadran.midY)
            let rayon = cadran.width / 2

            // La chaîne : un arc en POINTILLÉS ronds, du bélière vers le bord
            // droit — des maillons, pas un trait.
            let maillon = metrics.fontSize * 0.12
            let chaîne = UIBezierPath()
            chaîne.move(to: CGPoint(x: centre.x + metrics.fontSize * 0.2, y: l.couronne * 0.4))
            chaîne.addQuadCurve(to: CGPoint(x: l.taille.width - maillon, y: l.couronne + cadran.height * 0.4),
                                controlPoint: CGPoint(x: l.taille.width - maillon * 0.5, y: l.couronne * 0.15))
            chaîne.lineWidth = maillon
            chaîne.lineCapStyle = .round
            chaîne.setLineDash([0, maillon * 1.7], count: 2, phase: 0)
            StickerTemplatePalette.warmBulb.setStroke()
            chaîne.stroke()

            StickerTemplatePalette.warmBulb.setFill()
            UIBezierPath(rect: CGRect(x: centre.x - metrics.fontSize * 0.1, y: l.couronne * 0.55,
                                      width: metrics.fontSize * 0.2, height: l.couronne * 0.5)).fill()
            let bélière = UIBezierPath(arcCenter: CGPoint(x: centre.x, y: l.couronne * 0.35),
                                       radius: metrics.fontSize * 0.16,
                                       startAngle: 0, endAngle: .pi * 2, clockwise: true)
            bélière.lineWidth = metrics.fontSize * 0.08
            StickerTemplatePalette.warmBulb.setStroke()
            bélière.stroke()

            let boîtier = UIBezierPath(ovalIn: cadran)
            StickerTemplatePalette.surface.setFill()
            boîtier.fill()
            StickerTemplatePalette.warmBulb.setStroke()
            boîtier.lineWidth = bord
            boîtier.stroke()
            let filet = UIBezierPath(ovalIn: cadran.insetBy(dx: bord * 1.4, dy: bord * 1.4))
            StickerTemplatePalette.hairline.setStroke()
            filet.lineWidth = max(1, metrics.fontSize * 0.03)
            filet.stroke()

            StickerTemplatePalette.label.withAlphaComponent(0.55).setFill()
            for index in 0..<12 {
                let angle = CGFloat(index) * .pi / 6
                let point = metrics.fontSize * (index % 3 == 0 ? 0.07 : 0.04)
                let r = rayon - bord * 2.3
                UIBezierPath(ovalIn: CGRect(x: centre.x + sin(angle) * r - point,
                                            y: centre.y - cos(angle) * r - point,
                                            width: point * 2, height: point * 2)).fill()
            }

            // L'aiguille des heures avance AVEC les minutes — même règle que
            // `time.analog` : figée sur l'heure pleine, elle contredirait les
            // minutes qu'elle accompagne.
            let angleMinute = CGFloat(minute) / 60 * 2 * .pi
            let angleHeure = (CGFloat(heure % 12) + CGFloat(minute) / 60) / 12 * 2 * .pi
            Self.pocketWatchHand(from: centre, angle: angleHeure, length: rayon * 0.46,
                                 width: bord, color: StickerTemplatePalette.label)
            Self.pocketWatchHand(from: centre, angle: angleMinute, length: rayon * 0.68,
                                 width: bord * 0.7, color: StickerTemplatePalette.accent)
            let pivot = bord * 1.2
            StickerTemplatePalette.pin.setFill()
            UIBezierPath(ovalIn: CGRect(x: centre.x - pivot / 2, y: centre.y - pivot / 2,
                                        width: pivot, height: pivot)).fill()
        }
    }

    /// Une aiguille depuis le pivot, angle horaire (zéro à midi, sens des
    /// aiguilles). Redite localement : celle de `time.analog` est privée à
    /// son fichier, et une aiguille de gousset ne doit pas en dépendre.
    @MainActor
    private static func pocketWatchHand(from centre: CGPoint, angle: CGFloat, length: CGFloat,
                                        width: CGFloat, color: UIColor) {
        let trait = UIBezierPath()
        trait.move(to: centre)
        trait.addLine(to: CGPoint(x: centre.x + sin(angle) * length,
                                  y: centre.y - cos(angle) * length))
        trait.lineWidth = width; trait.lineCapStyle = .round
        color.setStroke()
        trait.stroke()
    }

    // MARK: - Le registre des sept

    static let timeExtraDrawers: [StickerTemplateDrawer] = [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.timeHourglass,
            name: { String(localized: "sticker.template.time.hourglass", defaultValue: "Sablier", bundle: .module) },
            measure: { s, m in Self.hourglassSize(slots: s, metrics: m) },
            draw: { s, m, échelle in Self.hourglassImage(slots: s, metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.timeStopwatch,
            name: { String(localized: "sticker.template.time.stopwatch", defaultValue: "Chrono", bundle: .module) },
            measure: { s, m in Self.stopwatchSize(slots: s, metrics: m) },
            draw: { s, m, échelle in Self.stopwatchImage(slots: s, metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.timeCalendarDay,
            name: { String(localized: "sticker.template.time.calendarDay", defaultValue: "Feuille de calendrier", bundle: .module) },
            measure: { s, m in Self.calendarDaySize(slots: s, metrics: m) },
            draw: { s, m, échelle in Self.calendarDayImage(slots: s, metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.timeAlarm,
            name: { String(localized: "sticker.template.time.alarm", defaultValue: "Réveil", bundle: .module) },
            measure: { s, m in Self.alarmSize(slots: s, metrics: m) },
            draw: { s, m, échelle in Self.alarmImage(slots: s, metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.timeTimeTag,
            name: { String(localized: "sticker.template.time.timeTag", defaultValue: "Étiquette d'heure", bundle: .module) },
            measure: { s, m in Self.timeTagSize(slots: s, metrics: m) },
            draw: { s, m, échelle in Self.timeTagImage(slots: s, metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.timeMoon,
            name: { String(localized: "sticker.template.time.moon", defaultValue: "Heure de nuit", bundle: .module) },
            measure: { s, m in Self.moonSize(slots: s, metrics: m) },
            draw: { s, m, échelle in Self.moonImage(slots: s, metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.timePocketWatch,
            name: { String(localized: "sticker.template.time.pocketWatch", defaultValue: "Montre à gousset", bundle: .module) },
            measure: { _, m in Self.pocketWatchSize(metrics: m) },
            draw: { s, m, échelle in Self.pocketWatchImage(slots: s, metrics: m, screenScale: échelle) }),
    ]
}
