import XCTest
import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Un glyphe posé NU sur un média se lit sur ce qu'il a SOUS LUI** (#6704, #6693).
///
/// ## Les défauts, mesurés au simulateur le 2026-09-15
///
/// - Lecteur de Réels, mire de barres vives : J'aime 2,17:1, Enregistrer 2,62:1. La
///   moyenne du média ENTIER restait sous le seuil, la bande sous le rail était claire.
/// - Lecteur de story, story crème : Envoyer, Vues, Partager, Enregistrer à 1,09–1,14:1,
///   peints en blanc fixe.
///
/// ## Ce que ces témoins mesurent
///
/// La DÉCISION de chaque rail, de bout en bout, confrontée à ce qu'il y a VRAIMENT sous
/// le glyphe : la couleur de la fixture à cet endroit, voile compris, calculée ici par un
/// oracle indépendant. L'oracle nomme les deux glyphes que `glassControlForeground()`
/// peint — blanc en sombre, `indigo950` (#1E1B4B) en clair ; il ne décide rien.
@MainActor
final class MediaChromeRailTests: XCTestCase {

    // MARK: - Oracle

    private typealias RVB = (Int, Int, Int)

    private func luminance(_ rvb: RVB) -> Double {
        func lin(_ c: Double) -> Double { c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
        return 0.2126 * lin(Double(rvb.0) / 255) + 0.7152 * lin(Double(rvb.1) / 255) + 0.0722 * lin(Double(rvb.2) / 255)
    }

    private func contraste(_ schema: ColorScheme, surLuminance fond: Double) -> Double {
        let glyphe = schema == .dark ? 1.0 : luminance((0x1E, 0x1B, 0x4B))
        return (max(glyphe, fond) + 0.05) / (min(glyphe, fond) + 0.05)
    }

    /// Le voile bas de la page, écrit ici sans passer par le code : transparent jusqu'à
    /// mi-hauteur, noir à 60 % au bord bas.
    private func voile(_ rvb: RVB, aHauteur y: Double) -> RVB {
        let opacite = max(0, (y - 0.5) / 0.5) * 0.6
        let reste = { (c: Int) in Int((Double(c) * (1 - opacite)).rounded()) }
        return (reste(rvb.0), reste(rvb.1), reste(rvb.2))
    }

    // MARK: - Fabriques

    private let nuit: RVB = (0x1A, 0x1A, 0x2E)
    private let blanc: RVB = (0xFF, 0xFF, 0xFF)

    private func image(_ largeur: Int, _ hauteur: Int, fond: RVB, zones: [(CGRect, RVB)] = []) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        format.preferredRange = .standard
        let couleur = { (rvb: RVB) in
            UIColor(red: CGFloat(rvb.0) / 255, green: CGFloat(rvb.1) / 255, blue: CGFloat(rvb.2) / 255, alpha: 1)
        }
        return UIGraphicsImageRenderer(size: CGSize(width: largeur, height: hauteur), format: format).image { contexte in
            couleur(fond).setFill()
            contexte.fill(CGRect(x: 0, y: 0, width: largeur, height: hauteur))
            for (rect, teinte) in zones {
                couleur(teinte).setFill()
                contexte.fill(rect)
            }
        }
    }

    private func id(_ nom: String) -> String { "\(nom)-\(UUID().uuidString)" }

    private func backdrop(_ nom: String) throws -> MediaChromeBackdrop {
        try XCTUnwrap(MediaChromeBackdrop(key: id(nom), thumbHash: nil,
                                          bitmapURL: "https://staging.meeshy.me/test/\(UUID().uuidString)"))
    }

    /// La page du lecteur de Réels sur un iPhone 16 Pro, et deux glyphes de son rail :
    /// J'aime, en haut, hors du voile ; « Plus », en bas, sous le voile.
    private let page = CGRect(x: 0, y: 0, width: 402, height: 874)
    private let jaime = CGRect(x: 326, y: 394, width: 60, height: 61)
    private let plus = CGRect(x: 332, y: 726, width: 48, height: 32)

    /// La décision du rail des Réels pour un glyphe, sur une image nette.
    private func decision(_ image: UIImage, sous controle: CGRect, backdrop: MediaChromeBackdrop) throws -> ColorScheme {
        let rail = MediaChromeRail(backdrop: backdrop, stage: .reelPlayer, container: page, sharedScheme: nil)
        let sonde = try XCTUnwrap(rail.probe(for: controle))
        let mesure = try XCTUnwrap(sonde.placement.luminance(of: image))
        return MediaChromeScheme.glyphScheme(for: sonde, sample: MediaChromeSample(key: sonde.key, luminance: mesure))
    }

