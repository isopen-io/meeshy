import XCTest
import SwiftUI
import UIKit
@testable import MeeshySDK
@testable import MeeshyUI

/// **La planche de recette de #7127 : comment un texte tourné, agrandi et
/// déplacé se DÉPOSE sur le sol.**
///
/// `SceneFramingRotatedObjectTests` dit en CHIFFRES ce que la loi retient de
/// chaque cas. Cette suite le montre : elle peint, pour chaque cas, les trois
/// états qu'une même scène traverse.
///
/// | colonne | ce qu'elle montre | qui la compose |
/// |---|---|---|
/// | la SCÈNE | le 9:16 tel que l'auteur l'a composé | `StorySlideRenderer.renderComposite` |
/// | la CARTE | ce que le fil en montre | `SceneCardHeightCap` + `SceneFocusFrame`, l'idiome de `FeedSceneAutoplay` |
/// | le SOL | le plein écran cardé | `SceneFloorView` + `SceneCard`, l'idiome de `ConversationMediaGalleryView+ScenePage` |
///
/// **Les trois compositions sont celles des hôtes, pas des imitations.** Seul
/// le CONTENU de la carte change : là où l'hôte monte `MeeshyScenePlayer`, la
/// planche pose l'image composite de la même scène — le player peint le même
/// 9:16, et un `UIViewRepresentable` ne se laisse pas capturer hors écran.
///
/// Le fond est une image à REPÈRES (quadrants colorés, grille au dixième,
/// lettres de bord) : un rognage, une rotation ou un décalage s'y lit
/// directement, là où une photo laisserait douter.
@MainActor
final class SceneRotatedTextFloorSheetTests: XCTestCase {

    /// Le viewport de l'iPhone 16 Pro, en points. 402 × 874 n'est pas 9:16 :
    /// une scène ajustée y laisse des bandes, et **c'est dans ces bandes que le
    /// sol se voit**. Un viewport exactement 9:16 ne montrerait aucun sol et la
    /// planche ne répondrait pas à la question posée.
    private static let viewport = CGSize(width: 402, height: 874)
    /// La largeur d'une carte de fil sur ce même appareil (écran moins les
    /// gouttières du fil).
    private static let largeurCarte: CGFloat = 338
    /// La scène composée : le référentiel de design, moitié résolution — assez
    /// pour voir, assez léger pour une planche de huit cas.
    private static let tailleScène = CGSize(width: 540, height: 960)

    // MARK: - Le fond à repères

    /// Une image de fond qui DIT où elle est rognée : quatre quadrants de
    /// teintes franches, une grille au dixième, les lettres des quatre bords.
    private func repères(aspect: Double) -> UIImage {
        let largeur: CGFloat = 1200
        let taille = CGSize(width: largeur, height: largeur / CGFloat(aspect))
        return UIGraphicsImageRenderer(size: taille).image { ctx in
            let c = ctx.cgContext
            let quadrants: [(CGRect, UIColor)] = [
                (CGRect(x: 0, y: 0, width: taille.width / 2, height: taille.height / 2), UIColor(red: 0.15, green: 0.35, blue: 0.75, alpha: 1)),
                (CGRect(x: taille.width / 2, y: 0, width: taille.width / 2, height: taille.height / 2), UIColor(red: 0.80, green: 0.30, blue: 0.20, alpha: 1)),
                (CGRect(x: 0, y: taille.height / 2, width: taille.width / 2, height: taille.height / 2), UIColor(red: 0.20, green: 0.55, blue: 0.35, alpha: 1)),
                (CGRect(x: taille.width / 2, y: taille.height / 2, width: taille.width / 2, height: taille.height / 2), UIColor(red: 0.55, green: 0.40, blue: 0.70, alpha: 1))
            ]
            for (rect, couleur) in quadrants {
                couleur.setFill()
                c.fill(rect)
            }
            // La grille au dixième : chaque ligne est une graduation lisible
            // après rognage.
            UIColor.white.withAlphaComponent(0.45).setStroke()
            c.setLineWidth(1.5)
            for i in 1..<10 {
                let f = CGFloat(i) / 10
                c.move(to: CGPoint(x: taille.width * f, y: 0))
                c.addLine(to: CGPoint(x: taille.width * f, y: taille.height))
                c.move(to: CGPoint(x: 0, y: taille.height * f))
                c.addLine(to: CGPoint(x: taille.width, y: taille.height * f))
            }
            c.strokePath()
            // Le cadre, pour voir si un bord a été mangé.
            UIColor.white.setStroke()
            c.setLineWidth(8)
            c.stroke(CGRect(origin: .zero, size: taille))
            // Les quatre bords nommés.
            let police = UIFont.systemFont(ofSize: 72, weight: .heavy)
            let attrs: [NSAttributedString.Key: Any] = [.font: police, .foregroundColor: UIColor.white]
            let bords: [(String, CGPoint)] = [
                ("H", CGPoint(x: taille.width / 2 - 24, y: 16)),
                ("B", CGPoint(x: taille.width / 2 - 24, y: taille.height - 100)),
                ("G", CGPoint(x: 18, y: taille.height / 2 - 44)),
                ("D", CGPoint(x: taille.width - 70, y: taille.height / 2 - 44))
            ]
            for (lettre, point) in bords {
                (lettre as NSString).draw(at: point, withAttributes: attrs)
            }
        }
    }

