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

    /// Reproduit la séquence exacte du crash : configurer le layer (construit le
    /// `CAFilter`, le range dans `filters`), désallouer le layer, puis drainer
    /// l'autorelease pool. Avec le bug → double-free → SIGSEGV. Avec le fix →
    /// le pool draine proprement sur les 64 itérations.
    func test_configure_caFilterFallback_doesNotOverReleaseFilter() {
        for _ in 0..<64 {
            autoreleasepool {
                let layer = StoryGlassBackdropLayer()
                layer.configure(sigma: 24)
                XCTAssertEqual(
                    (layer.value(forKeyPath: "filters") as? [Any])?.count, 1,
                    "applyCAFilterFallback doit ranger un CAFilter dans `filters`"
                )
            }
        }
    }

    /// Le `CAFilter` rangé dans `filters` reste un objet vivant et adressable
    /// après le drain du pool — preuve que le tableau en détient une référence
    /// forte valide, et non un pointeur pendouillant.
    func test_configure_filterSurvivesAutoreleasePoolDrain() {
        let layer = StoryGlassBackdropLayer()
        autoreleasepool {
            layer.configure(sigma: 12)
        }
        guard let filter = (layer.value(forKeyPath: "filters") as? [Any])?.first else {
            return XCTFail("`filters` devrait contenir le CAFilter de repli")
        }
        XCTAssertEqual(String(describing: type(of: filter as AnyObject)), "CAFilter")
    }
}
