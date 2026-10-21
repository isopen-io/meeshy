import XCTest
@testable import MeeshySDK

final class ConversationSyncEngineCancelledBackoffTests: XCTestCase {

    func test_fetchPageWithRetry_cancelledDuringBackoff_throwsCancellationWithoutRetrying() async {
        let service = MockConversationService()
        service.listResponder = { _ in
            withUnsafeCurrentTask { $0?.cancel() }
            throw URLError(.timedOut)
        }

        let error: Error? = await Task {
            do {
                _ = try await ConversationSyncEngine.fetchPageWithRetry(via: service, offset: 0, limit: 20)
                return nil
            } catch {
                return error
            }
        }.value

        XCTAssertTrue(error is CancellationError)
        let calls = service.listCallCount
        XCTAssertEqual(calls, 1)
    }
}
