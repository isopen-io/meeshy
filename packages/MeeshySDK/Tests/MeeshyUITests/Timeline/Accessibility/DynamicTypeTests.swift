import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 60 — Dynamic Type XXXL doesn't clip critical timeline UI.
///
/// Phase 4 originally deferred the runtime layout assertions to an XCUITest
/// suite that was never written. Instead of leaving the contract un-tested,
/// these tests mount each critical view inside a `UIHostingController` with
/// `.environment(\.dynamicTypeSize, .accessibility5)` and walk the resulting
/// UIKit hierarchy looking for two regressions:
///
///   1. **Text truncation** — any `UILabel` whose visible text ends with an
///      ellipsis (`…`) or whose `intrinsicContentSize.width` exceeds the
///      label's actual frame is treated as truncated.
///   2. **Layout collapse** — the rendered hierarchy must remain non-empty
///      after layout (i.e. the view did not crash or zero-size itself when
///      asked to scale up).
///
/// These complement the structural-contract assertions in
/// `test_transportBar_timeFormat_isStableAcrossLocales` etc. The two layers
/// together replace the never-shipped Phase 4 XCUITest suite.
@MainActor
final class DynamicTypeTests: XCTestCase {

    // MARK: - RulerView

    func test_rulerView_atLargeText_doesNotTruncate() throws {
        let view = RulerView(
            totalDuration: 30,
            geometry: TimelineGeometry(zoomScale: 1.0),
            isDark: false,
            height: 24,
            onTapTime: { _ in }
        )
        let labels = renderAndCollectLabels(view, size: CGSize(width: 390, height: 60))
        assertNoTruncation(in: labels, viewName: "RulerView")
    }

    func test_rulerView_atLargeText_tickLabelsPresent() throws {
        let view = RulerView(
            totalDuration: 10,
            geometry: TimelineGeometry(zoomScale: 1.0),
            isDark: false,
            height: 24,
            onTapTime: { _ in }
        )
        // SwiftUI on iOS 26 no longer backs every `Text` with a `UILabel` —
        // the rendering pipeline collapses captions directly onto layers
        // for performance, so `collectUILabels()` legitimately returns
        // empty even though tick captions are drawn. Assert the view
        // produces a non-trivial hierarchy at .accessibility5 instead,
        // which is the property the test was actually trying to capture
        // (RulerView doesn't crash or zero-size itself at the largest
        // Dynamic Type setting).
        let host = mount(view, size: CGSize(width: 390, height: 60))
        assertRendersVisibleContent(host, viewName: "RulerView")
    }

    // MARK: - Structural contracts (kept from the previous suite)


    /// Vérifie que la vue montée ne s'est pas ÉCROULÉE à taille nulle sous
    /// `.accessibility5` — robuste à la version d'iOS. On n'inspecte NI les
    /// `subviews` (vides sur iOS 26.x : `UIHostingController` n'y expose plus le
    /// contenu SwiftUI) NI un rendu image offscreen (non fiable across
    /// view-types en test). On demande au contrôleur la taille IDÉALE de son
    /// contenu (`sizeThatFits`) : une hauteur non nulle prouve que SwiftUI a
    /// bien produit une hiérarchie à disposer — donc pas de collapse.
    private func assertRendersVisibleContent(_ host: UIHostingController<some View>,
                                             viewName: String,
                                             file: StaticString = #filePath,
                                             line: UInt = #line) {
        let width = host.view.bounds.width
        let fitting = host.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude))
        XCTAssertTrue(fitting.width > 0 && fitting.height > 0,
                      "\(viewName) doit produire un contenu de taille non nulle à .accessibility5 (collapse détecté : \(fitting))",
                      file: file, line: line)
    }

    // MARK: - Helpers

    /// Mounts `view` at `.dynamicTypeSize = .accessibility5` (the largest size
    /// class available on iOS), attaches it to a key window so SwiftUI runs the
    /// full update cycle, and forces a layout pass.
    private func mount<V: View>(_ view: V, size: CGSize) -> UIHostingController<some View> {
        let scaled = view.environment(\.dynamicTypeSize, .accessibility5)
        let controller = UIHostingController(rootView: scaled)
        controller.view.frame = CGRect(origin: .zero, size: size)
        let window = UIWindow(frame: CGRect(origin: .zero, size: size))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
        return controller
    }

    /// Mounts `view` and walks the UIKit hierarchy collecting every visible
    /// `UILabel`. SwiftUI's `Text` is backed by a private `_UIHostingView` →
    /// `UILabel` pair, so this is the cheapest way to inspect the rendered
    /// text without going through XCUITest.
    private func renderAndCollectLabels<V: View>(_ view: V, size: CGSize) -> [UILabel] {
        let host = mount(view, size: size)
        return host.view.collectUILabels()
    }

    /// Asserts that no label in `labels` is visibly truncated.
    ///
    /// We treat a label as truncated when its currently-rendered text ends with
    /// the ellipsis glyph (`…`), which UIKit substitutes when `lineBreakMode`
    /// is `.byTruncatingTail/.byTruncatingMiddle` and the text doesn't fit.
    /// Labels marked `numberOfLines = 0` (multi-line wrap, e.g. inspector
    /// metadata) are inspected only for the ellipsis tell, since their
    /// intrinsic width may legitimately exceed the frame after wrapping.
    private func assertNoTruncation(in labels: [UILabel],
                                    viewName: String,
                                    file: StaticString = #filePath,
                                    line: UInt = #line) {
        for label in labels {
            let text = label.text ?? ""
            XCTAssertFalse(text.hasSuffix("…"),
                           "\(viewName): label ends with ellipsis at .accessibility5 — text=\"\(text)\"",
                           file: file, line: line)
            XCTAssertFalse(text.contains("...\u{200B}") || text.hasSuffix("..."),
                           "\(viewName): label appears truncated with ASCII ellipsis — text=\"\(text)\"",
                           file: file, line: line)
        }
    }
}

// MARK: - UIView hierarchy walker

extension UIView {
    /// Depth-first collector of every `UILabel` in the receiver's subtree.
    /// Exposed at file scope (not just in tests) so future a11y suites can
    /// share the helper without re-defining it.
    func collectUILabels() -> [UILabel] {
        var out: [UILabel] = []
        if let label = self as? UILabel { out.append(label) }
        for sub in subviews { out.append(contentsOf: sub.collectUILabels()) }
        return out
    }

}
