import XCTest
import SwiftUI
import SnapshotTesting
@testable import MeeshyUI

/// L'aide d'instantané du KIT (K00) : `SnapshotHelpers` étendu sur place.
///
/// Une image est cadrée AU COMPOSANT (marge `md`, taille naturelle), jamais au
/// format appareil : à 390×844, la tolérance de 1 % avale le composant entier.
/// Les noms sont `Kit/__Snapshots__/<Nom>/<id>.<variante>.png` — la bibliothèque
/// fixe `<test>.<nom>.png`, le test porte donc l'`id` et le nom la variante, avec
/// le suffixe `osBaselineSuffix` (`-iOS26`) que `SnapshotHelpers` garde.
extension SnapshotHelpers {

    enum KitVariant: String, CaseIterable, Sendable {
        case clair
        case sombre
        case presse
        case grandePolice = "grande-police"
        case rtl
    }

    /// L'`id` sous lequel vivent la planche `grande-police` et la planche `rtl`.
    static let kitBoardID = "planche"

    static let kitBoardWidth: CGFloat = 390

    static func kitSnapshotDirectory(testFile: StaticString, component: String) -> String {
        snapshotDirectory(testFile: testFile) + "/" + component
    }

    static func kitImageStem(id: String, variant: KitVariant) -> String {
        "\(id).\(variant.rawValue)"
    }

    /// Les variantes d'un état : clair et sombre, plus `presse` s'il se touche.
    static func kitVariants(for state: MeeshyKitCatalogState) -> [KitVariant] {
        state.isTouchable ? [.clair, .sombre, .presse] : [.clair, .sombre]
    }

    /// La taille NATURELLE du composant. `layout: .sizeThatFits` mesure l'hôte
    /// sous une proposition NULLE (`sizeThatFits(in: .zero)`) : tout ce qui se
    /// comprime s'y efface — le libellé d'une pilule disparaissait des 40
    /// premières références de K01, seul le glyphe restait. `fixedSize()` rend
    /// la taille idéale, celle que le composant prend à l'écran.
    @MainActor
    static func kitFramed<V: View>(_ view: V) -> some View {
        view.fixedSize()
    }

    @MainActor
    static func assertKitImage<V: View>(
        of view: V,
        component: String,
        id: String,
        variant: KitVariant,
        colorScheme: ColorScheme,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let recording: Bool? = nil
        let failure = SnapshotTesting.verifySnapshot(
            of: kitFramed(view).environment(\.colorScheme, colorScheme),
            as: .image(precision: 0.99, perceptualPrecision: 0.98, layout: .sizeThatFits),
            named: variant.rawValue + osBaselineSuffix,
            record: recording,
            snapshotDirectory: kitSnapshotDirectory(testFile: file, component: component),
            file: file,
            testName: id,
            line: line
        )
        guard let failure else { return }
        XCTFail(failure, file: file, line: line)
    }

    /// Chaque état d'un composant du kit : clair, sombre, et pressé s'il se
    /// touche ; puis les deux planches `grande-police` et `rtl` de l'ensemble.
    @MainActor
    static func assertKitComponent(
        _ entry: MeeshyKitCatalogEntry,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        for state in entry.states {
            for variant in kitVariants(for: state) {
                assertKitImage(
                    of: MeeshyKitCatalogStage(key: entry.key, state: state, isPressed: variant == .presse),
                    component: entry.name, id: state.id, variant: variant,
                    colorScheme: variant == .sombre ? .dark : .light,
                    file: file, line: line
                )
            }
        }
        assertKitImage(
            of: kitBoard(entry).dynamicTypeSize(.accessibility3),
            component: entry.name, id: kitBoardID, variant: .grandePolice, colorScheme: .light,
            file: file, line: line
        )
        assertKitImage(
            of: kitBoard(entry).environment(\.layoutDirection, .rightToLeft),
            component: entry.name, id: kitBoardID, variant: .rtl, colorScheme: .light,
            file: file, line: line
        )
    }

    @MainActor
    static func kitBoard(_ entry: MeeshyKitCatalogEntry) -> some View {
        kitBoardGlass(
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                ForEach(entry.tiles) { tile in
                    MeeshyKitCatalogStage(key: entry.key, state: tile.state, isPressed: tile.isPressed)
                }
            }
            .frame(width: kitBoardWidth, alignment: .leading)
        )
    }

    /// Le verre des planches est le verre DESSINÉ, sur toute version d'iOS. Le
    /// Liquid Glass du système est composé par le serveur de rendu, que la
    /// capture hors écran (`layer.render`) ne voit pas ; un verre teinté y
    /// EFFACE même ce qui a été peint avant lui : la première planche de K01
    /// n'a gardé que sa dernière tuile, la seule sans verre. Une planche juge la
    /// mise en page (grande police, RTL), pas la matière, que les images de
    /// chaque état photographient sur les deux chemins.
    @MainActor
    static func kitBoardGlass<V: View>(_ board: V) -> some View {
        board.environment(\.meeshyGlassForcesDrawn, true)
    }
}
