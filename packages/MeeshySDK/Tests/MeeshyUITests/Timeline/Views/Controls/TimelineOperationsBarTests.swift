import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Bande d'opérations de la timeline (retour user 2026-07-20) : snap, annuler,
/// rétablir et enregistrer déménagent du transport vers une bande dédiée sous
/// la bande des outils.
///
/// Le bouton « +10 s » qu'elle portait a été retiré (2026-07-27) : il posait
/// une durée de slide que le recalcul depuis le contenu effaçait à l'édition
/// suivante. Ses deux tests sont partis avec lui — la durée dérive désormais du
/// contenu, ce que couvre `TimelineViewModelSlideDurationTests`.
@MainActor
final class TimelineOperationsBarTests: XCTestCase {

    func test_init_doesNotCrash() {
        let bar = TimelineOperationsBar(
            canUndo: true, canRedo: false, isSnapEnabled: true,
            onUndo: {}, onRedo: {}, onSnapToggle: {},
            onSave: {}
        )
        _ = bar.body
    }

    func test_init_withoutSave_doesNotCrash() {
        let bar = TimelineOperationsBar(
            canUndo: false, canRedo: false, isSnapEnabled: false,
            onUndo: {}, onRedo: {}, onSnapToggle: {},
            onSave: nil
        )
        _ = bar.body
    }
}
