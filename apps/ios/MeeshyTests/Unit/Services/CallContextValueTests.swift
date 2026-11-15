import XCTest
import MeeshySDK
@testable import Meeshy

final class CallContextValueTests: XCTestCase {
    private func makeIncoming(
        iceServers: [IceServer]? = nil,
        kind: CallKind = .audio
    ) -> IncomingCall {
        IncomingCall(
            callId: "call-1", fromUserId: "u1", fromUsername: "Ada",
            kind: kind, iceServers: iceServers, conversationId: "conv-1"
        )
    }

    private func turn(_ url: String) -> IceServer {
        IceServer(urls: [url], username: "u", credential: "c")
    }

    func test_incomingCall_equality_includesIceServers() {
        let withA = makeIncoming(iceServers: [turn("turn:a.example:3478")])
        let withB = makeIncoming(iceServers: [turn("turn:b.example:3478")])

        XCTAssertNotEqual(withA, withB)
        XCTAssertNotEqual(withA, makeIncoming(iceServers: nil))
        XCTAssertEqual(withA, makeIncoming(iceServers: [turn("turn:a.example:3478")]))
    }

    func test_incomingCall_equality_includesKind() {
        XCTAssertNotEqual(makeIncoming(kind: .audio), makeIncoming(kind: .video))
    }

    func test_outgoingCallContext_equality_includesKind() {
        let audio = OutgoingCallContext(conversationId: "c", userId: "u", displayName: "Ada", kind: .audio)
        let video = OutgoingCallContext(conversationId: "c", userId: "u", displayName: "Ada", kind: .video)

        XCTAssertNotEqual(audio, video)
        XCTAssertEqual(audio, OutgoingCallContext(conversationId: "c", userId: "u", displayName: "Ada", kind: .audio))
    }
}
