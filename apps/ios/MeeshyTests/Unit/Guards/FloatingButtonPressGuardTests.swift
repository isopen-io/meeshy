import XCTest
@testable import Meeshy

/// **Aucun effet d'appui maison sur un bouton flottant hors du kit** (#18428).
///
/// Le Flux, le Menu et chaque barreau de l'échelle répondent à l'appui comme un
/// bouton du kit : les deux disques par le verre de `FreeFloatingButton`
/// (`meeshyGlass(isPressed:)`, appui long écrasé par `FloatingButtonHoldSquash`),
/// les barreaux par `PressableButtonStyle`, qui suit l'état pressé du bouton, prend
/// `springFast` et garde son voile sans échelle sous « Réduire les animations ».
/// Le barreau rejouait son propre ressort APRÈS le relâcher (`withAnimation(.spring…)`,
/// échelle 0,82 et icône tournée), sans voie réduite ni réponse au doigt posé.
final class FloatingButtonPressGuardTests: XCTestCase {

    private static let chromePath = "Meeshy/Features/Main/Views/RootFloatingChrome.swift"
    private static let rungPath = "Meeshy/Features/Main/Views/ThemedActionButton.swift"

    private func code(_ path: String) throws -> String {
        let unit = try AppSourceGuard.unit(path)
        XCTAssertFalse(unit.isEmpty, "la garde lit une source vide : chemin faux (\(path))")
        return AppSourceGuard.stripComments(unit)
    }

    private static let homemadePress = [
        "@State private var isPressed",
        ".scaleEffect(isPressed",
        "isPressed ?",
        ".settling($isPressed",
        "DragGesture(minimumDistance: 0)",
        "LongPressGesture(",
        "onLongPressGesture",
        ".spring(response:",
    ]

    func test_floatingChrome_and_rungs_carryNoHomemadePressEffect() throws {
        for path in [Self.chromePath, Self.rungPath] {
            let source = try code(path)
            for forbidden in Self.homemadePress {
                XCTAssertFalse(source.contains(forbidden), "\(path) pose un effet d'appui maison : « \(forbidden) »")
            }
        }
    }

    func test_feedAndMenu_goThroughTheKitFloatingButtons() throws {
        let source = try code(Self.chromePath)
        XCTAssertTrue(source.contains("FreeFloatingButtonsContainer("),
                      "le Flux et le Menu doivent passer par le conteneur du kit, qui porte l'appui du verre et l'écrasement")
        XCTAssertTrue(source.contains("onLeftLongPress:") && source.contains("onRightLongPress:"),
                      "l'appui long du Flux et du Menu passe par le kit, qui l'annonce par l'écrasement")
    }

    func test_everyLadderRung_answersThePressThroughTheKitStyle() throws {
        let source = try code(Self.rungPath)
        XCTAssertTrue(source.contains(".buttonStyle(PressableButtonStyle())"),
                      "chaque barreau de l'échelle répond à l'appui par le style du kit")
        XCTAssertTrue(try code(Self.chromePath).contains("ThemedActionButton("),
                      "l'échelle du menu monte ses barreaux par ThemedActionButton")
    }
}