    // MARK: - 1 · Moyenne sombre, région claire

    /// **Moyenne sombre + région claire ⇒ glyphe lisible.** Le média est nuit sur les
    /// quatre cinquièmes et cyan sur la colonne du rail : sa moyenne décide sombre — le
    /// défaut mesuré —, la bande sous J'aime est claire.
    func test_reels_moyenneSombreEtRegionClaire_leGlypheSeLitSurSaBande() throws {
        let cyan: RVB = (0x00, 0xDC, 0xDC)
        let mire = image(90, 160, fond: nuit, zones: [(CGRect(x: 70, y: 0, width: 20, height: 160), cyan)])
        let media = try backdrop("mire")

        let moyenne = try XCTUnwrap(CanvasChromeScheme.averageRelativeLuminance(of: mire))
        XCTAssertLessThan(moyenne, CanvasChromeScheme.darkThreshold,
                          "garde de fabrique : la moyenne du média entier doit décider sombre, à toute frontière")

        let schema = try decision(mire, sous: jaime, backdrop: media)
        let ratio = contraste(schema, surLuminance: luminance(cyan))
        XCTAssertGreaterThanOrEqual(ratio, 3, "J'aime sur la bande cyan → \(schema) : \(String(format: "%.2f", ratio)):1")
    }

    // MARK: - 2 · Le voile de la page

    /// **Le rail traverse le voile bas de la page.** Sur un gris moyen, J'aime se lit sur
    /// le gris et « Plus » sur le gris assombri : une même teinte pour les deux en
    /// laisserait un sous 3:1.
    func test_reels_leVoileBas_estComptéSousLesGlyphesDuBas() throws {
        let gris: RVB = (153, 153, 153)
        let aplat = image(90, 160, fond: gris)
        let media = try backdrop("gris")

        for (nom, controle) in [("J'aime", jaime), ("Plus", plus)] {
            let schema = try decision(aplat, sous: controle, backdrop: media)
            let fond = luminance(voile(gris, aHauteur: Double(controle.midY / page.height)))
            let ratio = contraste(schema, surLuminance: fond)
            XCTAssertGreaterThanOrEqual(ratio, 3, "\(nom) sur le gris voilé → \(schema) : \(String(format: "%.2f", ratio)):1")
        }
    }

    // MARK: - 3 · Le cadre affiché

    /// **La région se lit dans le cadre AFFICHÉ.** Un réel paysage se montre entier
    /// (`.fit`) : sous J'aime, c'est son bord droit, blanc. Lu bord à bord, ce serait son
    /// centre, nuit.
    func test_reels_laRegionEstRapporteeAuCadrageDuMedia() throws {
        let paysage = image(160, 90, fond: nuit, zones: [(CGRect(x: 112, y: 0, width: 48, height: 90), blanc)])
        let schema = try decision(paysage, sous: jaime, backdrop: try backdrop("paysage"))
        let fond = luminance(voile(blanc, aHauteur: Double(jaime.midY / page.height)))
        let ratio = contraste(schema, surLuminance: fond)
        XCTAssertGreaterThanOrEqual(ratio, 3, "J'aime sur le bord droit du réel paysage → \(schema) : \(String(format: "%.2f", ratio)):1")
    }

    // MARK: - 4 · L'empreinte, une mesure par cellule

