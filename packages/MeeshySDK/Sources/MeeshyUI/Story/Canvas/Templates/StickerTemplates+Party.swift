import Foundation
import UIKit
import MeeshySDK

// MARK: - Les dix décorations de FÊTE (#4820)

/// Une fête se DESSINE plutôt qu'elle ne s'écrit : sept gabarits tracent leur
/// motif à la main — gâteau, ballons, cadeau, gerbes, boule à facettes,
/// chapeau, ruban — et trois posent un symbole SF sur une forme dessinée. Les
/// légendes viennent de `String(localized:)`, donc de la langue du LECTEUR,
/// comme la météo : l'id porte le sens, le dessin le dit dans chaque langue.
extension StickerTemplateRenderer {

    // MARK: - Le patron « motif dessus, légende dessous »

    private struct PartyStack {
        let légende: String
        let police: UIFont
        let art: CGRect
        let origineTexte: CGPoint
        let taille: CGSize
    }

    /// Une carte empilée : le motif reçoit son cadre en pixels, ses dimensions
    /// se déclarent en CORPS (`fontSize`) — rien n'y compte en points.
    private struct StackCard {
        let id: String
        /// Une clé LITTÉRALE par carte : une clé construite serait invisible au
        /// catalogue de chaînes, donc jamais traduite.
        let name: @MainActor () -> String
        let artWidth: CGFloat
        let artHeight: CGFloat
        let extraHeight: CGFloat
        let texte: UIColor
        let fond: @MainActor (CGSize, StickerTemplateMetrics) -> Void
        let art: @MainActor (CGRect) -> Void
    }

    /// La LARGEUR est celle du plus large des deux : « Bravo » est plus étroit
    /// qu'un gâteau, « Joyeux anniversaire » plus large qu'un cadeau — et une
    /// traduction peut inverser l'ordre.
    @MainActor
    private static func stackLayout(_ carte: StackCard, metrics m: StickerTemplateMetrics) -> PartyStack {
        let légende = carte.name()
        let art = CGSize(width: m.fontSize * carte.artWidth, height: m.fontSize * carte.artHeight)
        let base = StickerTemplateDrawing.captionLayout(
            caption: légende, glyph: .none, metrics: m, textScale: 0.70,
            extraHeight: art.height + m.gap + m.fontSize * carte.extraHeight)
        let largeur = max(base.taille.width, ceil(art.width + m.horizontalPadding * 2))
        let cadreArt = CGRect(x: (largeur - art.width) / 2, y: m.verticalPadding, width: art.width, height: art.height)
        return PartyStack(
            légende: légende, police: base.police, art: cadreArt,
            origineTexte: CGPoint(x: (largeur - base.tailleTexte.width) / 2, y: cadreArt.maxY + m.gap),
            taille: CGSize(width: largeur, height: base.taille.height))
    }

