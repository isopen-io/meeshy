import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// Guideline 5 (MIIT) — China-region incoming-call push (`.incomingCallAlert`,
/// raw value `"call"`) is the ONLY affordance a backgrounded/killed-app China
/// user has to engage an incoming call: no CallKit, no PushKit VoIP
/// registration there (see VoIPPushManagerTests). Before this fix, tapping
/// this notification silently did nothing (`.incomingCallAlert` didn't exist,
/// the payload fell back to `.system`, and `RootView`'s `.system` case is a
/// no-op `break`). `RootView.navigateFromNotification` is a `private` method
/// on a SwiftUI View with heavy dependencies (router, CallManager, etc.), so
/// — matching the existing convention in `CallManagerAudioSessionTests`
/// (`callManagerSource()`, source-string guards) — these are source-level
/// guards rather than a fully mocked behavioral test.
final class NotificationCallRoutingTests: XCTestCase {

    private func rootViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/RootView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func iPadRootViewNavigationSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/iPadRootView+Navigation.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - MeeshyNotificationType raw value

    func test_MeeshyNotificationType_rawValueCall_isRecognized() {
        XCTAssertEqual(MeeshyNotificationType(rawValue: "call"), .incomingCallAlert)
    }

    // MARK: - RootView (iPhone)

    func test_navigateFromNotification_callType_opensIncomingCallUI_notConversation() throws {
        let source = try rootViewSource()
        guard let caseRange = source.range(of: "case .incomingCallAlert:") else {
            XCTFail(".incomingCallAlert case not found in RootView.navigateFromNotification"); return
        }
        let afterCase = String(source[caseRange.upperBound...])
        guard let caseEnd = afterCase.range(of: "case .postLike")?.lowerBound else {
            XCTFail("Could not find .incomingCallAlert case boundary"); return
        }
        let caseBody = String(afterCase[..<caseEnd])
        XCTAssertTrue(
            caseBody.contains("CallManager.shared.handleIncomingCallNotification"),
            "the China incoming-call push must drive CallManager.handleIncomingCallNotification " +
            "(WebRTC negotiation + answer UI) — a plain navigateToConversationById would leave the " +
            "user staring at a conversation with no way to answer the call")
        XCTAssertTrue(
            caseBody.contains("iceServers: VoIPPushManager.parseIceServers(ctx.iceServersJSON)"),
            "must reuse VoIPPushManager.parseIceServers (already validated/length-guarded for the " +
            "PushKit path) rather than re-implementing ICE server JSON parsing")
    }

    func test_navigateFromNotification_callType_withMissingCallId_fallsBackToConversation() throws {
        let source = try rootViewSource()
        guard let caseRange = source.range(of: "case .incomingCallAlert:") else {
            XCTFail(".incomingCallAlert case not found in RootView.navigateFromNotification"); return
        }
        let afterCase = String(source[caseRange.upperBound...])
        guard let caseEnd = afterCase.range(of: "case .postLike")?.lowerBound else {
            XCTFail("Could not find .incomingCallAlert case boundary"); return
        }
        let caseBody = String(afterCase[..<caseEnd])
        XCTAssertTrue(
            caseBody.contains("guard let callId = ctx.callId"),
            "a malformed/legacy call payload without a callId must not crash trying to start a call")
        XCTAssertTrue(
            caseBody.contains("navigateToConversationById(conversationId)"),
            "without a callId, fall back to opening the conversation so the tap is never a dead end")
    }

    // MARK: - iPadRootView+Navigation (iPad)

    func test_iPadHandlePushNotificationTap_callType_opensIncomingCallUI_notConversation() throws {
        let source = try iPadRootViewNavigationSource()
        guard let caseRange = source.range(of: "case .incomingCallAlert:") else {
            XCTFail(".incomingCallAlert case not found in iPadRootView+Navigation"); return
        }
        let afterCase = String(source[caseRange.upperBound...])
        guard let caseEnd = afterCase.range(of: "case .postLike")?.lowerBound else {
            XCTFail("Could not find .incomingCallAlert case boundary"); return
        }
        let caseBody = String(afterCase[..<caseEnd])
        XCTAssertTrue(
            caseBody.contains("CallManager.shared.handleIncomingCallNotification"),
            "iPad must drive the same call-answer flow as RootView — no CallKit, no PushKit VoIP " +
            "registration in China on iPad either")
    }
}