    /// **La mesure passe par l'empreinte du média, une fois par cellule.** Un réel nuit en
    /// haut, blanc en bas : un glyphe haut et un glyphe bas ne partagent pas leur teinte,
    /// et une cellule mesurée se sert ensuite sans recalcul.
    func test_reels_lEmpreinteSeLitParCellule_etSeSertSansRecalcul() async throws {
        let moitie = image(90, 160, fond: nuit, zones: [(CGRect(x: 0, y: 80, width: 90, height: 80), blanc)])
        let empreinte = try XCTUnwrap(moitie.toThumbHash(), "fabrique : l'image doit s'encoder")
        let media = FeedMedia(id: id("media"), type: .video, url: "https://staging.meeshy.me/p/\(UUID().uuidString)",
                              thumbHash: empreinte)
        let post = FeedPost(id: id("reel"), author: "Demo", content: "", media: [media])
        let rail = MediaChromeRail(backdrop: .reel(post, visibleMediaId: nil), stage: .reelPlayer,
                                   container: page, sharedScheme: nil)

        let haut = CGRect(x: 326, y: 180, width: 60, height: 61)
        let bas = CGRect(x: 326, y: 580, width: 60, height: 61)
        for (nom, controle, dessous) in [("haut", haut, nuit), ("bas", bas, blanc)] {
            let sonde = try XCTUnwrap(rail.probe(for: controle))
            XCTAssertNil(MediaLuminanceSampler.memoized(sonde), "garde de fabrique : cellule jamais mesurée")
            let mesure = await MediaLuminanceSampler.sample(sonde)
            XCTAssertNotNil(mesure, "un réel porteur d'une empreinte doit être mesuré")
            XCTAssertEqual(MediaLuminanceSampler.memoized(sonde), mesure)

            let schema = MediaChromeScheme.glyphScheme(for: sonde, sample: mesure)
            let fond = luminance(voile(dessous, aHauteur: Double(controle.midY / page.height)))
            let ratio = contraste(schema, surLuminance: fond)
            XCTAssertGreaterThanOrEqual(ratio, 3, "glyphe \(nom) → \(schema) : \(String(format: "%.2f", ratio)):1")
        }
    }

    // MARK: - 5 · La géométrie de la page

    /// La zone sûre ne décale pas la cellule : le média va jusqu'aux bords, le rail se
    /// mesure dans le cadre qui les comprend.
    func test_leRail_situeLeControleDansLeCadreBordsCompris() throws {
        let cadre = MediaChromeRail.fullBleed(size: CGSize(width: 402, height: 778),
                                              insets: EdgeInsets(top: 62, leading: 0, bottom: 34, trailing: 0))
        XCTAssertEqual(cadre, CGRect(x: 0, y: -62, width: 402, height: 874))

        let media = try backdrop("page")
        let dansLaZoneSure = MediaChromeRail(backdrop: media, stage: .reelPlayer, container: cadre, sharedScheme: nil)
        let bordABord = MediaChromeRail(backdrop: media, stage: .reelPlayer, container: page, sharedScheme: nil)
        XCTAssertEqual(dansLaZoneSure.probe(for: jaime.offsetBy(dx: 0, dy: -62)), bordABord.probe(for: jaime))
    }

    // MARK: - 6 · Lecteur de story

    private func storyAvecFond(_ rvb: RVB) throws -> StoryItem {
        let aplat = image(54, 96, fond: rvb)
        let media = FeedMedia(id: id("media"), type: .image, url: "https://staging.meeshy.me/s/\(UUID().uuidString)",
                              thumbHash: try XCTUnwrap(aplat.toThumbHash(), "fabrique : l'aplat doit s'encoder"))
        var effets = StoryEffects()
        effets.mediaObjects = [StoryMediaObject(postMediaId: media.id, aspectRatio: nil, isBackground: true)]
        return StoryItem(id: id("story"), media: [media], storyEffects: effets)
    }

    private func railDeStory(_ story: StoryItem) async throws -> (ColorScheme, MediaChromeProbe) {
        let fond = try XCTUnwrap(MediaChromeBackdrop.story(story), "une slide à fond média se lit sur son média")
        let stage = MediaChromeStage.storyRail(canvasAspect: 9.0 / 16.0)
        let sonde = try XCTUnwrap(MediaChromeRail(backdrop: fond, stage: stage, container: nil, sharedScheme: nil).probe(for: nil))
        let mesure = await MediaLuminanceSampler.sample(sonde)
        XCTAssertNotNil(mesure, "une slide porteuse d'une empreinte doit être mesurée")
        let schema = try XCTUnwrap(MediaChromeRail.sharedScheme(stage: stage, backdrop: fond, sample: mesure, flatBackground: nil))
        return (schema, sonde)
    }

    /// **Slide claire ⇒ schéma clair.** La story crème de la recette : son rail
    /// s'assombrit, et la mesure de la slide se sert ensuite sans recalcul.
    func test_story_uneSlideClaire_donneUnRailClair_mesureUneFoisParSlide() async throws {
        let creme: RVB = (0xF5, 0xEE, 0xDC)
        let (schema, sonde) = try await railDeStory(try storyAvecFond(creme))

        XCTAssertEqual(schema, .light)
        XCTAssertGreaterThanOrEqual(contraste(schema, surLuminance: luminance(creme)), 3)
        XCTAssertNotNil(MediaLuminanceSampler.memoized(sonde))
    }