    @MainActor
    private static func stackImage(_ carte: StackCard, metrics m: StickerTemplateMetrics,
                                   screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = stackLayout(carte, metrics: m)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            carte.fond(l.taille, m)
            carte.art(l.art)
            StickerTemplateDrawing.draw(l.légende, font: l.police, color: carte.texte, at: l.origineTexte)
        }
    }

    private static func stackDrawer(_ carte: StackCard) -> StickerTemplateDrawer {
        StickerTemplateDrawer(id: carte.id, name: { carte.name() },
                              measure: { _, m in Self.stackLayout(carte, metrics: m).taille },
                              draw: { _, m, échelle in Self.stackImage(carte, metrics: m, screenScale: échelle) })
    }

    /// La carte arrondie sous un empilement ; le liseré la détache d'une photo sombre.
    @MainActor
    private static func partyCard(_ taille: CGSize, metrics m: StickerTemplateMetrics,
                                  haut: UIColor, bas: UIColor, outline: UIColor) {
        let bord = max(1, m.fontSize * 0.05)
        let cadre = CGRect(origin: .zero, size: taille)
        let carte = UIBezierPath(roundedRect: cadre.insetBy(dx: bord / 2, dy: bord / 2),
                                 cornerRadius: m.fontSize * 0.45)
        StickerTemplateDrawing.fill(carte, gradientFrom: haut, to: bas, in: cadre)
        outline.setStroke(); carte.lineWidth = bord; carte.stroke()
    }

    /// La queue de la bulle du chapeau, en corps — dans la MESURE, pour que la boîte de tap la couvre.
    private static let partyHatTail: CGFloat = 0.5

    @MainActor
    private static func partyBubble(_ taille: CGSize, metrics m: StickerTemplateMetrics) {
        let bord = max(1, m.fontSize * 0.05)
        let cadre = CGRect(origin: .zero, size: taille)
        let bulle = StickerTemplateDrawing.speechBubblePath(in: cadre.insetBy(dx: bord, dy: bord),
                                                            tail: m.fontSize * partyHatTail)
        StickerTemplateDrawing.fillWithOutline(bulle, gradientFrom: StickerTemplatePalette.loveWarm,
                                               to: StickerTemplatePalette.loveCool, in: cadre,
                                               outline: StickerTemplatePalette.surface, width: bord)
    }

    // MARK: - Les quatre cartes empilées

    private static let stackCards: [StackCard] = [
        StackCard(id: StickerTemplateCatalog.ID.partyBirthday,
                  name: { String(localized: "sticker.template.party.birthday", defaultValue: "Joyeux anniversaire", bundle: .module) },
                  artWidth: 2.6, artHeight: 2.3, extraHeight: 0, texte: StickerTemplatePalette.label,
                  fond: { taille, m in Self.partyCard(taille, metrics: m, haut: StickerTemplatePalette.surface,
                                                      bas: StickerTemplatePalette.indigoLight, outline: StickerTemplatePalette.hairline) },
                  art: { r in Self.cake(in: r) }),
        StackCard(id: StickerTemplateCatalog.ID.partyGift,
                  name: { String(localized: "sticker.template.party.gift", defaultValue: "Cadeau", bundle: .module) },
                  artWidth: 2.2, artHeight: 2.4, extraHeight: 0, texte: StickerTemplatePalette.surface,
                  fond: { taille, m in Self.partyCard(taille, metrics: m, haut: StickerTemplatePalette.lilac,
                                                      bas: StickerTemplatePalette.accent, outline: StickerTemplatePalette.surface.withAlphaComponent(0.6)) },
                  art: { r in Self.giftBox(in: r) }),
        StackCard(id: StickerTemplateCatalog.ID.partyFireworks,
                  name: { String(localized: "sticker.template.party.fireworks", defaultValue: "Feu d'artifice", bundle: .module) },
                  artWidth: 2.8, artHeight: 2.2, extraHeight: 0, texte: StickerTemplatePalette.surface,
                  fond: { taille, m in Self.partyCard(taille, metrics: m, haut: StickerTemplatePalette.night,
                                                      bas: StickerTemplatePalette.ink, outline: StickerTemplatePalette.surface.withAlphaComponent(0.5)) },
                  art: { r in Self.fireworks(in: r) }),
        StackCard(id: StickerTemplateCatalog.ID.partyPartyHat,
                  name: { String(localized: "sticker.template.party.partyHat", defaultValue: "C'est la fête", bundle: .module) },
                  artWidth: 2.6, artHeight: 2.1, extraHeight: partyHatTail, texte: StickerTemplatePalette.surface,
                  fond: { taille, m in Self.partyBubble(taille, metrics: m) },
                  art: { r in
                      Self.hat(in: r.insetBy(dx: r.width * 0.24, dy: 0))
                      Self.confetti(in: r)
                  }),
    ]

    // MARK: - party.birthday — le gâteau à bougies

    /// Deux étages arrondis, un glaçage à festons, trois bougies. Les flammes sont
    /// des `dropPath` : une goutte pointe en haut et s'arrondit en bas — une flamme.
    @MainActor
    private static func cake(in r: CGRect) {
        let bas = CGRect(x: r.minX, y: r.minY + r.height * 0.62, width: r.width, height: r.height * 0.38)
        let haut = CGRect(x: r.minX + r.width * 0.15, y: r.minY + r.height * 0.34,
                          width: r.width * 0.70, height: r.height * 0.32)
        Self.tier(bas, from: StickerTemplatePalette.loveWarm, to: StickerTemplatePalette.loveCool, scallops: 5)
        Self.tier(haut, from: StickerTemplatePalette.lilac, to: StickerTemplatePalette.accent, scallops: 4)
        let largeurBougie = r.width * 0.06, hauteurBougie = r.height * 0.20, hauteurFlamme = r.height * 0.14
        let couleurs = [StickerTemplatePalette.sky, StickerTemplatePalette.loveWarm, StickerTemplatePalette.leaf]
        for (index, couleur) in couleurs.enumerated() {
            let x = haut.minX + haut.width * (0.25 + 0.25 * CGFloat(index)) - largeurBougie / 2
            let bougie = CGRect(x: x, y: haut.minY - hauteurBougie, width: largeurBougie, height: hauteurBougie)
            couleur.setFill()
            UIBezierPath(roundedRect: bougie, cornerRadius: largeurBougie * 0.3).fill()
            StickerTemplatePalette.warmBulb.setFill()
            StickerTemplateDrawing.dropPath(in: CGRect(x: bougie.midX - largeurBougie * 0.9,
                                                       y: bougie.minY - hauteurFlamme,
                                                       width: largeurBougie * 1.8, height: hauteurFlamme)).fill()
        }
    }

    /// Un étage et son glaçage à demi-disques. Le nombre de festons est DONNÉ,
    /// pas déduit : un étage étroit avec les festons du large en aurait un tronqué.
    @MainActor
    private static func tier(_ t: CGRect, from haut: UIColor, to bas: UIColor, scallops: Int) {
        let rayonCoin = t.height * 0.20
        StickerTemplateDrawing.fill(UIBezierPath(roundedRect: t, cornerRadius: rayonCoin),
                                    gradientFrom: haut, to: bas, in: t)
        let bande = CGRect(x: t.minX, y: t.minY, width: t.width, height: t.height * 0.42)
        let glaçage = UIBezierPath(roundedRect: bande, byRoundingCorners: [.topLeft, .topRight],
                                   cornerRadii: CGSize(width: rayonCoin, height: rayonCoin))
        let rayon = bande.width / CGFloat(scallops * 2)
        for index in 0..<scallops {
            glaçage.append(UIBezierPath(arcCenter: CGPoint(x: bande.minX + rayon * (1 + 2 * CGFloat(index)),
                                                           y: bande.maxY - rayon * 0.2),
                                        radius: rayon, startAngle: 0, endAngle: .pi * 2, clockwise: true))
        }
        StickerTemplatePalette.surface.setFill(); glaçage.fill()
    }

    // MARK: - party.gift — la boîte à ruban

    /// Le couvercle déborde du corps, le ruban traverse les deux, le nœud est deux
    /// boucles INCLINÉES : deux ovales à plat font des lunettes, pas un nœud.
    @MainActor
    private static func giftBox(in r: CGRect) {
        let corps = CGRect(x: r.minX + r.width * 0.08, y: r.minY + r.height * 0.48,
                           width: r.width * 0.84, height: r.height * 0.52)
        let couvercle = CGRect(x: r.minX, y: r.minY + r.height * 0.32, width: r.width, height: r.height * 0.20)
        StickerTemplateDrawing.fill(UIBezierPath(roundedRect: corps, cornerRadius: r.width * 0.06),
                                    gradientFrom: StickerTemplatePalette.loveWarm,
                                    to: StickerTemplatePalette.loveCool, in: corps)
        StickerTemplateDrawing.fill(UIBezierPath(roundedRect: couvercle, cornerRadius: r.width * 0.06),
                                    gradientFrom: StickerTemplatePalette.surface,
                                    to: StickerTemplatePalette.indigoLight, in: couvercle)
        let ruban = r.width * 0.16
        StickerTemplatePalette.warmBulb.setFill()
        UIBezierPath(rect: CGRect(x: r.midX - ruban / 2, y: couvercle.minY,
                                  width: ruban, height: corps.maxY - couvercle.minY)).fill()
        UIBezierPath(rect: CGRect(x: corps.minX, y: corps.midY - ruban / 2, width: corps.width, height: ruban)).fill()
        guard let contexte = UIGraphicsGetCurrentContext() else { return }
        let boucle = CGSize(width: r.width * 0.30, height: r.height * 0.20)
        let ancre = CGPoint(x: r.midX, y: couvercle.minY - r.height * 0.03)
        for signe in [CGFloat(1), -1] {
            contexte.saveGState()
            contexte.translateBy(x: ancre.x, y: ancre.y)
            contexte.rotate(by: 0.35 * signe)
            let ovale = UIBezierPath(ovalIn: CGRect(x: signe > 0 ? -boucle.width : 0, y: -boucle.height / 2,
                                                    width: boucle.width, height: boucle.height))
            StickerTemplatePalette.warmBulb.setFill(); ovale.fill()
            StickerTemplatePalette.pin.setStroke(); ovale.lineWidth = max(1, r.width * 0.02); ovale.stroke()
            contexte.restoreGState()
        }
        let cœurNœud = r.width * 0.12
        StickerTemplatePalette.pin.setFill()
        UIBezierPath(ovalIn: CGRect(x: ancre.x - cœurNœud / 2, y: ancre.y - cœurNœud / 2,
                                    width: cœurNœud, height: cœurNœud)).fill()
    }

    // MARK: - party.fireworks — les gerbes sur fond de nuit

    @MainActor
    private static func fireworks(in r: CGRect) {
        let trait = r.width * 0.018
        Self.burst(center: CGPoint(x: r.minX + r.width * 0.30, y: r.minY + r.height * 0.45),
                   outer: r.width * 0.28, count: 12, width: trait, color: StickerTemplatePalette.warmBulb)
        Self.burst(center: CGPoint(x: r.minX + r.width * 0.72, y: r.minY + r.height * 0.58),
                   outer: r.width * 0.24, count: 10, width: trait, color: StickerTemplatePalette.loveWarm)
        Self.burst(center: CGPoint(x: r.minX + r.width * 0.62, y: r.minY + r.height * 0.14),
                   outer: r.width * 0.11, count: 8, width: trait * 0.7, color: StickerTemplatePalette.sky)
    }

    /// Une gerbe : des rayons, une perle au bout de chacun — c'est la perle qui
    /// distingue un feu d'artifice d'un soleil.
    @MainActor
    private static func burst(center c: CGPoint, outer: CGFloat, count: Int, width: CGFloat, color: UIColor) {
        StickerTemplateDrawing.drawRays(center: c, inner: outer * 0.25, outer: outer,
                                        count: count, width: width, color: color)
        color.setFill()
        for index in 0..<count {
            let angle = CGFloat(index) / CGFloat(count) * 2 * .pi
            UIBezierPath(ovalIn: CGRect(x: c.x + cos(angle) * outer - width, y: c.y + sin(angle) * outer - width,
                                        width: width * 2, height: width * 2)).fill()
        }
        StickerTemplatePalette.surface.setFill()
        UIBezierPath(ovalIn: CGRect(x: c.x - width * 1.2, y: c.y - width * 1.2,
                                    width: width * 2.4, height: width * 2.4)).fill()
    }

    // MARK: - party.partyHat — le chapeau dans une bulle

    /// Un cône rayé, un bord et un pompon. Les rayures sont CLIPÉES au cône :
    /// les tracer jusqu'au bord ferait dix trapèzes à calculer pour le même dessin.
    @MainActor
    private static func hat(in r: CGRect) {
        guard let contexte = UIGraphicsGetCurrentContext() else { return }
        let cône = UIBezierPath()
        cône.move(to: CGPoint(x: r.midX, y: r.minY + r.height * 0.08))
        cône.addLine(to: CGPoint(x: r.maxX, y: r.maxY - r.height * 0.08))
        cône.addLine(to: CGPoint(x: r.minX, y: r.maxY - r.height * 0.08))
        cône.close()
        contexte.saveGState()
        cône.addClip()
        StickerTemplateDrawing.fill(cône, gradientFrom: StickerTemplatePalette.warmBulb,
                                    to: StickerTemplatePalette.pin, in: r)
        StickerTemplatePalette.surface.withAlphaComponent(0.55).setFill()
        let pas = r.width * 0.34
        for index in 0..<5 {
            let x = r.minX - r.width * 0.6 + pas * CGFloat(index)
            let bande = UIBezierPath()
            bande.move(to: CGPoint(x: x, y: r.maxY))
            bande.addLine(to: CGPoint(x: x + pas * 0.4, y: r.maxY))
            bande.addLine(to: CGPoint(x: x + pas * 0.4 + r.width * 0.6, y: r.minY))
            bande.addLine(to: CGPoint(x: x + r.width * 0.6, y: r.minY))
            bande.close()
            bande.fill()
        }
        contexte.restoreGState()
        StickerTemplatePalette.sky.setFill()
        UIBezierPath(roundedRect: CGRect(x: r.minX - r.width * 0.06, y: r.maxY - r.height * 0.14,
                                         width: r.width * 1.12, height: r.height * 0.12),
                     cornerRadius: r.height * 0.06).fill()
        let pompon = r.width * 0.26
        UIBezierPath(ovalIn: CGRect(x: r.midX - pompon / 2, y: r.minY, width: pompon, height: pompon)).fill()
    }

    /// Des confettis semés à des positions FIXES : une décoration se rend pareil à
    /// chaque rasterisation, le hasard la ferait scintiller d'une image à l'autre.
    @MainActor
    private static func confetti(in r: CGRect) {
        guard let contexte = UIGraphicsGetCurrentContext() else { return }
        let graines: [(x: CGFloat, y: CGFloat, angle: CGFloat)] = [
            (0.06, 0.12, 0.5), (0.16, 0.52, -0.8), (0.10, 0.88, 1.1), (0.88, 0.10, -0.4), (0.94, 0.50, 0.9),
            (0.84, 0.86, -1.2), (0.50, 0.03, 0.3), (0.30, 0.30, -0.6), (0.72, 0.34, 1.3), (0.60, 0.92, 0.2),
        ]
        let couleurs = [StickerTemplatePalette.sky, StickerTemplatePalette.warmBulb,
                        StickerTemplatePalette.surface, StickerTemplatePalette.leaf]
        let largeur = r.width * 0.09, hauteur = r.width * 0.045
        for (index, graine) in graines.enumerated() {
            contexte.saveGState()
            contexte.translateBy(x: r.minX + r.width * graine.x, y: r.minY + r.height * graine.y)
            contexte.rotate(by: graine.angle)
            couleurs[index % couleurs.count].setFill()
            UIBezierPath(roundedRect: CGRect(x: -largeur / 2, y: -hauteur / 2, width: largeur, height: hauteur),
                         cornerRadius: hauteur * 0.3).fill()
            contexte.restoreGState()
        }
    }

    // MARK: - party.balloons — les trois ballons

    @MainActor
    static func balloonsSize(metrics m: StickerTemplateMetrics) -> CGSize {
        CGSize(width: ceil(m.fontSize * 3.2), height: ceil(m.fontSize * 3.8))
    }

    @MainActor
    static func balloonsImage(metrics m: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = balloonsSize(metrics: m)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let L = taille.width, H = taille.height
            let bord = max(1, m.fontSize * 0.05)
            let nœud = CGPoint(x: L * 0.5, y: H * 0.96)
            // Les deux du bord d'abord, celui du milieu en dernier : l'ordre de
            // dessin EST la profondeur.
            let ballons: [(cadre: CGRect, haut: UIColor, bas: UIColor)] = [
                (CGRect(x: L * 0.02, y: H * 0.20, width: L * 0.36, height: H * 0.40),
                 StickerTemplatePalette.loveWarm, StickerTemplatePalette.loveCool),
                (CGRect(x: L * 0.62, y: H * 0.16, width: L * 0.36, height: H * 0.40),
                 StickerTemplatePalette.warmBulb, StickerTemplatePalette.pin),
                (CGRect(x: L * 0.30, y: H * 0.02, width: L * 0.40, height: H * 0.44),
                 StickerTemplatePalette.lilac, StickerTemplatePalette.accent),
            ]
            StickerTemplatePalette.lilac.setStroke()
            for ballon in ballons {
                let départ = CGPoint(x: ballon.cadre.midX, y: ballon.cadre.maxY)
                let ficelle = UIBezierPath()
                ficelle.move(to: départ)
                ficelle.addQuadCurve(to: nœud, controlPoint: CGPoint(x: départ.x + (nœud.x - départ.x) * 0.2,
                                                                     y: (départ.y + nœud.y) / 2 + H * 0.06))
                ficelle.lineWidth = bord * 0.7
                ficelle.stroke()
            }
            for ballon in ballons {
                Self.balloon(in: ballon.cadre, from: ballon.haut, to: ballon.bas, outline: bord)
            }
            StickerTemplatePalette.warmBulb.setFill()
            UIBezierPath(ovalIn: CGRect(x: nœud.x - bord, y: nœud.y - bord, width: bord * 2, height: bord * 2)).fill()
        }
    }

    @MainActor
    private static func balloon(in r: CGRect, from haut: UIColor, to bas: UIColor, outline bord: CGFloat) {
        let corps = r.insetBy(dx: bord / 2, dy: bord / 2)
        let ovale = UIBezierPath(ovalIn: corps)
        StickerTemplateDrawing.fill(ovale, gradientFrom: haut, to: bas, in: corps)
        StickerTemplatePalette.surface.withAlphaComponent(0.85).setStroke(); ovale.lineWidth = bord; ovale.stroke()
        let nœud = UIBezierPath()
        nœud.move(to: CGPoint(x: corps.midX, y: corps.maxY - bord))
        nœud.addLine(to: CGPoint(x: corps.midX - corps.width * 0.09, y: corps.maxY + corps.height * 0.06))
        nœud.addLine(to: CGPoint(x: corps.midX + corps.width * 0.09, y: corps.maxY + corps.height * 0.06))
        nœud.close()
        bas.setFill(); nœud.fill()
        // Le reflet : ce qui fait un ballon gonflé plutôt qu'un ovale plat.
        StickerTemplatePalette.surface.withAlphaComponent(0.45).setFill()
        UIBezierPath(ovalIn: CGRect(x: corps.minX + corps.width * 0.18, y: corps.minY + corps.height * 0.10,
                                    width: corps.width * 0.22, height: corps.height * 0.28)).fill()
    }

    // MARK: - party.cheers — les deux verres qui trinquent

    @MainActor
    static var cheersCaption: String {
        String(localized: "sticker.template.party.cheers", defaultValue: "Santé !", bundle: .module)
    }

    @MainActor
    private static func cheersLayout(metrics m: StickerTemplateMetrics) -> StickerTemplateDrawing.CaptionLayout {
        StickerTemplateDrawing.captionLayout(caption: cheersCaption, glyph: .custom, metrics: m)
    }

    @MainActor
    static func cheersImage(metrics m: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = cheersLayout(metrics: m)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let bord = max(1, m.fontSize * 0.05)
            let pilule = StickerTemplateDrawing.pillPath(in: cadre.insetBy(dx: bord / 2, dy: bord / 2))
            StickerTemplateDrawing.fill(pilule, gradientFrom: StickerTemplatePalette.night,
                                        to: StickerTemplatePalette.accent, in: cadre)
            StickerTemplatePalette.surface.withAlphaComponent(0.55).setStroke(); pilule.lineWidth = bord; pilule.stroke()
            let g = CGRect(x: m.horizontalPadding, y: cadre.midY - l.glyphe / 2, width: l.glyphe, height: l.glyphe)
            let verre = CGSize(width: g.width * 0.60, height: g.height * 0.90)
            for (position, angle) in [(CGFloat(0.30), CGFloat(0.28)), (0.70, -0.28)] {
                Self.glass(in: CGRect(x: g.minX + g.width * position - verre.width / 2,
                                      y: g.midY - verre.height / 2 + g.height * 0.05,
                                      width: verre.width, height: verre.height),
                           angle: angle, color: StickerTemplatePalette.warmBulb)
            }
            // L'éclat du choc, entre les deux buvants.
            StickerTemplatePalette.surface.setFill()
            StickerTemplateDrawing.starPath(in: CGRect(x: g.midX - g.width * 0.14, y: g.minY - g.height * 0.04,
                                                       width: g.width * 0.28, height: g.width * 0.28),
                                            points: 4, innerRatio: 0.35).fill()
            StickerTemplateDrawing.draw(
                cheersCaption, font: l.police, color: StickerTemplatePalette.surface,
                at: CGPoint(x: m.horizontalPadding + l.glyphe + m.gap, y: cadre.midY - l.tailleTexte.height / 2))
        }
    }

    /// Un verre INCLINÉ : le symbole est dessiné dans un contexte tourné autour du
    /// centre de son cadre — le seul moyen de pencher un glyphe SF sans le re-tracer.
    @MainActor
    private static func glass(in r: CGRect, angle: CGFloat, color: UIColor) {
        guard let contexte = UIGraphicsGetCurrentContext() else { return }
        contexte.saveGState()
        contexte.translateBy(x: r.midX, y: r.midY)
        contexte.rotate(by: angle)
        StickerTemplateDrawing.drawSymbol("wineglass.fill",
                                          in: CGRect(x: -r.width / 2, y: -r.height / 2, width: r.width, height: r.height),
                                          color: color, weight: .bold)
        contexte.restoreGState()
    }

    // MARK: - party.newYear — le cartouche de minuit

    @MainActor
    static var newYearCaption: String {
        String(localized: "sticker.template.party.newYear", defaultValue: "Bonne année", bundle: .module)
    }

    @MainActor
    private static func newYearLayout(metrics m: StickerTemplateMetrics) -> StickerTemplateDrawing.CaptionLayout {
        StickerTemplateDrawing.captionLayout(caption: newYearCaption, glyph: .symbol("sparkles"),
                                             metrics: m, textScale: 0.82, weight: .black)
    }

    @MainActor
    static func newYearImage(metrics m: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = newYearLayout(metrics: m)
        let légende = newYearCaption
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let bord = max(1, m.fontSize * 0.05)
            let cartouche = UIBezierPath(roundedRect: cadre.insetBy(dx: bord / 2, dy: bord / 2),
                                         cornerRadius: l.taille.height * 0.32)
            StickerTemplateDrawing.fill(cartouche, gradientFrom: StickerTemplatePalette.night,
                                        to: StickerTemplatePalette.ink, in: cadre)
            // Le ciel : quelques étoiles à des places fixes, jamais tirées au sort.
            StickerTemplatePalette.surface.withAlphaComponent(0.7).setFill()
            let étoiles: [(x: CGFloat, y: CGFloat, rayon: CGFloat)] =
                [(0.10, 0.18, 0.045), (0.88, 0.22, 0.03), (0.72, 0.80, 0.04), (0.30, 0.86, 0.025), (0.55, 0.10, 0.03)]
            for étoile in étoiles {
                let rayon = l.taille.height * étoile.rayon
                UIBezierPath(ovalIn: CGRect(x: l.taille.width * étoile.x - rayon, y: l.taille.height * étoile.y - rayon,
                                            width: rayon * 2, height: rayon * 2)).fill()
            }
            StickerTemplatePalette.warmBulb.withAlphaComponent(0.8).setStroke(); cartouche.lineWidth = bord; cartouche.stroke()
            StickerTemplateDrawing.drawSymbol("sparkles",
                                              in: CGRect(x: m.horizontalPadding, y: cadre.midY - l.glyphe / 2,
                                                         width: l.glyphe, height: l.glyphe),
                                              color: StickerTemplatePalette.warmBulb, weight: .bold)
            let marge = m.fontSize * 0.1
            Self.drawGradientText(
                légende, font: l.police,
                in: CGRect(x: m.horizontalPadding + l.glyphe + m.gap, y: cadre.midY - l.tailleTexte.height / 2,
                           width: l.tailleTexte.width + marge, height: l.tailleTexte.height + marge),
                from: StickerTemplatePalette.warmBulb, to: StickerTemplatePalette.loveWarm)
        }
    }

    /// Une légende REMPLIE d'un dégradé : le texte est posé dans une couche de
    /// transparence, puis le dégradé le recouvre en `.sourceIn` — il ne reste que
    /// là où le texte a de l'encre. Sans la couche, il effacerait le cartouche.
    @MainActor
    private static func drawGradientText(_ texte: String, font: UIFont, in rect: CGRect,
                                         from haut: UIColor, to bas: UIColor) {
        guard let contexte = UIGraphicsGetCurrentContext(),
              let dégradé = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                       colors: [haut.cgColor, bas.cgColor] as CFArray, locations: [0, 1])
        else {
            StickerTemplateDrawing.draw(texte, font: font, color: haut, at: rect.origin)
            return
        }
        contexte.saveGState()
        contexte.beginTransparencyLayer(in: rect, auxiliaryInfo: nil)
        StickerTemplateDrawing.draw(texte, font: font, color: StickerTemplatePalette.label, at: rect.origin)
        contexte.setBlendMode(.sourceIn)
        contexte.drawLinearGradient(dégradé, start: CGPoint(x: rect.midX, y: rect.minY),
                                    end: CGPoint(x: rect.midX, y: rect.maxY), options: [])
        contexte.endTransparencyLayer()
        contexte.restoreGState()
    }

    // MARK: - party.discoBall — la boule à facettes

    @MainActor
    static func discoBallSize(metrics m: StickerTemplateMetrics) -> CGSize {
        let côté = ceil(m.fontSize * 2.8)
        return CGSize(width: côté, height: ceil(côté * 1.2))
    }

    @MainActor
    static func discoBallImage(metrics m: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = discoBallSize(metrics: m)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            guard let contexte = UIGraphicsGetCurrentContext() else { return }
            let côté = taille.width
            let bord = max(1, m.fontSize * 0.06)
            let boule = CGRect(x: 0, y: taille.height - côté, width: côté, height: côté)
                .insetBy(dx: bord / 2, dy: bord / 2)
            StickerTemplatePalette.hairline.setStroke()
            let tige = UIBezierPath()
            tige.move(to: CGPoint(x: côté / 2, y: côté * 0.12))
            tige.addLine(to: CGPoint(x: côté / 2, y: boule.minY + bord))
            tige.lineWidth = bord; tige.lineCapStyle = .round; tige.stroke()
            // Les facettes : une grille clipée au disque, trois tons qui tournent
            // en diagonale — un damier à deux tons ferait un échiquier, pas une boule.
            let disque = UIBezierPath(ovalIn: boule)
            contexte.saveGState()
            disque.addClip()
            StickerTemplateDrawing.fill(disque, gradientFrom: StickerTemplatePalette.lilac,
                                        to: StickerTemplatePalette.accent, in: boule)
            let tons = [StickerTemplatePalette.surface, StickerTemplatePalette.indigoLight, StickerTemplatePalette.lilac]
            let compte = 9
            let cellule = boule.width / CGFloat(compte), joint = boule.width / CGFloat(compte) * 0.10
            for ligne in 0..<compte {
                for colonne in 0..<compte {
                    tons[(ligne * 2 + colonne) % tons.count].setFill()
                    UIBezierPath(rect: CGRect(x: boule.minX + cellule * CGFloat(colonne) + joint / 2,
                                              y: boule.minY + cellule * CGFloat(ligne) + joint / 2,
                                              width: cellule - joint, height: cellule - joint)).fill()
                }
            }
            contexte.restoreGState()
            StickerTemplatePalette.surface.setStroke(); disque.lineWidth = bord; disque.stroke()
            StickerTemplatePalette.surface.withAlphaComponent(0.5).setFill()
            UIBezierPath(ovalIn: CGRect(x: boule.minX + boule.width * 0.18, y: boule.minY + boule.height * 0.10,
                                        width: boule.width * 0.22, height: boule.height * 0.14)).fill()
            StickerTemplatePalette.warmBulb.setFill()
            StickerTemplateDrawing.starPath(in: CGRect(x: boule.maxX - boule.width * 0.30, y: boule.minY - boule.height * 0.02,
                                                       width: boule.width * 0.26, height: boule.width * 0.26),
                                            points: 4, innerRatio: 0.35).fill()
        }
    }

    // MARK: - party.congrats — le ruban doré

    @MainActor
    static var congratsCaption: String {
        String(localized: "sticker.template.party.congrats", defaultValue: "Félicitations", bundle: .module)
    }

    private struct CongratsLayout {
        let légende: String
        let police: UIFont
        let tailleTexte: CGSize
        let queue: CGFloat
        let étoile: CGFloat
        let taille: CGSize
    }

    @MainActor
    private static func congratsLayout(metrics m: StickerTemplateMetrics) -> CongratsLayout {
        let légende = congratsCaption
        let police = StickerTemplateDrawing.font(size: m.fontSize * 0.80, weight: .black)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let queue = m.fontSize * 0.5, étoile = m.fontSize * 0.62
        let taille = CGSize(
            width: ceil(queue * 2 + m.horizontalPadding * 2 + étoile * 2 + m.gap * 2 + tailleTexte.width),
            height: ceil(m.verticalPadding * 2 + max(tailleTexte.height, étoile)))
        return CongratsLayout(légende: légende, police: police, tailleTexte: tailleTexte,
                              queue: queue, étoile: étoile, taille: taille)
    }

    @MainActor
    static func congratsImage(metrics m: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = congratsLayout(metrics: m)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let bord = max(1, m.fontSize * 0.05)
            let h = l.taille.height - bord * 2, L = l.taille.width - bord * 2, q = l.queue
            // Le même ruban à chevrons que l'heure, en OR et flanqué de deux
            // étoiles : c'est la couleur et les étoiles qui le font féliciter.
            let ruban = UIBezierPath()
            ruban.move(to: CGPoint(x: bord, y: bord))
            for point in [CGPoint(x: bord + L, y: bord), CGPoint(x: bord + L - q, y: bord + h / 2),
                          CGPoint(x: bord + L, y: bord + h), CGPoint(x: bord, y: bord + h),
                          CGPoint(x: bord + q, y: bord + h / 2)] { ruban.addLine(to: point) }
            ruban.close()
            StickerTemplateDrawing.fillWithOutline(ruban, gradientFrom: StickerTemplatePalette.warmBulb,
                                                   to: StickerTemplatePalette.loveWarm, in: cadre,
                                                   outline: StickerTemplatePalette.surface, width: bord * 0.8)
            let xGauche = q + m.horizontalPadding
            let xTexte = xGauche + l.étoile + m.gap
            StickerTemplatePalette.surface.setFill()
            for x in [xGauche, xTexte + l.tailleTexte.width + m.gap] {
                StickerTemplateDrawing.starPath(in: CGRect(x: x, y: cadre.midY - l.étoile / 2,
                                                           width: l.étoile, height: l.étoile)).fill()
            }
            StickerTemplateDrawing.draw(l.légende, font: l.police, color: StickerTemplatePalette.label,
                                        at: CGPoint(x: xTexte, y: cadre.midY - l.tailleTexte.height / 2))
        }
    }

    // MARK: - party.trophy — la coupe sur son badge

    @MainActor
    static var trophyCaption: String {
        String(localized: "sticker.template.party.trophy", defaultValue: "Bravo", bundle: .module)
    }

    private struct TrophyLayout {
        let légende: String
        let police: UIFont
        let badge: CGRect
        let pastille: CGRect
        let taille: CGSize
    }

    /// Le badge rond, la pastille de légende qui le chevauche par le bas : le
    /// chevauchement soude les deux en UNE décoration.
    @MainActor
    private static func trophyLayout(metrics m: StickerTemplateMetrics) -> TrophyLayout {
        let légende = trophyCaption
        let police = StickerTemplateDrawing.font(size: m.fontSize * 0.70, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let diamètre = m.fontSize * 2.3
        let pastille = CGSize(width: tailleTexte.width + m.horizontalPadding * 1.6,
                              height: tailleTexte.height + m.verticalPadding * 1.2)
        let largeur = ceil(max(diamètre, pastille.width))
        let yPastille = diamètre - m.gap * 0.6
        return TrophyLayout(
            légende: légende, police: police,
            badge: CGRect(x: (largeur - diamètre) / 2, y: 0, width: diamètre, height: diamètre),
            pastille: CGRect(x: (largeur - pastille.width) / 2, y: yPastille,
                             width: pastille.width, height: pastille.height),
            taille: CGSize(width: largeur, height: ceil(yPastille + pastille.height)))
    }

    @MainActor
    static func trophyImage(metrics m: StickerTemplateMetrics, screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = trophyLayout(metrics: m)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1, m.fontSize * 0.07)
            let cadreBadge = l.badge.insetBy(dx: bord / 2, dy: bord / 2)
            let badge = UIBezierPath(ovalIn: cadreBadge)
            StickerTemplateDrawing.fill(badge, gradientFrom: StickerTemplatePalette.accent,
                                        to: StickerTemplatePalette.night, in: cadreBadge)
            StickerTemplatePalette.surface.setStroke(); badge.lineWidth = bord; badge.stroke()
            let liseré = UIBezierPath(ovalIn: cadreBadge.insetBy(dx: bord * 1.6, dy: bord * 1.6))
            StickerTemplatePalette.warmBulb.withAlphaComponent(0.7).setStroke(); liseré.lineWidth = bord * 0.5; liseré.stroke()
            StickerTemplateDrawing.drawSymbol("trophy.fill",
                                              in: cadreBadge.insetBy(dx: cadreBadge.width * 0.26, dy: cadreBadge.height * 0.26),
                                              color: StickerTemplatePalette.warmBulb, weight: .bold)
            let pastille = StickerTemplateDrawing.pillPath(in: l.pastille.insetBy(dx: bord * 0.4, dy: bord * 0.4))
            StickerTemplatePalette.surface.setFill(); pastille.fill()
            StickerTemplatePalette.hairline.setStroke(); pastille.lineWidth = bord * 0.8; pastille.stroke()
            StickerTemplateDrawing.drawCentered(l.légende, font: l.police,
                                                color: StickerTemplatePalette.label, in: l.pastille)
        }
    }

    // MARK: - Le registre de la famille FÊTE

    static let partyDrawers: [StickerTemplateDrawer] = stackCards.map(stackDrawer) + [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.partyBalloons,
            name: { String(localized: "sticker.template.party.balloons", defaultValue: "Ballons", bundle: .module) },
            measure: { _, m in Self.balloonsSize(metrics: m) },
            draw: { _, m, échelle in Self.balloonsImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.partyCheers,
            name: { Self.cheersCaption },
            measure: { _, m in Self.cheersLayout(metrics: m).taille },
            draw: { _, m, échelle in Self.cheersImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.partyNewYear,
            name: { Self.newYearCaption },
            measure: { _, m in Self.newYearLayout(metrics: m).taille },
            draw: { _, m, échelle in Self.newYearImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.partyDiscoBall,
            name: { String(localized: "sticker.template.party.discoBall", defaultValue: "Boule à facettes", bundle: .module) },
            measure: { _, m in Self.discoBallSize(metrics: m) },
            draw: { _, m, échelle in Self.discoBallImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.partyCongrats,
            name: { Self.congratsCaption },
            measure: { _, m in Self.congratsLayout(metrics: m).taille },
            draw: { _, m, échelle in Self.congratsImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.partyTrophy,
            name: { Self.trophyCaption },
            measure: { _, m in Self.trophyLayout(metrics: m).taille },
            draw: { _, m, échelle in Self.trophyImage(metrics: m, screenScale: échelle) }),
    ]
}
