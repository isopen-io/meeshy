import XCTest
@testable import Meeshy

/// **Les couches de la racine entrent et sortent animées, et en fondu court
/// sous « Réduire les animations »** (#18400).
///
/// Le chrome flottant, l'échelle du menu, les bannières et les cartes d'appel
/// apparaissaient sèches, ou glissaient sans chemin réduit. La loi de l'échelle
/// se lit ici sans SwiftUI ; le câblage des couches se lit dans leurs sources,
/// commentaires et chaînes masqués.
final class RootLayersMotionWiringTests: XCTestCase {

    // MARK: - L'échelle du menu

    func test_menuRung_underReduceMotion_onlyFades_withoutScaleRotationNorStagger() {
        let closed = MenuRungMotion.pose(isOpen: false, reduceMotion: true, delay: 0.12)
        let open = MenuRungMotion.pose(isOpen: true, reduceMotion: true, delay: 0.12)

        XCTAssertEqual(closed.scale, 1)
        XCTAssertEqual(closed.rotationDegrees, 0)
        XCTAssertEqual(closed.opacity, 0)
        XCTAssertEqual(open.opacity, 1)
        XCTAssertEqual(open.delay, 0, "sous réduction, aucun décalage par rang")
    }

    func test_menuRung_withMotion_springsFromTheDisc_andStaggersOnlyOnOpening() {
        let closed = MenuRungMotion.pose(isOpen: false, reduceMotion: false, delay: 0.12)
        let open = MenuRungMotion.pose(isOpen: true, reduceMotion: false, delay: 0.12)

        XCTAssertEqual(closed.scale, 0.3)
        XCTAssertEqual(closed.rotationDegrees, -30)
        XCTAssertEqual(closed.delay, 0, "la fermeture part d'un bloc")
        XCTAssertEqual(open.scale, 1)
        XCTAssertEqual(open.rotationDegrees, 0)
        XCTAssertEqual(open.delay, 0.12)
    }

    // MARK: - Câblage

    private func code(_ relative: String) throws -> String {
        let source = try AppSourceGuard.unit(relative)
        XCTAssertFalse(source.isEmpty, "source vide : chemin faux")
        return DeclarationBodyScanner.mask(source)
            .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
    }

    private func animationValues(in code: String) -> [String] {
        code.components(separatedBy: ".meeshyAnimation(").dropFirst().compactMap { call in
            call.range(of: "value:").map { String(call[$0.upperBound...].prefix(80)) }
        }
    }

    private func assertAnimates(_ relative: String, on value: String, file: StaticString = #filePath, line: UInt = #line) throws {
        let values = animationValues(in: try code(relative))
        XCTAssertTrue(values.contains { $0.contains(value) },
                      "\(relative) : aucune .meeshyAnimation liée à \(value) — la transition ne joue pas",
                      file: file, line: line)
    }

    func test_rootView_floatingChrome_entersByATransition_andItsOverlayAnimatesTheDepth() throws {
        let root = try code("Meeshy/Features/Main/Views/RootView.swift")
        XCTAssertTrue(root.contains(") .meeshyTransition(.opacity)"), "le chrome flottant entre et sort en fondu")
        XCTAssertTrue(animationValues(in: root).contains { $0.contains("router.isDeepRoute") },
                      "l'overlay du chrome flottant anime la profondeur de la pile")
    }

    func test_callFeedbackCard_isAnimatedOnItsPrompt() throws {
        try assertAnimates("Meeshy/Features/Main/Views/RootLayers/CallFeedbackLayer.swift", on: "prompt")
        XCTAssertTrue(try code("Meeshy/Features/Main/Views/RootLayers/CallFeedbackLayer.swift")
            .contains(".meeshyTransition(.move(edge: .bottom).combined(with: .opacity))"))
    }

    func test_callWaitingBanner_isAnimatedOnItsFlag() throws {
        try assertAnimates("Meeshy/Features/Main/Views/RootLayers/CallPresentationLayer.swift", on: "showCallWaitingBanner")
    }

    func test_callReturnPoint_isAnimatedOnTheDisplayMode() throws {
        try assertAnimates("Meeshy/Features/Main/Views/RootLayers/CallWindowPresenter.swift", on: "displayMode")
    }

    func test_pendingLinkNotice_isAnimatedOnThePendingLink() throws {
        try assertAnimates("Meeshy/App/SessionContent.swift", on: "pendingDeepLink")
        XCTAssertTrue(try code("Meeshy/Features/Auth/Views/PendingLinkNotice.swift")
            .contains(".meeshyTransition(.move(edge: .top).combined(with: .opacity))"))
    }

    func test_feedSkeletons_areAnimatedOnTheColdLoad() throws {
        try assertAnimates("Meeshy/Features/Main/Views/RootViewComponents.swift", on: "isLoading")
    }

    func test_pendingSettingsBanner_reducesToAFade() throws {
        let banner = try code("Meeshy/Features/Main/Views/RootPendingBanners.swift")
        XCTAssertTrue(banner.contains(".meeshyTransition(.move(edge: .top).combined(with: .opacity))"))
        XCTAssertTrue(animationValues(in: banner).contains { $0.contains("pendingCount") })
    }
}
