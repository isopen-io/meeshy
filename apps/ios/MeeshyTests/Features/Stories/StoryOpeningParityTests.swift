import XCTest
@testable import Meeshy
@testable import MeeshyUI
@testable import MeeshySDK

/// Un même effet d'ouverture déclaré sur une story était rendu de TROIS façons
/// différentes selon la surface :
///
///   - aperçu du composer → `StoryRenderer.applyOpening` (chemin SDK) ;
///   - lecteur            → une ré-implémentation SwiftUI dans
///                          `StoryViewerView+Content`, aux constantes propres ;
///   - export MP4         → `StoryAVCompositor`, qui reflète le SDK.
///
/// Le lecteur ne joue JAMAIS l'ouverture du SDK : `applyOpening` n'est appelée
/// que sur une transition `edit → play`, et le canvas du lecteur naît
/// directement en `.play` — or `self.mode = mode` dans l'`init` ne déclenche
/// pas les observateurs de propriété. La ré-implémentation SwiftUI était donc
/// seule à l'écran, et ses constantes contredisaient le SDK :
///
///   `.zoom`  → SDK 1,08 → 1,0 (DÉzoome) ; app 0,88 → 1,0 (zoome) — sens inverse
///   `.slide` → SDK 8 % de la LARGEUR, horizontal ; app 30 pt, VERTICAL
///   durées   → SDK 0,5 s pour les trois ; app 0,4 / 0,38 / 0,4
///
/// Ces tests verrouillent l'alignement des valeurs. La fusion des DEUX
/// renderers en un seul (WS1) reste à faire — voir le rapport E2E.
final class StoryOpeningParityTests: XCTestCase {

    /// Le zoom d'ouverture part au-DESSUS de 1 et retombe : il dézoome.
    /// Partir en dessous inverserait l'effet perçu.
    func test_zoomOpening_startsAboveIdentity_soItZoomsOut() {
        XCTAssertGreaterThan(StoryRenderer.zoomTransitionScale, 1.0,
                             "Un départ sous 1,0 ferait ZOOMER l'ouverture au lieu de dézoomer.")
    }

    /// Le glissement est exprimé en FRACTION de la largeur du canvas, donc
    /// indépendant de la taille d'écran — un décalage en points ne l'aurait
    /// pas été.
    func test_slideOpening_travelIsAFractionOfTheCanvasWidth() {
        XCTAssertGreaterThan(StoryRenderer.slideTransitionTravelFraction, 0)
        XCTAssertLessThan(StoryRenderer.slideTransitionTravelFraction, 0.5,
                          "Une fraction ≥ 0,5 sortirait la slide de plus d'un demi-écran.")
    }

    /// Ouverture et fermeture partagent UNE durée dans le SDK. Le lecteur en
    /// avait trois, une par effet.
    func test_openingDuration_isASingleSharedValue() {
        XCTAssertGreaterThan(StoryRenderer.slideTransitionDuration, 0)
        XCTAssertLessThanOrEqual(StoryRenderer.slideTransitionDuration, 1.5,
                                 "Au-delà d'une seconde et demie, l'ouverture retarderait trop la lecture.")
    }

    /// Garde de non-régression sur la SOURCE du lecteur : les littéraux
    /// contradictoires ne doivent pas revenir. Ancré sur les VALEURS, pas sur
    /// une formulation — un renommage de variable ne doit pas casser ce test.
    func test_readerSourceDoesNotReintroduceItsOwnConstants() throws {
        let source = try String(contentsOfFile: Self.readerContentPath, encoding: .utf8)
        let body = try XCTUnwrap(Self.openingSection(of: source),
                                 "Section d'ouverture introuvable — le test doit être ré-ancré.")

        // La valeur inversée reste interdite dans la fenêtre d'ouverture ET
        // dans la table d'armement — elle ne doit revenir NULLE PART.
        XCTAssertFalse(source.contains("openingScale = 0.88"),
                       "Le zoom d'ouverture inversé est de retour.")
        XCTAssertFalse(source.contains("openingScale: 0.88"),
                       "Le zoom d'ouverture inversé est de retour dans la table d'armement.")

        // La durée reste résolue dans la fenêtre d'ouverture elle-même.
        XCTAssertTrue(body.contains("StoryRenderer.slideTransitionDuration"),
                      "Le lecteur doit lire la durée du SDK, pas la redéclarer.")

        // L'échelle et le débattement sont désormais armés par
        // `StoryOpeningEntrance` (même fichier, partagé avec
        // `dismissGroupIntro`) : on les cherche donc dans toute la source du
        // lecteur, pas seulement dans la fenêtre d'ouverture.
        XCTAssertTrue(source.contains("StoryRenderer.zoomTransitionScale"),
                      "Le lecteur doit lire l'échelle du SDK, pas la redéclarer.")
        XCTAssertTrue(source.contains("StoryRenderer.slideTransitionTravelFraction"),
                      "Le lecteur doit lire le débattement du SDK, pas la redéclarer.")
    }

    // MARK: - Ancrage

    private static var readerContentPath: String {
        // Le fichier de test vit dans apps/ios/MeeshyTests/Features/Stories/ ;
        // la source visée dans apps/ios/Meeshy/Features/Main/Views/.
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView+Content.swift")
            .path
    }

    /// Fenêtre de source couvrant la résolution de l'effet d'ouverture.
    /// Ancrée sur `let incomingEffect`, présent quel que soit le nommage des
    /// variables d'animation.
    private static func openingSection(of source: String) -> String? {
        guard let range = source.range(of: "let incomingEffect") else { return nil }
        return String(source[range.lowerBound...].prefix(2600))
    }
}
