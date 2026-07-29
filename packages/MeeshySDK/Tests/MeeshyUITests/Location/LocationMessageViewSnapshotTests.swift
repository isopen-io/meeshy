import XCTest
import SwiftUI
import SnapshotTesting
@testable import MeeshySDK
@testable import MeeshyUI

// MARK: - Snapshot record workflow
//
// Cadrage à la taille du COMPOSANT (`layout: .fixed(width: 260, height: 210)`,
// les dimensions propres de `LocationMessageView`) et non au format appareil :
// un composant cadré au format device avec `precision: 0.99` ne peut jamais
// franchir le budget de 1 % de pixels différents et le test devient incapable
// d'échouer (cf. mémoire `reference_snapshot_gate_blind_component_share_vs_precision`).
//
// Comme les suites `Timeline`/`Story`, le mode par défaut `.missing` enregistre
// la baseline PNG au premier run puis échoue une fois pour le signaler ; le
// second run compare proprement. Commits atterrissent avec `record: false`.
@MainActor
final class LocationMessageViewSnapshotTests: XCTestCase {

    private func makePlace() -> SharedPlace {
        SharedPlace(latitude: 48.8566, longitude: 2.3522,
                    name: "Tour Eiffel", address: "Champ de Mars, Paris")
    }

    private func makeView(colorScheme: ColorScheme) -> some View {
        LocationMessageView(place: makePlace())
            .environment(\.colorScheme, colorScheme)
            .background(colorScheme == .dark ? Color.black : Color.white)
    }

    func test_locationMessageView_rendersNameAndAddress_light() {
        assertSnapshot(
            of: makeView(colorScheme: .light),
            as: .image(precision: 0.99, perceptualPrecision: 0.98,
                       layout: .fixed(width: 260, height: 210)),
            record: false
        )
    }

    func test_locationMessageView_rendersNameAndAddress_dark() {
        assertSnapshot(
            of: makeView(colorScheme: .dark),
            as: .image(precision: 0.99, perceptualPrecision: 0.98,
                       layout: .fixed(width: 260, height: 210)),
            record: false
        )
    }
}
