import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryReaderRepresentableTests: XCTestCase {

    func test_initStory_buildsCanvasViewInPlayMode() {
        let item = StoryItem(id: "s", content: "hello", media: [],
                             storyEffects: StoryEffects(), createdAt: Date(),
                             expiresAt: nil, isViewed: false)
        let rep = StoryReaderRepresentable(story: item, preferredLanguages: ["fr"], mute: false)
        let host = UIHostingController(rootView: rep.frame(width: 412, height: 732))
        // Attach to a window so UIViewRepresentable makeUIView is called during layout.
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 412, height: 732))
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        XCTAssertTrue(containsCanvasView(host.view))
    }

    /// #10803 — un changement de traits arrive PENDANT la mise à jour SwiftUI
    /// (insertion du canvas dans la hiérarchie, présentation du lecteur sur
    /// iPad). Reconstruire les calques sur place relayait `onContentProgress`
    /// dans cette mise à jour : l'hôte y écrivait son `@State` (« Modifying
    /// state during view update », cinq fois par enchaînement de stories avant
    /// le SIGTRAP). La reconstruction se reporte à la passe de mise en page.
    func test_traitChange_defersRebuildToLayoutPass_noContentProgressDuringTheCall() {
        let item = StoryItem(id: "s", content: "hello", media: [],
                             storyEffects: StoryEffects(), createdAt: Date(),
                             expiresAt: nil, isViewed: false)
        let progressCalls = ProgressCounter()
        let rep = StoryReaderRepresentable(story: item, preferredLanguages: ["fr"], mute: false,
                                           onContentProgress: { _ in progressCalls.count += 1 })
        let host = UIHostingController(rootView: rep.frame(width: 412, height: 732))
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 412, height: 732))
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.layoutIfNeeded()
        guard let canvas = findCanvasView(host.view) else { return XCTFail("canvas absent") }
        canvas.layoutIfNeeded()
        progressCalls.count = 0

        canvas.traitCollectionDidChange(nil)

        XCTAssertEqual(progressCalls.count, 0)
        canvas.layoutIfNeeded()
        XCTAssertGreaterThan(progressCalls.count, 0)
    }

    // MARK: - Helpers

    private final class ProgressCounter {
        var count = 0
    }

    private func findCanvasView(_ view: UIView) -> StoryCanvasUIView? {
        if let canvas = view as? StoryCanvasUIView { return canvas }
        return view.subviews.lazy.compactMap { self.findCanvasView($0) }.first
    }


    private func containsCanvasView(_ view: UIView) -> Bool {
        if view is StoryCanvasUIView { return true }
        for sub in view.subviews { if containsCanvasView(sub) { return true } }
        return false
    }
}
