import Foundation
import UIKit
import MeeshySDK

// MARK: - Les dix décorations de QUESTIONS & RÉPONSES (#4820)

/// Des mots de CONVERSATION. Six sont des cartouches à légende — une icône
/// tracée à la main à gauche, le mot à droite — dont la SILHOUETTE (pastille,
/// carte, carré) et le fond disent la réponse : vert qui jaillit pour le oui,
/// rouge pour le non, encre pour le jamais. Les quatre autres changent de forme
/// pour se lire du coin de l'œil : un point d'interrogation géant, une bulle de
/// pensée, une bulle de dialogue, un carré souligné deux fois.
///
/// Deux clés par gabarit : `sticker.template.answer.<id>` NOMME le gabarit
/// (palette, VoiceOver) et `…<id>.caption` est le mot DESSINÉ — les deux
/// coïncident souvent, mais l'urne s'appelle « Urne à vote » et dit « Vote ».
extension StickerTemplateRenderer {

    // MARK: Le patron d'un cartouche de réponse

    private struct AnswerCard {
        enum Silhouette {
            /// Une capsule — les réponses courtes, comme une puce de chat.
            case pill
            /// Une carte à coins arrondis — les réponses qui portent une icône.
            case card
        }

        let id: String
        /// Une clé LITTÉRALE par carte : une clé construite serait invisible au
        /// catalogue de chaînes, donc jamais traduite.
        let name: @MainActor () -> String
        let caption: @MainActor () -> String
        let silhouette: Silhouette
        let haut: UIColor
        let bas: UIColor
        let liseré: UIColor
        let texte: UIColor
        let icône: @MainActor (CGRect) -> Void
    }

    @MainActor
    private static func answerSize(_ carte: AnswerCard, metrics: StickerTemplateMetrics) -> CGSize {
        StickerTemplateDrawing.captionLayout(caption: carte.caption(), glyph: .custom,
                                             metrics: metrics).taille
    }

    @MainActor
    private static func answerImage(_ carte: AnswerCard, metrics: StickerTemplateMetrics,
                                    screenScale: CGFloat) -> (UIImage?, CGSize) {
        let légende = carte.caption()
        let l = StickerTemplateDrawing.captionLayout(caption: légende, glyph: .custom,
                                                     metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            // Le liseré se trace SUR le chemin : posé au bord exact du raster,
            // sa moitié extérieure serait rognée et le trait paraîtrait deux
            // fois plus fin que celui des autres familles. On rentre la forme
            // d'un demi-trait — la mesure, elle, ne bouge pas.
            let trait = max(1, metrics.fontSize * 0.05)
            let assise = cadre.insetBy(dx: trait / 2, dy: trait / 2)
            let forme: UIBezierPath
            switch carte.silhouette {
            case .pill: forme = StickerTemplateDrawing.pillPath(in: assise)
            case .card: forme = UIBezierPath(roundedRect: assise, cornerRadius: assise.height * 0.30)
            }
            StickerTemplateDrawing.fill(forme, gradientFrom: carte.haut, to: carte.bas, in: cadre)
            carte.liseré.setStroke()
            forme.lineWidth = trait
            forme.stroke()
            carte.icône(CGRect(x: metrics.horizontalPadding, y: cadre.midY - l.glyphe / 2,
                               width: l.glyphe, height: l.glyphe))
            StickerTemplateDrawing.draw(
                légende, font: l.police, color: carte.texte,
                at: CGPoint(x: metrics.horizontalPadding + l.glyphe + metrics.gap,
                            y: cadre.midY - l.tailleTexte.height / 2))
        }
    }

    private static func answerDrawer(_ carte: AnswerCard) -> StickerTemplateDrawer {
        StickerTemplateDrawer(
            id: carte.id,
            name: carte.name,
            measure: { _, m in Self.answerSize(carte, metrics: m) },
            draw: { _, m, échelle in Self.answerImage(carte, metrics: m, screenScale: échelle) })
    }

    // MARK: Les icônes dessinées à la main

