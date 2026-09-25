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

    /// Relevé du 2026-09-26 (build Debug, simulateur iOS 26.1) : RootView=20,
    /// iPadRootView=21, iPadCoversAndChromeLayer=18, les autres ≤ 16. Les
    /// corps de la racine ne portent donc PAS le type d'environ 150 niveaux
    /// échantillonné pendant le gel — il vit plus bas dans l'arbre (issue
    /// dédiée). Ce plafond empêche la racine de le devenir : une couche qui
    /// l'atteint se découpe en vues nommées, elle ne monte pas le plafond.
    static let ceiling = 24

    func test_rootBodies_typeDepth_staysUnderCeiling() {
        let measured = Self.measured
        print("ROOT_TYPE_DEPTH " + measured.map { "\($0.0)=\($0.1)" }.joined(separator: " "))
        for (name, depth) in measured {
            XCTAssertLessThanOrEqual(
                depth, Self.ceiling,
                "Le type de `\(name).Body` est imbriqué sur \(depth) niveaux (plafond \(Self.ceiling)) : " +
                "AttributeGraph paie une recherche de conformité par niveau au premier rendu (#7955)."
            )
        }
    }
}
