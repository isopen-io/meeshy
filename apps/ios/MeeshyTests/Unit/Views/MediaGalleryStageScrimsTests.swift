import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Le voile de lisibilité d'un plein écran de scène part du BAS DE L'ÉCRAN et
/// prend TOUTE la largeur** (directive porteur du 2026-09-18, verbatim) :
///
/// > « Il faut bien faire attention à l'ombre dégradé pour rendre le texte
/// > lisible qui doit être mis sur tous l'écran à partir du bas de l'écran. »
///
/// ## Ce que la galerie avait, et pourquoi ce n'était pas ça
///
/// `cadreOverlay` posait un `LinearGradient` en **fond du bloc bas du cadre** :
/// un dégradé de la taille de ce bloc, donc
///
/// - il s'ARRÊTAIT au bord du bloc, **au-dessus** du couloir de la pellicule —
///   le bas de l'écran restait clair ;
/// - il ne prenait que la LARGEUR DE LA CARTE : dès que la carte est plus
///   étroite que l'écran (le cas nominal en cadré, 378 pt sur 402), les deux
///   bandes latérales n'étaient pas voilées.
///
/// Mesuré à la recette du tour 4 sur le repère F2 en cadré : la légende « REPÈRE
/// F2 — … » se lisait sur le bleu du média sans voile visible, pendant que la
/// même légende, sur la story F7, se lisait sur un bas d'écran fondu au noir sur
/// toute la largeur. C'est cet écart que la directive ferme.
///
/// ## Ce qu'elle a maintenant : le voile de la STORY, tel quel
///
/// `StoryReaderScrims` (#6701) — deux `LinearGradient` pleine largeur, ancrés au
/// HAUT et au BAS de l'écran, `.ignoresSafeArea()`, sourds au doigt, muets pour
/// VoiceOver, et qui SUIVENT le chrome (opacité 1 avec lui, 0 sans lui, au même
/// ressort). Le composant n'est pas réécrit : c'est celui de la surface de
/// référence, et son nom le dit.
///
/// ## Ce que ce fichier mesure, et ce qu'il laisse à la garde de source
///
/// Le voile de la galerie **EST** le composant, sans une ligne de différence :
/// mesurer ses pixels dans la GÉOMÉTRIE de la galerie (402 × 874, une carte
/// cadrée de 378 pt) est donc la mesure juste — elle dit ce que l'œil verra.
/// Ce qui appartient en propre à la galerie est *où* il est monté et *ce qui
/// l'alimente*, et cela ne se lit pas au pixel : `test_laGalerie…` ci-dessous
/// le lit à la SOURCE, et exige que le verdict vienne de
/// `MediaStageVeil.showsChrome(...)` — le MÊME que celui d'`overlayLayer`, sans
/// quoi le voile et les contrôles qu'il détache pourraient se désynchroniser.
@MainActor
final class MediaGalleryStageScrimsTests: XCTestCase {

    /// La fenêtre de recette : iPhone 16 Pro, 402 × 874.
    private static let fenetre = CGSize(width: 402, height: 874)
    /// La carte CADRÉE que le plateau laisse : 378 pt de large, donc 12 pt de
    /// bande claire de chaque côté — c'est cette bande que l'ancien dégradé, posé
    /// sur le bloc du cadre, ne voilait pas.
    private static let corridors = MediaStageFraming.Corridors(
        safeTop: 59, top: MediaGalleryStage.topCorridorHeight, rail: 0,
        transport: 0, safeBottom: 34, gutter: MediaGalleryStage.gutter)

    // MARK: - Les pixels