    /// Un trait rond et épais, du bord au bord de `r` en fractions : la brique
    /// de la coche, de la croix et de la barre d'interdiction.
    @MainActor
    private static func stroke(_ points: [CGPoint], in r: CGRect, width: CGFloat, color: UIColor) {
        guard let premier = points.first else { return }
        let chemin = UIBezierPath()
        chemin.move(to: CGPoint(x: r.minX + r.width * premier.x, y: r.minY + r.height * premier.y))
        for point in points.dropFirst() {
            chemin.addLine(to: CGPoint(x: r.minX + r.width * point.x, y: r.minY + r.height * point.y))
        }
        chemin.lineWidth = width
        chemin.lineCapStyle = .round
        chemin.lineJoinStyle = .round
        color.setStroke()
        chemin.stroke()
    }

    /// La coche — tracée plutôt qu'empruntée à `checkmark` : un trait épais
    /// aux bouts ronds a le poids d'un « oui » crié, pas d'une case cochée.
    @MainActor
    private static func check(in r: CGRect, color: UIColor) {
        stroke([CGPoint(x: 0.16, y: 0.56), CGPoint(x: 0.40, y: 0.80), CGPoint(x: 0.86, y: 0.24)],
               in: r, width: max(1, r.width * 0.17), color: color)
    }

    @MainActor
    private static func cross(in r: CGRect, color: UIColor) {
        let épaisseur = max(1, r.width * 0.17)
        stroke([CGPoint(x: 0.24, y: 0.24), CGPoint(x: 0.76, y: 0.76)], in: r, width: épaisseur, color: color)
        stroke([CGPoint(x: 0.76, y: 0.24), CGPoint(x: 0.24, y: 0.76)], in: r, width: épaisseur, color: color)
    }

    /// Le geste « OK » — l'anneau du pouce et de l'index, trois doigts levés
    /// derrière. TRACÉ, comme la coche et la croix : un emoji emprunté à la
    /// table du système change de dessin d'une version d'iOS à l'autre, et une
    /// décoration doit se rendre pareil sur iOS 16 et sur iOS 26. C'est la
    /// règle que les vingt-neuf autres gabarits de ce lot suivent ; celui-ci
    /// l'a violée le temps d'une relecture.
    @MainActor
    private static func okRing(in r: CGRect, color: UIColor) {
        let côté = min(r.width, r.height)
        let trait = max(1, côté * 0.12)
        let anneau = CGRect(x: r.minX + r.width * 0.04, y: r.minY + r.height * 0.42,
                            width: côté * 0.48, height: côté * 0.48)
        let cercle = UIBezierPath(ovalIn: anneau.insetBy(dx: trait / 2, dy: trait / 2))
        cercle.lineWidth = trait
        color.setStroke()
        cercle.stroke()
        // Trois doigts, le majeur le plus haut — le geste se lit à la
        // silhouette, jamais au détail.
        let doigts: [(CGFloat, CGFloat)] = [(0.58, 0.16), (0.74, 0.06), (0.90, 0.20)]
        for (x, sommet) in doigts {
            stroke([CGPoint(x: x, y: 0.62), CGPoint(x: x, y: sommet)],
                   in: r, width: trait, color: color)
        }
    }

    /// Le tilde de l'hésitation — une vague en deux courbes, qui monte puis
    /// redescend : le « ~ » d'un « peut-être » écrit à la main.
    @MainActor
    private static func tilde(in r: CGRect, color: UIColor) {
        let l = r.width, h = r.height
        let vague = UIBezierPath()
        vague.move(to: CGPoint(x: r.minX + l * 0.08, y: r.minY + h * 0.60))
        vague.addCurve(to: CGPoint(x: r.minX + l * 0.50, y: r.minY + h * 0.50),
                       controlPoint1: CGPoint(x: r.minX + l * 0.18, y: r.minY + h * 0.26),
                       controlPoint2: CGPoint(x: r.minX + l * 0.36, y: r.minY + h * 0.26))
        vague.addCurve(to: CGPoint(x: r.minX + l * 0.92, y: r.minY + h * 0.40),
                       controlPoint1: CGPoint(x: r.minX + l * 0.64, y: r.minY + h * 0.74),
                       controlPoint2: CGPoint(x: r.minX + l * 0.82, y: r.minY + h * 0.74))
        vague.lineWidth = max(1, l * 0.15)
        vague.lineCapStyle = .round
        color.setStroke()
        vague.stroke()
    }

