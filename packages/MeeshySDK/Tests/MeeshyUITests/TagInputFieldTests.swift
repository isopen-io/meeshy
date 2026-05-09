import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class TagInputFieldTests: XCTestCase {
    private struct Host: View {
        @State var tags: [String]
        let known: [String]
        var body: some View {
            TagInputField(selectedTags: $tags, knownTags: known, accentColor: .blue)
        }
    }

    func test_init_emptyState() {
        XCTAssertNotNil(Host(tags: [], known: []).body)
    }

    func test_init_withSelected() {
        XCTAssertNotNil(Host(tags: ["urgent"], known: ["urgent", "family"]).body)
    }
}
