import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class StatusBubbleControllerTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT() -> StatusBubbleController {
        StatusBubbleController.shared
    }

    override func setUp() async throws {
        await MainActor.run {
            StatusBubbleController.shared.dismiss()
        }
    }

    // MARK: - Initial State

    func test_init_currentEntryIsNil() {
        let sut = makeSUT()
        XCTAssertNil(sut.currentEntry)
    }

    func test_init_isPresentedReturnsFalse() {
        let sut = makeSUT()
        XCTAssertFalse(sut.isPresented.wrappedValue)
    }

    // MARK: - Show

    func test_show_setsCurrentEntry() {
        let sut = makeSUT()
        let entry = makeStatusEntry()
        sut.show(entry: entry, anchor: CGPoint(x: 100, y: 200))

        XCTAssertNotNil(sut.currentEntry)
        XCTAssertEqual(sut.currentEntry?.id, entry.id)
    }

    func test_show_setsAnchorPoint() {
        let sut = makeSUT()
        let entry = makeStatusEntry()
        let anchor = CGPoint(x: 150, y: 250)
        sut.show(entry: entry, anchor: anchor)

        XCTAssertEqual(sut.anchor, anchor)
    }

    func test_show_isPresentedReturnsTrue() {
        let sut = makeSUT()
        sut.show(entry: makeStatusEntry(), anchor: .zero)

        XCTAssertTrue(sut.isPresented.wrappedValue)
    }

    // MARK: - Dismiss

    func test_dismiss_clearsCurrentEntry() {
        let sut = makeSUT()
        sut.show(entry: makeStatusEntry(), anchor: .zero)
        sut.dismiss()

        XCTAssertNil(sut.currentEntry)
    }

    func test_dismiss_isPresentedReturnsFalse() {
        let sut = makeSUT()
        sut.show(entry: makeStatusEntry(), anchor: .zero)
        sut.dismiss()

        XCTAssertFalse(sut.isPresented.wrappedValue)
    }

    // MARK: - isPresented Binding

    func test_isPresented_settingToFalse_dismissesEntry() {
        let sut = makeSUT()
        sut.show(entry: makeStatusEntry(), anchor: .zero)

        sut.isPresented.wrappedValue = false

        XCTAssertNil(sut.currentEntry)
    }

    // MARK: - Factory

    private func makeStatusEntry() -> StatusEntry {
        StatusEntry(
            id: UUID().uuidString,
            userId: "user1",
            username: "testuser",
            avatarColor: "#FF0000",
            moodEmoji: "happy",
            content: "Hello status",
            audioUrl: nil,
            createdAt: Date(),
            expiresAt: Date().addingTimeInterval(86400)
        )
    }
}