    /// Le panneau d'interdiction — un anneau et sa barre oblique.
    @MainActor
    private static func forbidden(in r: CGRect, color: UIColor) {
        let épaisseur = max(1, r.width * 0.13)
        let anneau = UIBezierPath(ovalIn: r.insetBy(dx: r.width * 0.14, dy: r.height * 0.14))
        anneau.lineWidth = épaisseur
        color.setStroke()
        anneau.stroke()
        stroke([CGPoint(x: 0.28, y: 0.28), CGPoint(x: 0.72, y: 0.72)], in: r, width: épaisseur, color: color)
    }

    /// L'urne — une boîte à couvercle fendu, et le bulletin coché qui y entre.
    /// Tracée plutôt qu'empruntée à un emoji : le dessin d'une urne change
    /// d'une version d'iOS à l'autre, et un vote doit se rendre pareil partout.
    @MainActor
    private static func ballotBox(in r: CGRect, body: UIColor, paper: UIColor, mark: UIColor) {
        let l = r.width, h = r.height
        body.setFill()
        UIBezierPath(roundedRect: CGRect(x: r.minX + l * 0.12, y: r.minY + h * 0.46,
                                         width: l * 0.76, height: h * 0.48),
                     cornerRadius: l * 0.08).fill()
        UIBezierPath(roundedRect: CGRect(x: r.minX + l * 0.04, y: r.minY + h * 0.40,
                                         width: l * 0.92, height: h * 0.14),
                     cornerRadius: l * 0.05).fill()
        // La fente : un trait clair sur le couvercle, sans lui la boîte est
        // un coffre.
        stroke([CGPoint(x: 0.34, y: 0.47), CGPoint(x: 0.66, y: 0.47)],
               in: r, width: max(1, h * 0.05), color: paper)

        let bulletin = UIBezierPath(roundedRect: CGRect(x: r.minX + l * 0.32, y: r.minY + h * 0.04,
                                                        width: l * 0.36, height: h * 0.40),
                                    cornerRadius: l * 0.04)
        paper.setFill()
        bulletin.fill()
        stroke([CGPoint(x: 0.40, y: 0.24), CGPoint(x: 0.48, y: 0.32), CGPoint(x: 0.61, y: 0.14)],
               in: r, width: max(1, l * 0.06), color: mark)
    }

    // MARK: Les six cartouches

