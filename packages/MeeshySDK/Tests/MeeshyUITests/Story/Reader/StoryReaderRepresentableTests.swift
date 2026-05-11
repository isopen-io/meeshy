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

    // MARK: - Helpers

    private func containsCanvasView(_ view: UIView) -> Bool {
        if view is StoryCanvasUIView { return true }
        for sub in view.subviews { if containsCanvasView(sub) { return true } }
        return false
    }
}
