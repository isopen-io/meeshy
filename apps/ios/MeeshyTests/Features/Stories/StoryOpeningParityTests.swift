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
/// Le lecteur ne jouait JAMAIS l'ouverture du SDK : `applyOpening` n'était
/// appelée que sur une transition `edit → play`, et le canvas du lecteur naît
/// directement en `.play` — or `self.mode = mode` dans l'`init` ne déclenche
/// pas les observateurs de propriété. La ré-implémentation SwiftUI était donc
/// seule à l'écran, et ses constantes contredisaient le SDK :
///
///   `.zoom`  → SDK 1,08 → 1,0 (DÉzoome) ; app 0,88 → 1,0 (zoome) — sens inverse
///   `.slide` → SDK 8 % de la LARGEUR, horizontal ; app 30 pt, VERTICAL
///   durées   → SDK 0,5 s pour les trois ; app 0,4 / 0,38 / 0,4
///
/// La fusion est faite : le canvas arme son ouverture à la naissance et la joue
/// au premier layout — `StoryReaderOpeningPlaybackTests`, côté SDK, en couvre le
/// comportement runtime. Ces tests-ci verrouillent l'ACQUIS côté app : que le
/// lecteur ne se remette pas à rendre l'ouverture lui-même, et que les
/// constantes partagées par les trois surfaces gardent leur sens.
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
        XCTAssertLessThanOrEqual(StoryRenderer.slideTransitionDuration, 1.0,
                                 "Au-delà d'une seconde, l'ouverture retarderait la lecture.")
    }

    // MARK: - Un seul renderer

    /// Garde de non-régression sur la SOURCE du lecteur : la grammaire
    /// d'ouverture ne doit pas revenir côté app.
    ///
    /// Ancrée sur les PILOTES eux-mêmes plutôt que sur une formulation : ce qui
    /// est interdit, c'est que le lecteur possède une échelle d'ouverture, un
    /// débattement ou un masque de révélation à lui. Le pendant SDK vérifie de
    /// son côté que c'est bien `applyOpening` qui joue — les deux gardes se
    /// tiennent : celle-ci seule laisserait passer « plus rien ne s'affiche ».
    func test_readerDoesNotRenderTheOpeningItself() throws {
        for path in [Self.readerContentPath, Self.readerCanvasPath, Self.readerRootPath] {
            let source = try String(contentsOfFile: path, encoding: .utf8)
            let code = Self.strippingComments(source)
            let file = (path as NSString).lastPathComponent

            for banned in ["openingScale", "openingSlideFraction", "isRevealActive", "RevealCircleShape"] {
                XCTAssertFalse(code.contains(banned),
                               "\(file) : « \(banned) » est de retour. L'ouverture d'un slide est " +
                               "rendue par le SDK À L'INTÉRIEUR du canvas, pas par le lecteur autour de lui.")
            }
            // La valeur inversée du zoom — le symptôme le plus visible du double
            // renderer. Ancrée sur l'AFFECTATION, pas sur le littéral nu : 0,88
            // est une opacité parfaitement ordinaire dans un fichier de vue
            // (`.white.opacity(0.88)` existe déjà), et bannir le nombre seul
            // produirait un échec dont le message serait faux.
            for assignment in ["openingScale = 0.88", "openingScale: 0.88"] {
                XCTAssertFalse(code.contains(assignment),
                               "\(file) : le zoom d'ouverture inversé est de retour.")
            }
        }
    }

    /// Ce que le lecteur garde, en revanche : le CROSS-FADE entre deux stories.
    /// Ce n'est pas une grammaire d'ouverture — il masque le swap de surfaces —
    /// et le supprimer ferait clignoter le passage d'une story à l'autre.
    func test_readerStillOwnsTheCrossFade() throws {
        let source = try String(contentsOfFile: Self.readerContentPath, encoding: .utf8)
        XCTAssertTrue(source.contains("outgoingOpacity"),
                      "Le cross-fade inter-stories appartient bien au lecteur.")
        XCTAssertTrue(source.contains("StoryRenderer.slideTransitionDuration"),
                      "Le lecteur doit caler son fondu sur la durée du SDK, pas en redéclarer une.")
    }

    // MARK: - Ancrage

    private static func sourcePath(_ relative: String) -> String {
        // Le fichier de test vit dans apps/ios/MeeshyTests/Features/Stories/ ;
        // les sources visées dans apps/ios/Meeshy/Features/Main/Views/.
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/\(relative)")
            .path
    }

    private static var readerContentPath: String { sourcePath("StoryViewerView+Content.swift") }
    private static var readerCanvasPath: String { sourcePath("StoryViewerView+Canvas.swift") }
    private static var readerRootPath: String { sourcePath("StoryViewerView.swift") }

    /// Les commentaires de ces fichiers CITENT les noms bannis pour expliquer
    /// pourquoi ils ont disparu. Les analyser déclencherait un faux positif —
    /// et pousserait, pour faire passer le test, à effacer l'explication.
    private static func strippingComments(_ source: String) -> String {
        source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }
}