    private static let answerCards: [AnswerCard] = [
        AnswerCard(
            id: StickerTemplateCatalog.ID.answerYes,
            name: { String(localized: "sticker.template.answer.yes", defaultValue: "Oui", bundle: .module) },
            caption: { String(localized: "sticker.template.answer.yes.caption", defaultValue: "Oui !", bundle: .module) },
            silhouette: .pill,
            haut: StickerTemplatePalette.leaf, bas: StickerTemplatePalette.sky,
            liseré: StickerTemplatePalette.surface.withAlphaComponent(0.6),
            texte: StickerTemplatePalette.surface,
            icône: { r in Self.check(in: r, color: StickerTemplatePalette.surface) }),
        AnswerCard(
            id: StickerTemplateCatalog.ID.answerNo,
            name: { String(localized: "sticker.template.answer.no", defaultValue: "Non", bundle: .module) },
            caption: { String(localized: "sticker.template.answer.no.caption", defaultValue: "Non", bundle: .module) },
            silhouette: .card,
            haut: StickerTemplatePalette.pin, bas: StickerTemplatePalette.loveCool,
            liseré: StickerTemplatePalette.surface.withAlphaComponent(0.6),
            texte: StickerTemplatePalette.surface,
            icône: { r in Self.cross(in: r, color: StickerTemplatePalette.surface) }),
        AnswerCard(
            id: StickerTemplateCatalog.ID.answerMaybe,
            name: { String(localized: "sticker.template.answer.maybe", defaultValue: "Peut-être", bundle: .module) },
            caption: { String(localized: "sticker.template.answer.maybe.caption", defaultValue: "Peut-être", bundle: .module) },
            silhouette: .card,
            haut: StickerTemplatePalette.surface, bas: StickerTemplatePalette.indigoLight.withAlphaComponent(0.7),
            liseré: StickerTemplatePalette.hairline,
            texte: StickerTemplatePalette.label,
            icône: { r in Self.tilde(in: r, color: StickerTemplatePalette.lilac) }),
        AnswerCard(
            id: StickerTemplateCatalog.ID.answerOk,
            name: { String(localized: "sticker.template.answer.ok", defaultValue: "OK", bundle: .module) },
            caption: { String(localized: "sticker.template.answer.ok.caption", defaultValue: "OK", bundle: .module) },
            silhouette: .pill,
            haut: StickerTemplatePalette.surface, bas: StickerTemplatePalette.surface,
            liseré: StickerTemplatePalette.accent.withAlphaComponent(0.55),
            texte: StickerTemplatePalette.label,
            icône: { r in Self.okRing(in: r, color: StickerTemplatePalette.accent) }),
        AnswerCard(
            id: StickerTemplateCatalog.ID.answerNever,
            name: { String(localized: "sticker.template.answer.never", defaultValue: "Jamais", bundle: .module) },
            caption: { String(localized: "sticker.template.answer.never.caption", defaultValue: "Jamais", bundle: .module) },
            silhouette: .card,
            haut: StickerTemplatePalette.ink, bas: StickerTemplatePalette.night,
            liseré: StickerTemplatePalette.surface.withAlphaComponent(0.45),
            texte: StickerTemplatePalette.surface,
            icône: { r in Self.forbidden(in: r, color: StickerTemplatePalette.pin) }),
        AnswerCard(
            id: StickerTemplateCatalog.ID.answerVote,
            name: { String(localized: "sticker.template.answer.vote", defaultValue: "Urne à vote", bundle: .module) },
            caption: { String(localized: "sticker.template.answer.vote.caption", defaultValue: "Vote", bundle: .module) },
            silhouette: .card,
            haut: StickerTemplatePalette.lilac, bas: StickerTemplatePalette.accent,
            liseré: StickerTemplatePalette.surface.withAlphaComponent(0.55),
            texte: StickerTemplatePalette.surface,
            icône: { r in Self.ballotBox(in: r, body: StickerTemplatePalette.night,
                                         paper: StickerTemplatePalette.surface,
                                         mark: StickerTemplatePalette.leaf) }),
    ]

    // MARK: - answer.what — le point d'interrogation GÉANT, le mot en capsule

    @MainActor
    private static var whatCaption: String {
        String(localized: "sticker.template.answer.what.caption", defaultValue: "Quoi ?!", bundle: .module)
    }

    private struct WhatLayout {
        let légende: String
        let police: UIFont
        let tailleTexte: CGSize
        let bord: CGFloat
        /// Le cadre du point d'interrogation, dans la boîte.
        let signe: CGRect
        /// Le cadre de la capsule d'encre qui porte le mot.
        let capsule: CGRect
        let taille: CGSize
    }

    @MainActor
    private static func whatLayout(metrics: StickerTemplateMetrics) -> WhatLayout {
        let légende = whatCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.80, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let bord = max(1, metrics.fontSize * 0.07)
        let signe = CGSize(width: metrics.fontSize * 1.3, height: metrics.fontSize * 2.6)
        let capsule = CGSize(width: ceil(tailleTexte.width + metrics.horizontalPadding * 1.4),
                             height: ceil(tailleTexte.height + metrics.verticalPadding))
        let taille = CGSize(
            width: ceil(bord * 2 + signe.width + metrics.gap + capsule.width),
            height: ceil(bord * 2 + max(signe.height, capsule.height))
        )
        // La capsule s'aligne sur le POINT du signe, pas sur son centre : le
        // mot vient après la question, en bas, comme dans une bande dessinée.
        return WhatLayout(
            légende: légende, police: police, tailleTexte: tailleTexte, bord: bord,
            signe: CGRect(x: bord, y: bord, width: signe.width, height: signe.height),
            capsule: CGRect(x: bord + signe.width + metrics.gap,
                            y: taille.height - bord - capsule.height,
                            width: capsule.width, height: capsule.height),
            taille: taille)
    }