    // MARK: - Un cas de la planche

    private struct Cas {
        let libellé: String
        /// `nil` = aucune image de fond (le texte se dépose sur le vide).
        let fondAspect: Double?
        let texte: String
        let x: Double
        let y: Double
        let scale: Double
        let rotation: Double
    }

    /// Ce qu'un cas produit : le document (que la loi lit), la scène peinte, et
    /// l'empreinte dont le SOL se sert.
    private struct Peinture {
        let scene: SceneV3
        let composite: UIImage
        let thumbHash: String?
        let fenêtre: CGRect?
        let rapportCarte: CGFloat
    }

    private func peinture(_ cas: Cas) throws -> Peinture {
        var effects = StoryEffects()
        effects.textObjects = [
            StoryTextObject(id: "t1", text: cas.texte,
                            x: cas.x, y: cas.y,
                            scale: cas.scale, rotation: cas.rotation,
                            fontSize: 96)
        ]
        var fondImage: UIImage?
        if let aspect = cas.fondAspect {
            effects.mediaObjects = [
                StoryMediaObject(id: "bg-media", postMediaId: "media-1",
                                 mediaType: "image", placement: "media",
                                 aspectRatio: aspect,
                                 x: 0.5, y: 0.5, scale: 1, rotation: 0,
                                 isBackground: true)
            ]
            // `"fit"` — le cadrage qui laisse une bande, donc le seul où la loi
            // a quelque chose à resserrer (cf. `StoryBackgroundFraming`).
            effects.backgroundTransform = StoryBackgroundTransform(scale: 1, offsetX: 0, offsetY: 0,
                                                                  rotation: 0, videoFitMode: "fit")
            fondImage = repères(aspect: aspect)
        } else {
            effects.background = "1E1B4B"
        }

        let slide = StorySlide(id: "s1", effects: effects, duration: 12, order: 0)
        let composite = try XCTUnwrap(StorySlideRenderer.renderComposite(slide: slide,
                                                                        bgImage: fondImage,
                                                                        size: Self.tailleScène))
        // L'empreinte que le SOL peindra — celle que le composer stampe sur la
        // scène, calculée du même composite.
        let hash = StorySlideRenderer.computeThumbHash(slide: slide, bgImage: fondImage)
        let migrée = try XCTUnwrap(CanvasV3.migratedScene(effects, id: "s1"))
        let scene = SceneV3(id: migrée.id, objects: migrée.objects,
                            opening: migrée.opening, closing: migrée.closing,
                            clipTransitions: migrée.clipTransitions,
                            timelineDuration: migrée.timelineDuration,
                            thumbHash: hash,
                            carrierAspect: migrée.carrierAspect)
        return Peinture(scene: scene,
                        composite: composite,
                        thumbHash: hash,
                        fenêtre: SceneFraming.cardFocus(scene: scene),
                        rapportCarte: SceneFraming.cardAspect(scene: scene) ?? SceneShape.aspect)
    }

    // MARK: - Les deux hôtes, peints

