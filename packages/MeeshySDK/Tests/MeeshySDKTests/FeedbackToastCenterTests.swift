import XCTest
@testable import MeeshySDK

private final class ToastRecorder: @unchecked Sendable {
    private(set) let recorder = ToastRecorder()
    func record(_ toast: (message: String, isSuccess: Bool)) { received.append(toast) }
}

final class FeedbackToastCenterTests: XCTestCase {

    func test_post_thenDecode_roundTripsMessageAndSuccess() {
        let center = NotificationCenter()
        let recorder = ToastRecorder()
        let token = center.addObserver(forName: FeedbackToastCenter.notificationName, object: nil, queue: nil) { notification in
            if let decoded = FeedbackToastCenter.decode(notification) { recorder.record(decoded) }
        }
        defer { center.removeObserver(token) }

        FeedbackToastCenter.post("Enregistré", isSuccess: true, center: center)
        FeedbackToastCenter.post("Échec", isSuccess: false, center: center)

        XCTAssertEqual(recorder.received.map(\.message), ["Enregistré", "Échec"])
        XCTAssertEqual(recorder.received.map(\.isSuccess), [true, false])
    }

    func test_decode_foreignUserInfo_returnsNil() {
        let foreign = Notification(name: FeedbackToastCenter.notificationName, object: nil, userInfo: ["text": "x"])
        let otherName = Notification(name: Notification.Name("autre"), object: nil, userInfo: ["message": "x", "isSuccess": true])

        XCTAssertNil(FeedbackToastCenter.decode(foreign))
        XCTAssertNil(FeedbackToastCenter.decode(otherName))
        XCTAssertNil(FeedbackToastCenter.decode(Notification(name: FeedbackToastCenter.notificationName)))
    }
}
