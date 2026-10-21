import XCTest
import SwiftUI
import UIKit
import Combine
import MeeshyUI

/// **La page montrée est celle que le lien nomme — à l'ouverture comme après
/// que la source a changé, et sans construire les pages lointaines** (#11162,
/// #11163).
///
/// La galerie de conversation s'ouvre sur la fenêtre de messages, puis le
/// catalogue des médias la remplace par l'index complet : des pièces plus
/// anciennes arrivent AVANT la page ouverte. Mesuré au simulateur iOS 27 sur le
/// pager `.scrollPosition` (`LazyHStack`) : le lien restait sur la pièce
/// touchée, mais le `ScrollView` gardait son décalage et montrait « z » au lieu
/// de « c » ; ouvrir la 900e page en construisait 903. Le journal de l'iPhone
/// du porteur a pris le fil principal dans cette construction jusqu'au chien de
/// garde (0x8BADF00D).
///
/// Le témoin lit ce que l'utilisateur VOIT — le décalage de la vue défilante
/// rapporté à la largeur d'une page, jamais la valeur du lien — et compte les
/// corps de page évalués.
@MainActor
final class AdaptiveHorizontalPagerPinningTests: XCTestCase {

    private struct Page: Identifiable, Equatable {
        let id: String
    }

    @MainActor
    private final class PagerModel: ObservableObject {
        @Published var items: [Page]
        @Published var current: String?

        init(ids: [String], current: String) {
            items = ids.map(Page.init(id:))
            self.current = current
        }
    }

    @MainActor
    private final class BodyCounter {
        private(set) var evaluatedIDs: Set<String> = []
        func note(_ id: String) { evaluatedIDs.insert(id) }
    }

    private struct PageBody: View {
        let id: String
        let counter: BodyCounter

        var body: some View {
            counter.note(id)
            return Text(id)
        }
    }

    private struct Host: View {
        @ObservedObject var model: PagerModel
        let counter: BodyCounter

        var body: some View {
            AdaptiveHorizontalPager(items: model.items, currentPageID: $model.current,
                                    paging: .selection) { _, page in
                PageBody(id: page.id, counter: counter)
            }
        }
    }

    private static let pageWidth: CGFloat = 300

    private var retainedWindows: [UIWindow] = []

    private func mount(_ model: PagerModel, counter: BodyCounter = BodyCounter()) -> UIWindow {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: Self.pageWidth, height: 600))
        window.rootViewController = UIHostingController(rootView: Host(model: model, counter: counter))
        window.isHidden = false
        window.layoutIfNeeded()
        retainedWindows.append(window)
        settle()
        return window
    }

    private func settle() {
        for _ in 0..<6 {
            RunLoop.main.run(until: Date().addingTimeInterval(0.1))
        }
    }

    private func scrollView(in view: UIView) -> UIScrollView? {
        if let scroll = view as? UIScrollView, scroll.bounds.width > 0 { return scroll }
        for subview in view.subviews {
            if let found = scrollView(in: subview) { return found }
        }
        return nil
    }

    private func visibleID(in window: UIWindow, model: PagerModel) throws -> String {
        let scroll = try XCTUnwrap(scrollView(in: window), "aucune vue défilante montée")
        let index = Int((scroll.contentOffset.x / Self.pageWidth).rounded())
        return try XCTUnwrap(model.items.indices.contains(index) ? model.items[index].id : nil,
                             "décalage hors des pages : \(scroll.contentOffset.x)")
    }

    func test_open_showsTheLinkedPage() throws {
        let model = PagerModel(ids: ["a", "b", "c", "d"], current: "c")
        let window = mount(model)

        XCTAssertEqual(try visibleID(in: window, model: model), "c")
    }

    func test_olderPagesArrivingBefore_keepShowingTheLinkedPage() throws {
        let model = PagerModel(ids: ["a", "b", "c", "d"], current: "c")
        let window = mount(model)

        model.items = ["x", "y", "z", "a", "b", "c", "d"].map(Page.init(id:))
        settle()

        XCTAssertEqual(model.current, "c")
        XCTAssertEqual(try visibleID(in: window, model: model), "c")
    }

    func test_reorderedSourceOfSameSize_keepsShowingTheLinkedPage() throws {
        let model = PagerModel(ids: ["a", "b", "c", "d"], current: "c")
        let window = mount(model)

        model.items = ["c", "a", "b", "d"].map(Page.init(id:))
        settle()

        XCTAssertEqual(model.current, "c")
        XCTAssertEqual(try visibleID(in: window, model: model), "c")
    }

    func test_openingDeepInALongSeries_evaluatesOnlyThePagesAroundIt() throws {
        let model = PagerModel(ids: (0..<1_000).map { "p\($0)" }, current: "p900")
        let counter = BodyCounter()
        let window = mount(model, counter: counter)

        XCTAssertEqual(try visibleID(in: window, model: model), "p900")
        XCTAssertLessThan(counter.evaluatedIDs.count, 10, "\(counter.evaluatedIDs.count) pages évaluées")
    }

    func test_olderPagesArrivingBeforeADeepPage_evaluateOnlyThePagesAroundIt() throws {
        let model = PagerModel(ids: (900..<1_000).map { "p\($0)" }, current: "p950")
        let counter = BodyCounter()
        let window = mount(model, counter: counter)

        model.items = (0..<1_000).map { Page(id: "p\($0)") }
        settle()

        XCTAssertEqual(try visibleID(in: window, model: model), "p950")
        XCTAssertLessThan(counter.evaluatedIDs.count, 10, "\(counter.evaluatedIDs.count) pages évaluées")
    }

    func test_movingTheLink_showsTheNamedPage() throws {
        let model = PagerModel(ids: (0..<50).map { "p\($0)" }, current: "p10")
        let window = mount(model)

        model.current = "p11"
        settle()

        XCTAssertEqual(try visibleID(in: window, model: model), "p11")
    }
}