    /// Luminance `[0, 1]` du pixel `(x, y)` de la couche, rendue sur une carte
    /// cadrée BLANCHE — le fond le plus défavorable qui existe : un voile qui ne
    /// noircit pas s'y voit tout de suite.
    private func luminance(chromeVisible: Bool, x: Int, y: Int) throws -> CGFloat {
        let fenetre = Self.fenetre
        let carte = SceneShape.layout(
            in: GallerySceneStage.region(viewport: fenetre, presentation: .carded,
                                        corridors: Self.corridors),
            immersive: false)
        let contenu = ZStack {
            Color.white
            SceneCard(layout: carte, thumbHash: nil) { Color.white }
                .frame(width: carte.sceneFrame.width, height: carte.sceneFrame.height)
            StoryReaderScrims(topInset: 59, chromeVisible: chromeVisible)
        }
        .frame(width: fenetre.width, height: fenetre.height)

        let rendu = ImageRenderer(content: contenu)
        rendu.scale = 1
        let image = try XCTUnwrap(rendu.cgImage, "la couche se rend en image")

        var pixel = [UInt8](repeating: 0, count: 4)
        let lu = pixel.withUnsafeMutableBytes { tampon -> Bool in
            guard let contexte = CGContext(data: tampon.baseAddress, width: 1, height: 1,
                                           bitsPerComponent: 8, bytesPerRow: 4,
                                           space: CGColorSpaceCreateDeviceRGB(),
                                           bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return false }
            contexte.draw(image,
                          in: CGRect(origin: CGPoint(x: -CGFloat(x),
                                                     y: -CGFloat(image.height - 1 - y)),
                                     size: CGSize(width: image.width, height: image.height)))
            return true
        }
        XCTAssertTrue(lu, "le pixel se lit")
        return CGFloat(Int(pixel[0]) + Int(pixel[1]) + Int(pixel[2])) / (3 * 255)
    }

    private var derniereLigne: Int { Int(Self.fenetre.height) - 1 }
    private var miHauteur: Int { Int(Self.fenetre.height) / 2 }

    /// **La DERNIÈRE ligne de l'écran est voilée, et sur TOUTE la largeur** —
    /// les deux abscisses mesurées sont celles que l'ancien dégradé ratait pour
    /// deux raisons différentes :
    ///
    /// - `x = 5` : **hors carte**, dans la gouttière du plateau. Un dégradé posé
    ///   en fond du bloc du cadre ne peut pas l'atteindre, quelle que soit sa
    ///   hauteur — il n'est pas assez LARGE.
    /// - `x = 201` : au milieu, sous la carte. L'ancien dégradé s'arrêtait au
    ///   bord du bloc bas, donc au-dessus du couloir de la pellicule — il n'était
    ///   pas assez BAS.
    func test_chromeVisible_leBasDeLEcranEstVoileSurTouteLaLargeur() throws {
        XCTAssertLessThan(try luminance(chromeVisible: true, x: 5, y: derniereLigne), 0.5,
                          "hors carte, bord gauche : le voile prend TOUTE la largeur de l'écran")
        XCTAssertLessThan(try luminance(chromeVisible: true, x: 201, y: derniereLigne), 0.5,
                          "au milieu : le voile va jusqu'au BAS DE L'ÉCRAN, pas au bas d'un bloc")
    }

    /// **Et il ne voile QUE ce qu'il doit** : à mi-hauteur, l'image se lit telle
    /// qu'elle a été publiée. Sans ce témoin, un voile plein écran opaque
    /// passerait les deux assertions ci-dessus en assombrissant tout.
    func test_chromeVisible_leMilieuDeLEcranNestPasAssombri() throws {
        XCTAssertGreaterThan(try luminance(chromeVisible: true, x: 5, y: miHauteur), 0.95,
                            "le voile est un dégradé de LISIBILITÉ, pas un assombrissement global")
    }

    /// **Sans chrome, aucun voile** — la règle du lecteur, mot pour mot : un
    /// plein écran immersif montre l'image telle qu'elle a été publiée. C'est ce
    /// qui interdit d'alimenter le montage d'une constante.
    func test_chromeMasque_aucunVoileNeResteSurLEcran() throws {
        for (x, y) in [(5, derniereLigne), (201, derniereLigne), (5, miHauteur)] {
            XCTAssertGreaterThan(try luminance(chromeVisible: false, x: x, y: y), 0.95,
                                 "chrome effacé en (\(x), \(y)) : l'image se lit telle quelle")
        }
    }

    // MARK: - Le montage, lu à la source

