import XCTest
import SwiftUI
@testable import MeeshyUI

/// K00 n'a pas d'entrée au catalogue : il EST le catalogue, et son état vide
/// (l'état juste après K00) est son premier instantané — clair, sombre, puis
/// les planches grande police et RTL, sous les noms du kit.
@MainActor
final class MeeshyKitCatalogEmptyStateTests: XCTestCase {

    private static let component = "Catalogue"
    private static let id = "vide"

    func test_vide_clairEtSombre() {
        for variant in [SnapshotHelpers.KitVariant.clair, .sombre] {
            SnapshotHelpers.assertKitImage(
                of: MeeshyKitCatalogEmptyState(),
                component: Self.component, id: Self.id, variant: variant,
                colorScheme: variant == .sombre ? .dark : .light
            )
        }
    }

    func test_vide_grandePoliceEtRtl() {
        SnapshotHelpers.assertKitImage(
            of: Self.board.dynamicTypeSize(.accessibility3),
            component: Self.component, id: SnapshotHelpers.kitBoardID, variant: .grandePolice,
            colorScheme: .light
        )
        SnapshotHelpers.assertKitImage(
            of: Self.board.environment(\.layoutDirection, .rightToLeft),
            component: Self.component, id: SnapshotHelpers.kitBoardID, variant: .rtl,
            colorScheme: .light
        )
    }

    private static var board: some View {
        MeeshyKitCatalogEmptyState()
            .frame(width: SnapshotHelpers.kitBoardWidth)
    }
}