    /// Le point d'interrogation : un crochet en arc, une tige qui descend,
    /// un point. Le tracé est ÉPAISSI en chemin fermé (`copy(strokingWithWidth:)`)
    /// pour recevoir un dégradé et un liseré comme les autres formes — un
    /// simple `stroke()` ne se remplit pas d'un dégradé.
    @MainActor
    private static func drawQuestionMark(in cadre: CGRect, gap: CGFloat, bord: CGFloat) {
        let l = cadre.width
        let cx = cadre.midX
        let trait = l * 0.26
        let rayon = l * 0.34
        let point = l * 0.30
        let yPoint = cadre.maxY - point
        let yTige = yPoint - gap * 0.5 - trait / 2
        let centreCrochet = CGPoint(x: cx, y: cadre.minY + trait / 2 + rayon)

        let ligne = UIBezierPath()
        ligne.addArc(withCenter: centreCrochet, radius: rayon,
                     startAngle: .pi, endAngle: .pi * 2.45, clockwise: true)
        ligne.addCurve(to: CGPoint(x: cx, y: yTige),
                       controlPoint1: CGPoint(x: cx + rayon * 0.05, y: centreCrochet.y + rayon * 1.35),
                       controlPoint2: CGPoint(x: cx, y: centreCrochet.y + rayon * 1.5))
        let crochet = UIBezierPath(cgPath: ligne.cgPath.copy(
            strokingWithWidth: trait, lineCap: .round, lineJoin: .round, miterLimit: 10))
        let cadreCrochet = CGRect(x: cadre.minX, y: cadre.minY, width: l, height: yTige + trait / 2 - cadre.minY)
        StickerTemplateDrawing.fillWithOutline(
            crochet, gradientFrom: StickerTemplatePalette.warmBulb, to: StickerTemplatePalette.pin,
            in: cadreCrochet, outline: StickerTemplatePalette.surface, width: bord)
        StickerTemplateDrawing.fillWithOutline(
            UIBezierPath(ovalIn: CGRect(x: cx - point / 2, y: yPoint, width: point, height: point)),
            fill: StickerTemplatePalette.pin, outline: StickerTemplatePalette.surface, width: bord)
    }

    @MainActor
    private static func whatSize(metrics: StickerTemplateMetrics) -> CGSize {
        whatLayout(metrics: metrics).taille
    }

