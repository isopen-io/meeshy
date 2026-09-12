import XCTest
import CoreGraphics
import MeeshySDK
@testable import Meeshy

/// **Les trois portes du plein cadre, mesurées sur leur EFFET** (#6142).
///
/// La loi de transition est éprouvée hors écran par `StagePresentationTests`
/// (SDK) : quelle porte met en pause, laquelle n'interrompt rien, laquelle
/// bascule. Ce fichier tient l'autre moitié — **ce que la galerie en FAIT** —
/// et il pose ses questions sur l'effet, jamais sur l'état interne : non pas
/// « `showControls` est-il faux ? » mais « le bouton du couloir répond-il
/// encore ? », non pas « la présentation est-elle `.full` ? » mais « le pager
/// a-t-il vraiment récupéré les deux bandes du plateau ? ».
///
/// Cotes de référence : iPhone 16 Pro, 390 × 844 pt, safe area 59 / 34.
@MainActor
final class MediaGalleryStagePresentationTests: XCTestCase {

    private static let viewport = CGSize(width: 390, height: 844)

    private func corridors(mediaCount: Int = 6) -> MediaStageFraming.Corridors {
        MediaGalleryStage.corridors(safeTop: 59, safeBottom: 34, mediaCount: mediaCount)
    }

    // MARK: - Le pager reprend ce que le plateau lui réservait

    /// **Le plein cadre n'est pas un fondu de chrome : c'est une reprise de
    /// place.** Tant que le pager garde les retraits du plateau, le média reste
    /// exactement où il était et « plein cadre » ne nomme rien.
    func test_inFullFrame_thePagerTakesBackBothPlateauBands() {
        XCTAssertEqual(
            MediaGalleryStage.topInset(presentation: .full(pausedOnEntry: false),
                                       corridors: corridors()), 0)
        XCTAssertEqual(
            MediaGalleryStage.bottomInset(presentation: .full(pausedOnEntry: true),
                                          corridors: corridors()), 0)
    }

    /// Et en cadré, les mêmes retraits valent EXACTEMENT ce que les couloirs
    /// réservent — les deux couches lisent la même table, sinon le cadre dessiné
    /// et le cadre calculé diffèrent d'une bande.
    func test_carded_thePagerLeavesTheCorridorsUntouched() {
        let reserves = corridors()

        XCTAssertEqual(MediaGalleryStage.topInset(presentation: .carded, corridors: reserves),
                       reserves.safeTop + reserves.top)
        XCTAssertEqual(MediaGalleryStage.bottomInset(presentation: .carded, corridors: reserves),
                       reserves.rail + reserves.safeBottom + reserves.gutter)
    }

    /// **En cadré, le rail garde sa hauteur pleine** — c'est ce qui le rend
    /// pilotable : un couloir bas réduit poserait la pellicule sous le cadre,
    /// où aucun doigt ne l'atteindrait.
    func test_carded_theRailKeepsItsFullReservedHeight() {
        XCTAssertGreaterThanOrEqual(
            MediaGalleryStage.bottomInset(presentation: .carded, corridors: corridors()),
            FilmstripMetrics.reservedHeight,
            "le couloir bas doit au moins contenir la pellicule qu'il porte"
        )
    }

    // MARK: - Le cadre change de cotes, pas seulement d'opacité

    func test_theDoor_movesTheFrameItself() {
        let carded = MediaGalleryStage.resolve(viewport: Self.viewport,
                                               mediaRatio: 0.8,
                                               presentation: StagePresentation.carded.framing,
                                               corridors: corridors())
        let full = MediaGalleryStage.resolve(viewport: Self.viewport,
                                             mediaRatio: 0.8,
                                             presentation: StagePresentation.full(pausedOnEntry: false).framing,
                                             corridors: corridors())

        XCTAssertEqual(carded.frame, CGSize(width: 366, height: 457.5))
        XCTAssertEqual(full.frame, Self.viewport, "le cadre EST l'écran")
        XCTAssertEqual(full.cornerRadius, 0,
                       "un cadre qui touche les quatre bords n'a pas de coin à arrondir")
    }

    // MARK: - Ce que la source doit porter pour que tout ceci ait un effet

