import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class CategoryPickerFieldTests: XCTestCase {
    private func makeCategory(id: String, name: String, order: Int = 0) -> ConversationCategory {
        ConversationCategory(id: id, name: name, color: "#6366F1", icon: nil, order: order, isExpanded: true)
    }

    private struct Host: View {
        let categories: [ConversationCategory]
        @State var selected: String? = nil
        var onCreate: (String) async -> ConversationCategory? = { _ in nil }

        var body: some View {
            CategoryPickerField(
                categories: categories,
                selectedId: $selected,
                accentColor: .blue,
                onCreateCategory: onCreate
            )
        }
    }

    func test_init_doesNotCrashWhenCategoriesEmpty() {
        let host = Host(categories: [])
        XCTAssertNotNil(host.body)
    }

    func test_init_doesNotCrashWithCategories() {
        let host = Host(categories: [makeCategory(id: "1", name: "Family")])
        XCTAssertNotNil(host.body)
    }

    func test_init_doesNotCrashWithSelectedCategory() {
        var host = Host(categories: [makeCategory(id: "1", name: "Family")])
        host.selected = "1"
        XCTAssertNotNil(host.body)
    }
}
