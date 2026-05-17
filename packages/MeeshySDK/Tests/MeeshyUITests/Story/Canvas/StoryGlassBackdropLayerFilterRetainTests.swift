import XCTest
import QuartzCore
@testable import MeeshyUI

/// Régression : `StoryGlassBackdropLayer.applyCAFilterFallback()` consommait un
/// +1 fantôme via `Unmanaged.takeRetainedValue()` sur l'objet `+0` autoreleased
/// retourné par `+[CAFilter filterWithName:]` (convention de fabrique Cocoa).
///
/// Le filtre était donc sur-libéré d'une unité : le layer (et son tableau
/// `filters`) se désallouait avant le drain de l'autorelease pool, qui
/// re-libérait alors de la mémoire déjà libérée → `EXC_BAD_ACCESS` dans
/// `objc_release` au sein de `objc_autoreleasePoolPop`.
///
/// Reproduit en production lors de l'édition d'un texte à fond `.glass` :
/// `rebuildLayers()` reconstruit un `StoryGlassBackdropLayer` neuf à chaque
/// frappe, l'ancien se désalloue dans la même itération de runloop.
@MainActor
final class StoryGlassBackdropLayerFilterRetainTests: XCTestCase {

    /// Test fonctionnel de base : le repli `CAFilter` installe exactement un
    /// filtre dans `filters`. La régression de sur-libération elle-même est
    /// couverte par `test_configure_filterSurvivesAutoreleasePoolDrain`.
    func test_configure_caFilterFallback_installsExactlyOneFilter() {
        let layer = StoryGlassBackdropLayer()
        layer.configure(sigma: 24)
        XCTAssertEqual((layer.value(forKeyPath: "filters") as? [Any])?.count, 1,
                       "applyCAFilterFallback doit ranger un CAFilter dans `filters`")
    }

    /// Régression du crash. Configure le layer (construit le `CAFilter`, le
    /// range dans `filters`) à l'intérieur d'un `autoreleasepool` qu'on draine,
    /// puis lit une propriété du filtre. Avec le bug `takeRetainedValue()` le
    /// filtre était sur-libéré → libéré au drain du pool → l'accès ci-dessous
    /// touchait de la mémoire libérée (crash du runner, observé avant le fix).
    /// Avec `takeUnretainedValue()`, `filters` détient une référence forte
    /// valide et la lecture renvoie la valeur configurée.
    func test_configure_filterSurvivesAutoreleasePoolDrain() {
        let layer = StoryGlassBackdropLayer()
        autoreleasepool {
            layer.configure(sigma: 12)
        }
        guard let filter = (layer.value(forKeyPath: "filters") as? [Any])?.first else {
            return XCTFail("`filters` devrait contenir le CAFilter de repli")
        }
        // Lire `inputRadius` prouve que l'objet est vivant ET est bien le
        // filtre configuré (sigma 12 → inputRadius 12), sans dépendre du nom
        // de la classe privée `CAFilter`.
        let radius = ((filter as AnyObject).value(forKey: "inputRadius") as? NSNumber)?.floatValue
        XCTAssertEqual(radius ?? -1, 12, accuracy: 0.001)
    }
}
