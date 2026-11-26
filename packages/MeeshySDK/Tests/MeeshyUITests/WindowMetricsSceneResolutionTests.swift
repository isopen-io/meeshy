import XCTest
import UIKit
@testable import MeeshyUI

/// `WindowMetrics` est la jumelle SDK de `DeviceLayout` : la scène qu'elle mesure suit la même résolution. Centre de
/// contrôle tiré, alerte système, appel qui s'annonce : la seule scène passe `.foregroundInactive` en restant à
/// l'écran, et les marges du composer tombaient à zéro le temps du geste (#6633).
@MainActor
final class WindowMetricsSceneResolutionTests: XCTestCase {
    private struct Scene { let name: String; let active: Bool; let onScreen: Bool; let key: Bool }

    func test_anOnScreenInactiveScene_isMeasured_onlyWhenNoActiveSceneExists() {
        let alone = [Scene(name: "bg", active: false, onScreen: false, key: false),
                     Scene(name: "inactive", active: false, onScreen: true, key: true)]
        XCTAssertEqual(WindowMetrics.pickActive(alone, isForeground: \.active, holdsKey: \.key, isOnScreen: \.onScreen)?.name,
                       "inactive")
        let split = [Scene(name: "inactive", active: false, onScreen: true, key: true),
                     Scene(name: "active", active: true, onScreen: true, key: false)]
        XCTAssertEqual(WindowMetrics.pickActive(split, isForeground: \.active, holdsKey: \.key, isOnScreen: \.onScreen)?.name,
                       "active")
        let twoActive = [Scene(name: "detached", active: true, onScreen: true, key: false),
                         Scene(name: "main", active: true, onScreen: true, key: true)]
        XCTAssertEqual(WindowMetrics.pickActive(twoActive, isForeground: \.active, holdsKey: \.key, isOnScreen: \.onScreen)?.name,
                       "main")
        let hidden = [Scene(name: "bg", active: false, onScreen: false, key: true)]
        XCTAssertNil(WindowMetrics.pickActive(hidden, isForeground: \.active, holdsKey: \.key, isOnScreen: \.onScreen))
    }

    func test_aMissingMeasurement_keepsTheLastMeasuredInsets_butAMeasuredZeroStands() {
        let last = UIEdgeInsets(top: 59, left: 0, bottom: 34, right: 0)
        XCTAssertEqual(WindowMetrics.insetsRemembering(measured: nil, last: last), last)
        XCTAssertEqual(WindowMetrics.insetsRemembering(measured: .zero, last: last), .zero)
        let landscape = UIEdgeInsets(top: 0, left: 47, bottom: 21, right: 47)
        XCTAssertEqual(WindowMetrics.insetsRemembering(measured: landscape, last: last), landscape)
    }
}
