import XCTest
import SwiftUI
import CoreGraphics
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Le cadré d'un post et la carte d'une story sont LA MÊME carte** (directive
/// porteur du 2026-09-17, lot #6904).
///
/// > « POURQUOI ne reproduisons-nous pas la même chose que la scène des stories
/// > sur les scènes de POST ? C'est EXACTEMENT le même lecteur et le même
/// > comportement qu'il faut appliquer. »
///
/// Avant ce lot, deux assemblages ÉQUIVALENTS coexistaient — `readerCard(…)`
/// pour le lecteur, le `ZStack` de `GalleryScenePage` pour la galerie — et ils
/// avaient déjà divergé sur les deux seules choses qu'un œil voit :
///
/// | | lecteur de story | plein écran cadré d'un post |
/// |---|---|---|
/// | fond | `.thumbHashDominantColor` (couleur plate) | `.thumbHash` (hachage étiré) |
/// | rayon | 22 | 20 |
///
/// Aucun témoin ne pouvait rougir : chacun était juste chez lui. Ce fichier
/// mesure donc la chose que ni l'un ni l'autre ne mesurait — leur ACCORD —, et
/// il le fait sur les VALEURS avant de le faire sur la source.
@MainActor
final class SceneCardUnicityTests: XCTestCase {

    // MARK: - Les valeurs

    /// **Un seul fond.** La loi le nomme (`SceneShape.cardedBackdrop`) et les
    /// deux surfaces le lisent — le lecteur par `readerSceneBackdrop`, la
    /// galerie par son élection de plateau.
    ///
    /// **Ce témoin compare des VALEURS, et `cardedBackdrop` comme
    /// `cardedCornerRadius` sont des constantes** (revue du tour 3) : les deux
    /// côtés de chaque égalité rendent la MÊME chose pour TOUT viewport, donc
    /// aucune mutation de `SceneShape.layout(in:)` ne peut les faire diverger
    /// — le motif que `GallerySceneBackdropUnicityTests` nomme ailleurs dans
    /// cette suite. Il reste utile contre une régression LOCALE (un site qui
    /// recommencerait à ÉLIRE sa propre valeur au lieu de déléguer) ; le
    /// témoin de SOURCE juste en dessous couvre cette régression-là par la
    /// SOURCE, pas seulement par la valeur qu'elle produit aujourd'hui.
    func test_leFond_estCeluiDeLaLoi_surLesDeuxSurfaces() {
        XCTAssertEqual(SceneShape.cardedBackdrop, .thumbHashDominantColor,
                       "une couleur PLATE ne peut pas diverger d'un cadre à l'autre (#6797)")
        XCTAssertEqual(StoryCardView.readerSceneBackdrop, SceneShape.cardedBackdrop)
        XCTAssertEqual(GallerySceneStage.frame(viewport: CGSize(width: 402, height: 874),
                                               presentation: .carded,
                                               corridors: Self.corridors).backdrop,
                       SceneShape.cardedBackdrop)
    }

    /// **Un seul rayon.** Le lecteur l'animait depuis 22, la loi en dit 20 : la
    /// carte d'une story et le cadré d'un post se reconnaissaient à leurs coins.
    func test_leRayon_estCeluiDeLaLoi_surLesDeuxSurfaces() {
        let viewport = CGSize(width: 402, height: 874)

        XCTAssertEqual(SceneShape.layout(in: viewport, immersive: false).cornerRadius,
                       SceneShape.cardedCornerRadius)
        XCTAssertEqual(GallerySceneStage.frame(viewport: viewport,
                                               presentation: .carded,
                                               corridors: Self.corridors).cornerRadius,
                       SceneShape.cardedCornerRadius)
        XCTAssertEqual(Self.cadrageDuLecteur(viewport: viewport).cornerRadius,
                       SceneShape.cardedCornerRadius,
                       "le lecteur anime SON rayon depuis celui de la loi, pas depuis un littéral")
    }

    /// **La délégation elle-même vit à la SOURCE, pas seulement dans la valeur
    /// qu'elle produit aujourd'hui** (revue du tour 3, complément aux deux
    /// témoins ci-dessus). Une VALEUR comparée ne peut pas distinguer « ce
    /// site délègue à la loi » de « ce site a recopié la même constante à la
    /// main » — les deux rendent le même verdict tant que personne ne change
    /// rien. Ce témoin lit le TEXTE : `readerSceneBackdrop` doit contenir
    /// `SceneShape.cardedBackdrop`, `GallerySceneStage` doit lire
    /// `layout.backdrop` et `layout.cornerRadius` (jamais une valeur à lui),
    /// et le lecteur doit passer `SceneShape.cardedCornerRadius` au cadrage
    /// qu'il anime — un site qui recommencerait à ÉLIRE sa propre constante
    /// (même identique aujourd'hui) le ferait rougir, ce qu'aucune comparaison
    /// de valeurs ne peut faire.
    func test_leFondEtLeRayon_sontDeleguesALaSource_pasElisLocalement() throws {
        let lecteur = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/StoryViewerView+ReaderCard.swift"))
        XCTAssertTrue(lecteur.contains("readerSceneBackdrop") && lecteur.contains("SceneShape.cardedBackdrop"),
                      "le lecteur délègue son fond à la loi, jamais un littéral")

        let canvas = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift"))
        XCTAssertTrue(canvas.contains("cardedCornerRadius: SceneShape.cardedCornerRadius"),
                      "le lecteur anime SON cadrage depuis le rayon de la loi, jamais un littéral")

        let galerie = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/GallerySceneStage.swift"))
        XCTAssertTrue(galerie.contains("layout.backdrop"),
                      "la galerie lit le fond DEPUIS la loi, jamais une élection à elle")
        XCTAssertTrue(galerie.contains("layout.cornerRadius"),
                      "la galerie lit le rayon DEPUIS la loi, jamais un littéral à elle")
    }

    /// **Un seul cadre.** Les deux surfaces cadrent le 9:16 dans une RÉGION
    /// différente — le plateau de la galerie, la zone libre du lecteur — mais la
    /// FORME qu'elles y posent est la même fonction.
    func test_leCadre_estCeluiDeLaLoi_surLesDeuxSurfaces() {
        let viewport = CGSize(width: 402, height: 874)
        let galerie = GallerySceneStage.frame(viewport: viewport, presentation: .carded,
                                              corridors: Self.corridors).sceneSize
        let lecteur = SceneShape.layout(in: viewport, immersive: false)
            .sceneFrame.size

        XCTAssertEqual(galerie.width / galerie.height, SceneShape.aspect, accuracy: 0.0001)
        XCTAssertEqual(lecteur.width / lecteur.height, SceneShape.aspect, accuracy: 0.0001)
    }

    /// **La compensation d'échelle vit DANS la carte.** Le lecteur peint sa
    /// carte à `scale` et déclare ce facteur ; il ne fait plus la division
    /// lui-même. Un facteur dégénéré ne divise rien.
    func test_leRayon_seCompensePourLEchelleQueLHoteDeclare() {
        let loi = SceneShape.layout(in: CGSize(width: 402, height: 874), immersive: false)
        XCTAssertEqual(SceneCard<EmptyView>.unscaledCornerRadius(layout: loi, override: nil,
                                                                 hostScale: 0.5),
                       SceneShape.cardedCornerRadius * 2)
        XCTAssertEqual(SceneCard<EmptyView>.unscaledCornerRadius(layout: loi, override: nil,
                                                                 hostScale: 0),
                       SceneShape.cardedCornerRadius)
        XCTAssertEqual(SceneCard<EmptyView>.unscaledCornerRadius(layout: loi, override: 0,
                                                                 hostScale: 0.5), 0,
                       "plein bord, l'hôte anime son rayon jusqu'à zéro — et zéro reste zéro")
    }

    /// **Les DEUX plein écrans d'un post sont la même carte, dans deux
    /// viewports** (directive porteur du 2026-09-17, 3e message). L'immersif
    /// n'a plus ni forme ni fond à lui : il n'a qu'un viewport plus grand,
    /// parce que les couloirs du plateau n'y mordent pas — **et des coins
    /// DROITS**, par la directive B du 2026-09-18.
    func test_lesDeuxPleinEcransDUnPost_sontLaMemeCarte() {
        let viewport = CGSize(width: 402, height: 874)
        let cadre = GallerySceneStage.frame(viewport: viewport, presentation: .carded,
                                            corridors: Self.corridors)
        let immersif = GallerySceneStage.frame(viewport: viewport, presentation: .full(pausedOnEntry: false),
                                               corridors: Self.corridors)

        XCTAssertEqual(immersif.backdrop, cadre.backdrop)
        // **Le RAYON, lui, n'est plus partagé** (directive B du 2026-09-18) :
        // « lorsqu'on met en plein écran, il faut enlever l'arrondi sur le
        // composant et garder les bords angle exacte ! ». C'est la SEULE chose
        // que l'état change — le cadre et le fond restent ceux de la story, et
        // les assertions qui les tiennent ci-dessous n'ont pas bougé.
        XCTAssertEqual(cadre.cornerRadius, SceneShape.cardedCornerRadius)
        XCTAssertEqual(immersif.cornerRadius, SceneShape.immersiveCornerRadius)
        XCTAssertGreaterThan(immersif.sceneSize.width, cadre.sceneSize.width,
                             "sans couloir, la MÊME carte est plus grande")
        for cote in [cadre.sceneSize, immersif.sceneSize] {
            XCTAssertEqual(cote.width / cote.height, SceneShape.aspect, accuracy: 0.0001)
            XCTAssertLessThanOrEqual(cote.width, viewport.width + 0.01,
                                     "aucune des deux ne ROGNE la scène")
            XCTAssertLessThanOrEqual(cote.height, viewport.height + 0.01)
        }
    }

    // MARK: - Le montage

    /// **Les deux hôtes montent `SceneCard`, et aucun ne refait ce qu'elle
    /// fait.** Un fond posé à la main, un rayon de scène rogné à côté du
    /// player : c'est exactement par là que les deux assemblages avaient
    /// divergé.
    ///
    /// Le marqueur de montage diffère par hôte, et ce n'est pas une
    /// complaisance : le lecteur monte la carte par `readerCard(layout:…)`, sa
    /// ligne d'une ligne, qui porte AUSSI sa place et son animation. Exiger le
    /// nom du composant dans chaque fichier obligerait à recopier le
    /// `scaleEffect`/`offset` trois fois — l'inverse de ce lot.
    func test_lesDeuxHotesPleinEcran_montentLaCarte_etNeLaRefontPas() throws {
        for (fichier, montage) in Self.hotesPleinEcran {
            let source = AppSourceGuard.stripComments(try Self.lire(fichier))
            XCTAssertTrue(source.contains(montage),
                          "\(fichier) doit MONTER la carte de scène (\(montage)), pas la reproduire")
            XCTAssertFalse(source.contains("SceneBackdropView("),
                           "\(fichier) ne peint plus son fond : la carte le fait")
            for rayon in Self.rayonsDeScene {
                XCTAssertFalse(source.contains(rayon),
                               "\(fichier) ne rogne plus la scène à son rayon (\(rayon)) : la carte le fait")
            }
        }
    }

    private static let hotesPleinEcran: [(fichier: String, montage: String)] = [
        ("Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift", ".readerCard(layout:"),
        ("Meeshy/Features/Main/Views/StoryViewerView+ReaderCard.swift", "SceneCard(layout:"),
        ("Meeshy/Features/Main/Views/ConversationMediaGalleryView+ScenePage.swift", "SceneCard(layout:"),
    ]

    /// **Les rayons par lesquels un hôte rognerait une SCÈNE.** On ne peut pas
    /// interdire `clipShape(RoundedRectangle` tout court : le lecteur rogne
    /// aussi ses deux FACES DE CUBE (la transition entre groupes de stories) et
    /// sa révélation circulaire — des animations de plein écran, qui n'ont rien
    /// à voir avec la forme d'une scène. Ce qui se garde, c'est le RAYON : dès
    /// qu'un hôte écrit celui de la scène, il refait la carte.
    private static let rayonsDeScene = ["stage.cornerRadius",
                                        "readerCanvasFraming.cornerRadius",
                                        "unscaledCornerRadius"]

    private static func lire(_ relatif: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: racine.appendingPathComponent(relatif), encoding: .utf8)
    }

    private static var corridors: MediaStageFraming.Corridors {
        MediaStageFraming.Corridors(safeTop: 59,
                                    top: MediaGalleryStage.topCorridorHeight,
                                    rail: 0, transport: 0,
                                    safeBottom: 34,
                                    gutter: MediaGalleryStage.gutter)
    }

    /// Le cadrage du lecteur, aux entrées qu'il pose lui-même. Il RECOPIE un
    /// choix de production — sa faiblesse connue — mais son rayon vient
    /// désormais de la loi, et c'est précisément ce qu'on mesure.
    private static func cadrageDuLecteur(viewport: CGSize) -> StoryCanvasFraming.Result {
        StoryCanvasFraming.resolve(.init(viewport: viewport,
                                         headerInset: 59 + 72,
                                         bottomInset: 64,
                                         sideInset: 8,
                                         state: .carded,
                                         cardedCornerRadius: SceneShape.cardedCornerRadius,
                                         verticalAlignment: StageChromeAlignment.verticalAlignment(
                                             canvasRatio: SceneShape.aspect),
                                         canvasRatio: SceneShape.aspect))
    }
}