    @MainActor
    private static func whatImage(metrics: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = whatLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            Self.drawQuestionMark(in: l.signe, gap: metrics.gap, bord: l.bord)
            let capsule = StickerTemplateDrawing.pillPath(in: l.capsule)
            StickerTemplateDrawing.fillWithOutline(
                capsule, fill: StickerTemplatePalette.ink,
                outline: StickerTemplatePalette.surface, width: l.bord * 0.6)
            StickerTemplateDrawing.drawCentered(l.légende, font: l.police,
                                                color: StickerTemplatePalette.surface, in: l.capsule)
        }
    }

    // MARK: - answer.totally — le CARRÉ souligné deux fois

    @MainActor
    private static var totallyCaption: String {
        String(localized: "sticker.template.answer.totally.caption", defaultValue: "Carrément", bundle: .module)
    }

    private struct TotallyLayout {
        let légende: String
        let police: UIFont
        let tailleTexte: CGSize
        let bord: CGFloat
        let trait: CGFloat
        let taille: CGSize
    }

    /// « Carrément » se dessine CARRÉMENT : des coins à peine arrondis, et
    /// deux traits sous le mot — un seul serait un soulignement, deux sont une
    /// insistance. Les traits entrent dans la MESURE, sinon la boîte les
    /// couperait.
    @MainActor
    private static func totallyLayout(metrics: StickerTemplateMetrics) -> TotallyLayout {
        let légende = totallyCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.82, weight: .black)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let bord = max(1, metrics.fontSize * 0.06)
        let trait = metrics.fontSize * 0.07
        let taille = CGSize(
            width: ceil(tailleTexte.width + metrics.horizontalPadding * 2 + bord * 2),
            height: ceil(tailleTexte.height + metrics.verticalPadding * 2 + trait * 4 + bord * 2)
        )
        return TotallyLayout(légende: légende, police: police, tailleTexte: tailleTexte,
                             bord: bord, trait: trait, taille: taille)
    }

    @MainActor
    private static func totallySize(metrics: StickerTemplateMetrics) -> CGSize {
        totallyLayout(metrics: metrics).taille
    }

    @MainActor
    private static func totallyImage(metrics: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = totallyLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: l.bord, dy: l.bord)
            StickerTemplateDrawing.fillWithOutline(
                UIBezierPath(roundedRect: cadre, cornerRadius: metrics.fontSize * 0.12),
                gradientFrom: StickerTemplatePalette.accent, to: StickerTemplatePalette.loveCool,
                in: cadre, outline: StickerTemplatePalette.surface, width: l.bord)
            let cadreMot = CGRect(x: cadre.minX, y: cadre.minY,
                                  width: cadre.width, height: cadre.height - l.trait * 4)
            StickerTemplateDrawing.drawCentered(l.légende, font: l.police,
                                                color: StickerTemplatePalette.surface, in: cadreMot)
            let yPremier = cadreMot.maxY + l.trait * 0.5
            let lignes: [(y: CGFloat, largeur: CGFloat)] = [
                (yPremier, l.tailleTexte.width),
                (yPremier + l.trait * 2.2, l.tailleTexte.width * 0.62),
            ]
            StickerTemplatePalette.warmBulb.setStroke()
            for ligne in lignes {
                let souligné = UIBezierPath()
                souligné.move(to: CGPoint(x: cadre.midX - ligne.largeur / 2, y: ligne.y))
                souligné.addLine(to: CGPoint(x: cadre.midX + ligne.largeur / 2, y: ligne.y))
                souligné.lineWidth = l.trait
                souligné.lineCapStyle = .round
                souligné.stroke()
            }
        }
    }

    // MARK: - answer.why — la bulle de PENSÉE

    @MainActor
    private static var whyCaption: String {
        String(localized: "sticker.template.answer.why.caption", defaultValue: "Pourquoi ?", bundle: .module)
    }

    private struct ThoughtLayout {
        let légende: String
        let police: UIFont
        let bord: CGFloat
        let queue: CGFloat
        let taille: CGSize
    }

    @MainActor
    private static func whyLayout(metrics: StickerTemplateMetrics) -> ThoughtLayout {
        let légende = whyCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.78, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let bord = max(1, metrics.fontSize * 0.07)
        let queue = metrics.fontSize * 0.9
        let corpsLargeur = tailleTexte.width + metrics.horizontalPadding * 2.4
        // Le nuage de `cloudPath` pose ses disques en fractions de la LARGEUR :
        // sous 0,62 de hauteur pour une largeur, ils déborderaient du corps.
        let corpsHauteur = max(tailleTexte.height + metrics.verticalPadding * 2.4, corpsLargeur * 0.62)
        let taille = CGSize(width: ceil(corpsLargeur + bord * 2),
                            height: ceil(corpsHauteur + queue + bord * 2))
        return ThoughtLayout(légende: légende, police: police, bord: bord, queue: queue, taille: taille)
    }

    @MainActor
    private static func whySize(metrics: StickerTemplateMetrics) -> CGSize {
        whyLayout(metrics: metrics).taille
    }

    @MainActor
    private static func whyImage(metrics: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = whyLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: l.bord, dy: l.bord)
            StickerTemplateDrawing.fillWithOutline(
                StickerTemplateDrawing.thoughtBubblePath(in: cadre, tail: l.queue),
                gradientFrom: StickerTemplatePalette.lilac, to: StickerTemplatePalette.accent,
                in: cadre, outline: StickerTemplatePalette.surface, width: l.bord)
            // Le mot se centre sur le SOCLE du nuage, pas sur son enveloppe :
            // les disques du haut sont du volume, pas de la place pour lire.
            let corps = CGRect(x: cadre.minX, y: cadre.minY,
                               width: cadre.width, height: cadre.height - l.queue)
            StickerTemplateDrawing.drawCentered(
                l.légende, font: l.police, color: StickerTemplatePalette.surface,
                in: CGRect(x: corps.minX, y: corps.minY + corps.height * 0.12,
                           width: corps.width, height: corps.height * 0.88))
        }
    }

    // MARK: - answer.tellMe — la bulle de DIALOGUE

    @MainActor
    private static var tellMeCaption: String {
        String(localized: "sticker.template.answer.tellMe.caption", defaultValue: "Dis-moi", bundle: .module)
    }

    private struct SpeechLayout {
        let légende: String
        let police: UIFont
        let bord: CGFloat
        let queue: CGFloat
        let taille: CGSize
    }

    @MainActor
    private static func tellMeLayout(metrics: StickerTemplateMetrics) -> SpeechLayout {
        let légende = tellMeCaption
        let bord = max(1, metrics.fontSize * 0.06)
        // La queue fait partie de la boîte mesurée : c'est elle que le
        // hit-test doit couvrir, pas seulement le corps.
        let queue = metrics.fontSize * 0.5
        let l = StickerTemplateDrawing.captionLayout(caption: légende, glyph: .none, metrics: metrics,
                                                     textScale: 0.82, weight: .heavy,
                                                     extraHeight: queue + bord * 2)
        return SpeechLayout(légende: légende, police: l.police, bord: bord, queue: queue,
                            taille: CGSize(width: ceil(l.taille.width + bord * 2), height: l.taille.height))
    }

    @MainActor
    private static func tellMeSize(metrics: StickerTemplateMetrics) -> CGSize {
        tellMeLayout(metrics: metrics).taille
    }

    @MainActor
    private static func tellMeImage(metrics: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = tellMeLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: l.bord, dy: l.bord)
            StickerTemplateDrawing.fillWithOutline(
                StickerTemplateDrawing.speechBubblePath(in: cadre, tail: l.queue),
                gradientFrom: StickerTemplatePalette.sky, to: StickerTemplatePalette.accent,
                in: cadre, outline: StickerTemplatePalette.surface, width: l.bord)
            let corps = CGRect(x: cadre.minX, y: cadre.minY,
                               width: cadre.width, height: cadre.height - l.queue)
            StickerTemplateDrawing.drawCentered(l.légende, font: l.police,
                                                color: StickerTemplatePalette.surface, in: corps)
        }
    }

    // MARK: - Le registre de la famille QUESTIONS & RÉPONSES

    private static let answerShapeDrawers: [StickerTemplateDrawer] = [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.answerWhat,
            name: { String(localized: "sticker.template.answer.what", defaultValue: "Quoi ?!", bundle: .module) },
            measure: { _, m in Self.whatSize(metrics: m) },
            draw: { _, m, échelle in Self.whatImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.answerTotally,
            name: { String(localized: "sticker.template.answer.totally", defaultValue: "Carrément", bundle: .module) },
            measure: { _, m in Self.totallySize(metrics: m) },
            draw: { _, m, échelle in Self.totallyImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.answerWhy,
            name: { String(localized: "sticker.template.answer.why", defaultValue: "Pourquoi ?", bundle: .module) },
            measure: { _, m in Self.whySize(metrics: m) },
            draw: { _, m, échelle in Self.whyImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.answerTellMe,
            name: { String(localized: "sticker.template.answer.tellMe", defaultValue: "Dis-moi", bundle: .module) },
            measure: { _, m in Self.tellMeSize(metrics: m) },
            draw: { _, m, échelle in Self.tellMeImage(metrics: m, screenScale: échelle) }),
    ]

    static let answerDrawers: [StickerTemplateDrawer] =
        answerCards.map { answerDrawer($0) } + answerShapeDrawers
}