    private func source(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(relativePath))
    }

    private static let gallery = "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"

    /// Le corps d'une déclaration, borné par SES accolades — jamais par un
    /// nombre de caractères : une fenêtre fixe se remplit des retraits laissés
    /// par les commentaires retirés et rougit sur un code juste.
    private func declarationBody(startingAt marker: String, in code: String) -> String? {
        guard let start = code.range(of: marker),
              let open = code[start.upperBound...].firstIndex(of: "{") else { return nil }
        var depth = 0
        var index = open
        while index < code.endIndex {
            if code[index] == "{" { depth += 1 }
            if code[index] == "}" {
                depth -= 1
                if depth == 0 { return String(code[start.lowerBound...index]) }
            }
            index = code.index(after: index)
        }
        return nil
    }

    /// **Aucun contrôle du couloir n'est atteignable en plein cadre.**
    ///
    /// Le démontage seul ne suffit pas, et c'est la raison d'être de la garde :
    /// la couche s'en va en FONDU, donc elle reste dans l'arbre — et
    /// hit-testable — pendant toute la transition. Un tap pendant ces deux
    /// dixièmes de seconde fermerait la galerie par un bouton que l'utilisateur
    /// voit déjà disparaître.
    func test_inFullFrame_noCorridorControlAnswers() throws {
        let code = try source(Self.gallery)
        guard let couche = declarationBody(startingAt: "var overlayLayer", in: code) else {
            XCTFail("`overlayLayer` introuvable"); return
        }

        XCTAssertTrue(couche.contains("if stagePresentation.showsPlateau {"),
                      "le plateau n'appartient qu'à l'état cadré")
        XCTAssertTrue(couche.contains(".allowsHitTesting(stagePresentation.showsPlateau)"),
                      "pendant le fondu, la couche est encore là : sans cette ligne elle répond")
    }

    /// **Le rail reste pilotable en cadré** : il vit dans la couche que la garde
    /// ci-dessus laisse répondre, et rien d'autre ne le gate.
    func test_carded_theRailStaysReachable() throws {
        let code = try source(Self.gallery)
        guard let plateau = declarationBody(startingAt: "var controlsOverlay", in: code) else {
            XCTFail("`controlsOverlay` introuvable"); return
        }

        XCTAssertTrue(plateau.contains("railCorridor"),
                      "le couloir bas du plateau porte la pellicule")
        XCTAssertFalse(plateau.contains(".allowsHitTesting(false)"),
                       "rien ne désarme le plateau de l'intérieur")
    }

    /// **Un seul état d'immersion.** Le booléen qu'il remplace ne peut pas
    /// survivre à côté de lui : deux drapeaux pour une même question finissent
    /// par se contredire, et c'est exactement la divergence que le lot répare.
    func test_theOldChromeBoolean_isGone() throws {
        let code = try source(Self.gallery)

        XCTAssertFalse(code.contains("showControls"),
                       "`showControls` a été absorbé par `StagePresentation`")
        XCTAssertTrue(code.contains("@State var stagePresentation: StagePresentation = .carded"))
    }

    /// **Les trois portes sont CÂBLÉES, pas seulement définies.** Une loi de
    /// transition qu'aucun geste n'appelle est un moteur sans arbre : verte de
    /// partout, inerte au doigt.
    func test_theThreeDoors_areWiredToRealGestures() throws {
        let code = try source(Self.gallery)

        XCTAssertTrue(code.contains("onEnterStage(.tap)"), "le tap entre et sort")
        XCTAssertTrue(code.contains("onEnterStage(.longPress)"), "l'appui long entre et met en pause")
        XCTAssertTrue(code.contains("onEnterStage(.swipeUp)"), "le glissement entre sans interrompre")
        XCTAssertTrue(code.contains("MediaStageGestures.resolveDrag("),
                      "le glissement vertical passe par la règle, pas par deux seuils recopiés")
        XCTAssertTrue(code.contains("MediaStageGestures.longPressArmed("),
                      "l'appui long cède au déplacement d'un média agrandi")
    }

    /// **Le double tap garde son zoom, et le simple tap l'attend.** Déclarés sur
    /// la MÊME vue, dans cet ordre, SwiftUI diffère le simple le temps de la
    /// fenêtre du double. Sur deux vues distinctes, un double tap de zoom
    /// emporterait aussi le cadrage — et le média sauterait deux fois.
    func test_theDoubleTapZoom_isDeclaredBeforeTheSingleTap() throws {
        let code = try source(Self.gallery)
        guard let double = code.range(of: ".onTapGesture(count: 2) { toggleZoom() }"),
              let simple = code.range(of: ".onTapGesture { onEnterStage(.tap) }") else {
            XCTFail("les deux taps de la page image doivent vivre sur la même vue"); return
        }

        XCTAssertTrue(double.lowerBound < simple.lowerBound,
                      "le double tap doit être déclaré en premier, sinon le simple gagne toujours")
    }

    /// **La pastille rend `pausedOnEntry` visible** — sans quoi les deux portes
    /// produiraient exactement le même écran et la distinction ne serait qu'un
    /// champ dans un `enum`.
    func test_thePausedBadge_isMountedThroughItsRule() throws {
        let code = try source(Self.gallery)

        XCTAssertTrue(code.contains("MediaStagePause.showsBadge("),
                      "la pastille se décide par la règle, pas par `pausedOnEntry` seul")
    }
}
