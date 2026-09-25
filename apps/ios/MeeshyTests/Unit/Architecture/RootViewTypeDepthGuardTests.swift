import SwiftUI
import XCTest
@testable import Meeshy

/// #7955, phase 2 — la PROFONDEUR du type des corps de la racine.
///
/// Mesuré le 2026-09-25 (build Debug) : pendant le gel, un fil `utility-qos`
/// passait 100 % de ses échantillons dans `AG::TypeDescriptorCache::drain_queue`
/// → `LayoutDescriptor::make_layout`, sur un type imbriqué d'environ 150
/// niveaux, chaque niveau payant une recherche de conformité. Le coût suit la
/// profondeur du TYPE, pas le nombre de vues : une chaîne de modificateurs sur
/// un seul corps s'empile en `ModifiedContent<ModifiedContent<…>>`, un niveau
/// par modificateur.
///
/// Le témoin lit le type CONCRET de `Body` (le type opaque résolu à
/// l'exécution) et mesure son imbrication générique la plus profonde.
@MainActor
final class RootViewTypeDepthGuardTests: XCTestCase {

    static func genericDepth(_ name: String) -> Int {
        name.reduce(into: (depth: 0, max: 0)) { acc, ch in
            if ch == "<" { acc.depth += 1; acc.max = Swift.max(acc.max, acc.depth) }
            if ch == ">" { acc.depth -= 1 }
        }.max
    }

    private static func depth<V: View>(_: V.Type) -> Int {
        genericDepth(String(reflecting: V.Body.self))
    }

    private static func depth<M: ViewModifier>(_: M.Type) -> Int {
        genericDepth(String(reflecting: M.Body.self))
    }

    private static var measured: [(String, Int)] {
        [
            ("RootView", depth(RootView.self)),
            ("iPadRootView", depth(iPadRootView.self)),
            ("ConversationListView", depth(ConversationListView.self)),
            ("RootEnvironmentLayer", depth(RootEnvironmentLayer.self)),
            ("RootStoryDoorsLayer", depth(RootStoryDoorsLayer.self)),
            ("RootChromeLayer", depth(RootChromeLayer.self)),
            ("RootSheetsLayer", depth(RootSheetsLayer.self)),
            ("RootStatusBubbleLayer", depth(RootStatusBubbleLayer.self)),
            ("RootIntentRoutingLayer", depth(RootIntentRoutingLayer.self)),
            ("CallPresentationLayer", depth(CallPresentationLayer.self)),
            ("iPadEnvironmentLayer", depth(iPadEnvironmentLayer.self)),
            ("iPadStoryAndLifecycleLayer", depth(iPadStoryAndLifecycleLayer.self)),
            ("iPadSheetsLayer", depth(iPadSheetsLayer.self)),
            ("iPadCoversAndChromeLayer", depth(iPadCoversAndChromeLayer.self)),
        ]
    }

    func test_genericDepth_countsNesting() {
        XCTAssertEqual(Self.genericDepth("A<B<C>, D<E<F<G>>>>"), 4)
        XCTAssertEqual(Self.genericDepth("Text"), 0)
    }

    func test_rootBodies_typeDepth_isReported() {
        let report = Self.measured.map { "\($0.0)=\($0.1)" }.joined(separator: " ")
        print("ROOT_TYPE_DEPTH \(report)")
        XCTAssertFalse(Self.measured.isEmpty)
    }
}