    /// **La galerie MONTE le voile de la story, et l'alimente du MÊME verdict
    /// que ses contrôles.**
    ///
    /// Trois choses, qu'aucun pixel ne peut dire :
    /// 1. le montage existe, et c'est bien `StoryReaderScrims` — pas un dégradé
    ///    voisin réécrit sur place (« partir du fait que le composant est déjà
    ///    fait ») ;
    /// 2. il est alimenté par `MediaStageVeil.showsChrome(...)`, le verdict
    ///    d'`overlayLayer` — une constante laisserait l'immersif assombri, et un
    ///    second verdict désynchroniserait le voile des contrôles qu'il détache ;
    /// 3. l'ANCIEN dégradé a disparu de `cadreOverlay` : deux voiles superposés
    ///    noirciraient deux fois le bas, et la story n'en a qu'un.
    func test_laGalerie_monteLeVoileDeLaStory_surLeVerdictDeSonChrome() throws {
        let scrims = AppSourceGuard.stripComments(
            try String(contentsOf: Self.fichier("ConversationMediaGalleryView+Scrims.swift"),
                       encoding: .utf8))
        XCTAssertTrue(scrims.contains("StoryReaderScrims("),
                      "le voile de la galerie EST celui de la story — on le monte, on ne le réécrit pas")
        XCTAssertTrue(scrims.contains("MediaStageVeil.showsChrome("),
                      "et il suit le MÊME verdict de chrome que les contrôles qu'il détache")

        // **Le FICHIER RACINE, jamais l'unité** : `AppSourceGuard.unit(...)`
        // agrège le type ET toutes ses extensions, si bien que le montage
        // déclaré dans `+Scrims.swift` y satisferait l'assertion sans que le
        // `ZStack` racine ait jamais reçu la couche. C'est la couche RACINE qui
        // décide de l'ordre d'empilement — donc du fait que les contrôles
        // restent AU-DESSUS du voile.
        let racine = AppSourceGuard.stripComments(
            try String(contentsOf: Self.fichier("ConversationMediaGalleryView.swift"), encoding: .utf8))
        XCTAssertTrue(racine.contains("stageScrimsLayer"),
                      "la couche est montée dans le ZStack racine, entre le pager et les contrôles")
        let ordre = try XCTUnwrap(racine.range(of: "stageScrimsLayer"))
        let controles = try XCTUnwrap(racine.range(of: "overlayLayer"))
        XCTAssertLessThan(ordre.lowerBound, controles.lowerBound,
                          "le voile est SOUS les contrôles : il les détache, il ne les assombrit pas")

        let geometrie = AppSourceGuard.stripComments(
            try String(contentsOf: Self.fichier("ConversationMediaGalleryView+Geometry.swift"),
                       encoding: .utf8))
        XCTAssertFalse(geometrie.contains(".black.opacity(0.75)"),
                       "l'ancien dégradé du bloc bas est parti : un seul voile, celui de l'écran")
    }

    /// **Le voile vaut pour les TROIS natures de page** — photo, vidéo, scène.
    /// Le bloc de légende est le même pour les trois (`bottomOverlay` : auteur,
    /// date, légende dépliable, ligne de format) ; un voile qui ne serait monté
    /// que sur la page scène ferait de la lisibilité une propriété du TYPE de
    /// média, ce qu'elle n'est pas.
    ///
    /// Le témoin le mesure par la STRUCTURE : la couche est un frère du pager
    /// dans le `ZStack` racine, jamais un enfant d'une page — donc elle ne peut
    /// pas dépendre de la nature de la page ouverte.
    func test_leVoile_estUneCoucheDuVisualiseur_pasDUneNatureDePage() throws {
        let page = AppSourceGuard.stripComments(
            try String(contentsOf: Self.fichier("ConversationMediaGalleryView+ScenePage.swift"),
                       encoding: .utf8))
        XCTAssertFalse(page.contains("StoryReaderScrims("),
                       "le voile n'est pas monté PAR une page : il est une couche du visualiseur, " +
                       "commune aux trois natures")
    }

    private static func fichier(_ nom: String) -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
            .appendingPathComponent("Meeshy/Features/Main/Views/" + nom)
    }
}