    /// La carte du fil — l'idiome EXACT de `FeedSceneAutoplay` : le plafond de
    /// hauteur enveloppe la fenêtre de cadrage, qui enveloppe la scène.
    private func carte(_ p: Peinture) -> UIImage {
        let hauteur = min(Self.largeurCarte / p.rapportCarte,
                          Self.largeurCarte * SceneFraming.maxCardHeightRatio)
        return rendu(taille: CGSize(width: Self.largeurCarte, height: hauteur)) {
            SceneCardHeightCap(naturalAspect: p.rapportCarte) {
                SceneFocusFrame(focus: p.fenêtre) {
                    Image(uiImage: p.composite).resizable()
                }
            }
            .frame(width: Self.largeurCarte)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    /// Le plein écran CARDÉ — l'idiome de `ConversationMediaGalleryView+ScenePage` :
    /// le sol occupe l'écran, la carte se pose dessus et peint son propre fond.
    /// C'est l'état où le sol SE VOIT, donc celui que le porteur demande.
    private func sol(_ p: Peinture) -> UIImage {
        let layout = SceneShape.layout(in: Self.viewport, immersive: false)
        return rendu(taille: Self.viewport) {
            ZStack {
                SceneFloorView(thumbHash: p.thumbHash, veil: SceneFloorView.cardedVeil)
                SceneCard(layout: layout, thumbHash: p.thumbHash, paintsBackdrop: true) {
                    Image(uiImage: p.composite).resizable()
                }
            }
        }
    }

    /// **Trois voies de rendu, dans l'ordre de fidélité, et la première qui
    /// PEINT gagne.**
    ///
    /// Une planche qui sort noire est un faux vert : elle prouverait que le code
    /// tourne sans montrer ce qu'il produit. Les trois voies n'échouent pas pour
    /// les mêmes raisons — `drawHierarchy` rend la hiérarchie UIKit VRAIE (flou
    /// compris) mais rend du noir hors écran dans un processus de test unitaire ;
    /// `ImageRenderer` rend hors écran de façon déterministe mais laisse tomber
    /// les effets sans équivalent Core Graphics (le FLOU du sol) ; `layer.render`
    /// rend l'arbre de calques, sans les filtres non plus.
    ///
    /// **Ce que la planche perd, dit franchement** : là où le sol est rendu par
    /// `ImageRenderer`, son empreinte paraît NETTE au lieu d'être floutée à 60.
    /// La GÉOMÉTRIE — où la carte se pose, ce qu'elle laisse voir du sol, où le
    /// texte tombe — est exacte ; la matière du sol ne l'est pas.
    private func rendu<V: View>(taille: CGSize, @ViewBuilder _ vue: () -> V) -> UIImage {
        let contenu = vue().frame(width: taille.width, height: taille.height)
        let hôte = UIHostingController(rootView: contenu)
        hôte.view.frame = CGRect(origin: .zero, size: taille)
        hôte.view.backgroundColor = .black
        let fenêtre = UIWindow(frame: hôte.view.frame)
        fenêtre.rootViewController = hôte
        fenêtre.makeKeyAndVisible()
        hôte.view.setNeedsLayout()
        hôte.view.layoutIfNeeded()

        let parHiérarchie = UIGraphicsImageRenderer(size: taille).image { _ in
            hôte.view.drawHierarchy(in: hôte.view.bounds, afterScreenUpdates: true)
        }
        if peintQuelqueChose(parHiérarchie) { fenêtre.isHidden = true; return parHiérarchie }

        let peintre = ImageRenderer(content: contenu)
        peintre.scale = 2
        if let image = peintre.uiImage, peintQuelqueChose(image) {
            fenêtre.isHidden = true
            return image
        }

        let parCalques = UIGraphicsImageRenderer(size: taille).image { ctx in
            hôte.view.layer.render(in: ctx.cgContext)
        }
        fenêtre.isHidden = true
        return parCalques
    }

    // MARK: - La planche

    private var planche: [Cas] {
        [
            Cas(libellé: "1 · 16:9 · court · x1 · 0° · centre (référence)",
                fondAspect: 16.0 / 9.0, texte: "MEESHY", x: 0.5, y: 0.5, scale: 1, rotation: 0),
            Cas(libellé: "2 · 16:9 · court · x1 · 45° · centre",
                fondAspect: 16.0 / 9.0, texte: "MEESHY", x: 0.5, y: 0.5, scale: 1, rotation: 45),
            Cas(libellé: "3 · 16:9 · long · x2 · 45° · haut (y=0,20)",
                fondAspect: 16.0 / 9.0, texte: "Bonjour le monde entier", x: 0.5, y: 0.20, scale: 2, rotation: 45),
            Cas(libellé: "4 · 16:9 · court · x3 · 90° · bas (y=0,85)",
                fondAspect: 16.0 / 9.0, texte: "MEESHY", x: 0.5, y: 0.85, scale: 3, rotation: 90),
            Cas(libellé: "5 · 0,60 · long · x1 · 30° · bas (y=0,85)",
                fondAspect: 0.60, texte: "Bonjour le monde entier", x: 0.5, y: 0.85, scale: 1, rotation: 30),
            Cas(libellé: "6 · 9:16 · long · x2 · -30° · hors-axe (0,28 / 0,35)",
                fondAspect: 9.0 / 16.0, texte: "Bonjour le monde entier", x: 0.28, y: 0.35, scale: 2, rotation: -30),
            Cas(libellé: "7 · sans fond · long · x2 · 45° · centre",
                fondAspect: nil, texte: "Bonjour le monde entier", x: 0.5, y: 0.5, scale: 2, rotation: 45)
        ]
    }

    /// **La planche du porteur.** Elle PEINT les sept cas en trois colonnes et
    /// les joint au rapport de test ; elle assertit le minimum qui garantit
    /// qu'elle montre quelque chose — une planche noire serait un faux vert plus
    /// trompeur qu'un rouge.
    func test_plancheDuSol_texteTournéAgrandiDéplacé() throws {
        var lignes: [(Cas, Peinture, UIImage, UIImage)] = []
        for cas in planche {
            let p = try peinture(cas)
            lignes.append((cas, p, carte(p), sol(p)))
        }

        for (cas, p, carte, sol) in lignes {
            XCTAssertTrue(peintQuelqueChose(p.composite),
                          "la scène composée de « \(cas.libellé) » n'a rien peint")
            XCTAssertTrue(peintQuelqueChose(carte), "la carte de « \(cas.libellé) » est uniforme")
            XCTAssertTrue(peintQuelqueChose(sol), "le sol de « \(cas.libellé) » est uniforme")
        }

        let planche = contactSheet(lignes)
        let pièce = XCTAttachment(image: planche)
        pièce.name = "planche-7127-sol-texte-tourné"
        pièce.lifetime = .keepAlways
        add(pièce)

        // **La planche s'écrit TOUJOURS, et son chemin s'imprime.** Le dossier
        // temporaire du processus de test est lisible depuis l'hôte : c'est ce
        // qui permet de joindre la planche à l'issue sans qu'un témoin écrive
        // dans le dépôt.
        // Le dossier de CACHES du conteneur, pas `temporaryDirectory` : le
        // runtime du simulateur nettoie le temporaire à la sortie du processus,
        // et la planche disparaissait entre son écriture et sa lecture.
        let dossier = (FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
                       ?? FileManager.default.temporaryDirectory)
            .appendingPathComponent("recette-7127", isDirectory: true)
        try? FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
        if let data = planche.pngData() {
            let url = dossier.appendingPathComponent("planche-7127-sol.png")
            try data.write(to: url)
            print("=== PLANCHE 7127 : \(url.path) ===")
        }
        for (cas, p, carteImage, solImage) in lignes {
            let base = cas.libellé.prefix(1)
            for (suffixe, image) in [("scene", p.composite), ("carte", carteImage), ("sol", solImage)] {
                let f = dossier.appendingPathComponent("cas-\(base)-\(suffixe).png")
                if let d = image.pngData() { try? d.write(to: f) }
            }
        }
    }

    /// Une image UNIFORME n'a rien peint : on compare quatre points écartés.
    /// Grossier et suffisant — il s'agit d'attraper une planche noire, pas de
    /// juger un rendu.
    private func peintQuelqueChose(_ image: UIImage) -> Bool {
        guard let cg = image.cgImage else { return false }
        let points = [CGPoint(x: 0.25, y: 0.25), CGPoint(x: 0.75, y: 0.3),
                      CGPoint(x: 0.5, y: 0.5), CGPoint(x: 0.4, y: 0.8)]
        var couleurs = Set<UInt32>()
        let largeur = cg.width, hauteur = cg.height
        guard largeur > 0, hauteur > 0,
              let data = cg.dataProvider?.data,
              let octets = CFDataGetBytePtr(data) else { return false }
        let parLigne = cg.bytesPerRow
        let parPixel = cg.bitsPerPixel / 8
        for p in points {
            let x = min(largeur - 1, max(0, Int(CGFloat(largeur) * p.x)))
            let y = min(hauteur - 1, max(0, Int(CGFloat(hauteur) * p.y)))
            let i = y * parLigne + x * parPixel
            guard i + 2 < CFDataGetLength(data) else { continue }
            couleurs.insert(UInt32(octets[i]) << 16 | UInt32(octets[i + 1]) << 8 | UInt32(octets[i + 2]))
        }
        return couleurs.count > 1
    }

    /// La planche : une ligne par cas, trois vignettes et le libellé.
    private func contactSheet(_ lignes: [(Cas, Peinture, UIImage, UIImage)]) -> UIImage {
        let largeurVignette: CGFloat = 190
        // La plus HAUTE des trois vignettes à largeur égale : le plein écran,
        // plus vertical que le 9:16 de la scène. Prendre le 9:16 ferait déborder
        // la colonne du sol sur la ligne suivante.
        let hauteurLigne: CGFloat = largeurVignette
            / min(SceneShape.aspect, Self.viewport.width / Self.viewport.height)
        let marge: CGFloat = 16
        let hauteurTitre: CGFloat = 26
        let largeur: CGFloat = 1120
        let taille = CGSize(width: largeur,
                            height: (hauteurLigne + hauteurTitre + marge) * CGFloat(lignes.count) + marge)
        return UIGraphicsImageRenderer(size: taille).image { ctx in
            UIColor(white: 0.08, alpha: 1).setFill()
            ctx.cgContext.fill(CGRect(origin: .zero, size: taille))
            var y = marge
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 15, weight: .semibold),
                .foregroundColor: UIColor.white
            ]
            let légende: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 12, weight: .regular),
                .foregroundColor: UIColor(white: 0.7, alpha: 1)
            ]
            for (cas, p, carteImage, solImage) in lignes {
                let fenêtre = p.fenêtre.map { String(format: "fenêtre y∈[%.3f,%.3f]", $0.minY, $0.maxY) }
                    ?? "fenêtre : aucune (scène entière)"
                (cas.libellé as NSString).draw(at: CGPoint(x: marge, y: y), withAttributes: attrs)
                ("  —  \(fenêtre) · rapport carte \(String(format: "%.3f", p.rapportCarte))" as NSString)
                    .draw(at: CGPoint(x: marge + 430, y: y + 2), withAttributes: légende)
                y += hauteurTitre
                var x = marge
                // **Les trois vignettes se normalisent en LARGEUR, jamais en
                // hauteur.** À hauteur égale, une carte courte est dessinée plus
                // GROSSE que la scène dont elle vient, et la planche donne à
                // croire à un zoom que le cadrage ne fait pas (`fullWidth` :
                // largeur pleine ⇒ échelle 1). Normaliser en largeur rend les
                // trois colonnes comparables à l'œil.
                for (titre, image) in [("scène", p.composite), ("carte", carteImage), ("sol", solImage)] {
                    let rapport = image.size.width / image.size.height
                    let w = largeurVignette
                    let h = w / rapport
                    image.draw(in: CGRect(x: x, y: y, width: w, height: h))
                    UIColor(white: 0.35, alpha: 1).setStroke()
                    ctx.cgContext.setLineWidth(1)
                    ctx.cgContext.stroke(CGRect(x: x, y: y, width: w, height: h))
                    (titre as NSString).draw(at: CGPoint(x: x + 4, y: y + h - 18), withAttributes: légende)
                    x += w + marge
                }
                y += hauteurLigne + marge
            }
        }
    }
}