    func test_story_leRailSeLitSurUneSlideClaireMoyenneEtSombre() async throws {
        let fonds: [RVB] = [(0xF5, 0xEE, 0xDC), (0x80, 0x80, 0x80), (0x1A, 0x1A, 0x2E)]
        for fond in fonds {
            let (schema, _) = try await railDeStory(try storyAvecFond(fond))
            let ratio = contraste(schema, surLuminance: luminance(fond))
            XCTAssertGreaterThanOrEqual(ratio, 3, "fond \(fond) → \(schema) : \(String(format: "%.2f", ratio)):1")
        }
    }

    /// **L'empreinte déclarée tombe là où le rail EST.** Une empreinte juste en forme et
    /// fausse en place mesurerait le composer ou l'en-tête, et rien ne rougirait : la
    /// décision resterait « une luminance », simplement pas celle-là. Gardée par ses
    /// PROPRIÉTÉS — colonne de droite, étroite, traversant la carte — pour qu'un
    /// changement de gabarit puisse bouger les nombres sans casser le témoin.
    func test_story_lEmpreinteDeclaree_tombeSurLaColonneDuRail() throws {
        guard case .declared(let empreinte) = MediaChromeStage.storyRail(canvasAspect: 9.0 / 16.0) else {
            return XCTFail("le rail de story DÉCLARE son empreinte : le canvas ne la lui donne pas")
        }
        let zone = empreinte.region
        XCTAssertGreaterThanOrEqual(zone.minX, 0.6, "le rail vit sur la colonne de DROITE")
        XCTAssertLessThanOrEqual(zone.maxX, 1.0, "il ne sort pas de la carte")
        XCTAssertLessThanOrEqual(zone.width, 0.25, "une colonne de ~68 pt, pas un quart de carte de plus")
        XCTAssertGreaterThanOrEqual(zone.minY, 0.08, "il commence SOUS les barres de progression et l'en-tête")
        XCTAssertLessThanOrEqual(zone.minY, 0.20,
                                 "et il s'ouvre JUSTE sous elles (0,115), pas au quart de la carte : "
                                     + "une empreinte trop basse prend le composer et manque le haut du rail")
        XCTAssertLessThanOrEqual(zone.maxY, 0.94, "il s'arrête AU-DESSUS du composer")
        XCTAssertGreaterThanOrEqual(zone.height, 0.75,
                                    "le rail traverse la carte : une bande courte mesurerait une autre région que la sienne")
    }

    /// Une slide sans média se lit par la loi du fond uni — la même que l'en-tête du lecteur.
    func test_story_uneSlideSansMedia_seLitParLaLoiDuFondUni() {
        let stage = MediaChromeStage.storyRail(canvasAspect: 9.0 / 16.0)
        for (hex, attendu) in [("F5EEDC", ColorScheme.light), ("1A1A2E", ColorScheme.dark)] {
            let slide = StoryItem(id: id("story"), storyEffects: StoryEffects(background: hex))
            XCTAssertNil(MediaChromeBackdrop.story(slide))
            XCTAssertEqual(MediaChromeRail.sharedScheme(stage: stage, backdrop: nil, sample: nil,
                                                       flatBackground: slide.storyEffects?.background),
                           attendu, hex)
        }
    }

    // MARK: - 7 · Câblage

    private func source(_ chemin: String) throws -> String {
        try String(contentsOf: URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(chemin), encoding: .utf8)
    }

    /// Le voile que la mesure compose est celui que la page PEINT, et les deux rails
    /// portent la décision par glyphe.
    func test_lesDeuxRails_sontCablesSurLaDecisionParGlyphe() throws {
        let page = try source("Meeshy/Features/Main/Views/ReelsPlayerView.swift")
        XCTAssertTrue(page.contains("MediaChromeVeil.reelPlayer.gradient"))
        XCTAssertTrue(page.contains(".mediaChromeRail(for: .reel(reel, visibleMediaId: visibleCarouselMediaId), stage: .reelPlayer)"))

        let railReels = try source("Meeshy/Features/Main/Views/ReelsPlayerView+ActionRail.swift")
        XCTAssertEqual(railReels.components(separatedBy: ".mediaChromeGlyph()").count - 1, 2)

        let railStory = try source("Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift")
        XCTAssertTrue(railStory.contains(".mediaChromeRail(for: .story(currentStory)"))
        let bouton = try source("Meeshy/Features/Main/Views/StoryViewerView+ActionButton.swift")
        XCTAssertTrue(bouton.contains(".mediaChromeGlyph()"))
        XCTAssertFalse(bouton.contains(".foregroundColor(.white"), "le glyphe et le libellé ne sont plus blancs d'office")
    }
}
