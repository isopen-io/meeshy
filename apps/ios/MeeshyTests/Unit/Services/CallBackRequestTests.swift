import Intents
import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// « Rappeler » compose vraiment l'appel (#8067, #7735) — la TRADUCTION de
/// chaque porte (notification d'appel manqué, `INStartCallIntent` des Récents,
/// raccourci Siri) en paramètres de `CallStarter`. Ces témoins ne doublent pas
/// `CallStarter` : ils gardent ce que chaque porte lui remet.
@MainActor
final class CallBackRequestTests: XCTestCase {

    // MARK: - Notification d'appel manqué

    private func missedCallUserInfo(
        type: String = "missed_call",
        senderId: String = "u-ada",
        isVideo: Any? = "true",
        conversationId: String = "c-ada"
    ) -> [AnyHashable: Any] {
        var info: [AnyHashable: Any] = [
            "type": type,
            "senderId": senderId,
            "senderDisplayName": "Ada Lovelace",
            "senderUsername": "ada",
            "conversationId": conversationId
        ]
        if let isVideo { info["isVideo"] = isVideo }
        return info
    }

    func test_notification_missedVideoCall_callsBackTheCallerInVideo() {
        let request = CallBackRequest(notification: NotificationPayload(userInfo: missedCallUserInfo()))

        XCTAssertEqual(
            request,
            CallBackRequest(userId: "u-ada", displayName: "Ada Lovelace", isVideo: true, conversationId: "c-ada")
        )
    }

    func test_notification_missedCallWithoutType_callsBackInAudio() {
        let request = CallBackRequest(notification: NotificationPayload(userInfo: missedCallUserInfo(isVideo: nil)))

        XCTAssertEqual(request?.isVideo, false)
    }

    func test_notification_otherMissedSpellings_callBackToo() {
        XCTAssertNotNil(CallBackRequest(notification: NotificationPayload(userInfo: missedCallUserInfo(type: "CALL_MISSED"))))
        XCTAssertNotNil(CallBackRequest(notification: NotificationPayload(userInfo: missedCallUserInfo(type: "call_declined"))))
    }

    func test_notification_withoutCaller_orNotACall_placesNothing() {
        XCTAssertNil(CallBackRequest(notification: NotificationPayload(userInfo: missedCallUserInfo(senderId: ""))))
        XCTAssertNil(CallBackRequest(notification: NotificationPayload(userInfo: missedCallUserInfo(type: "new_message"))))
        XCTAssertNil(CallBackRequest(notification: NotificationPayload(userInfo: missedCallUserInfo(type: "call"))))
    }

    func test_notification_withoutConversation_resolvesTheDirectConversation() {
        let request = CallBackRequest(notification: NotificationPayload(userInfo: missedCallUserInfo(conversationId: "")))

        XCTAssertEqual(request?.userId, "u-ada")
        XCTAssertNil(request?.conversationId)
    }

    // MARK: - INStartCallIntent (Récents d'iOS, #7735)

    private func intent(handle: String?, name: String = "Ada", capability: INCallCapability) -> INStartCallIntent {
        let contacts = handle.map { value in
            [INPerson(
                personHandle: INPersonHandle(value: value, type: .unknown),
                nameComponents: nil,
                displayName: name,
                image: nil,
                contactIdentifier: nil,
                customIdentifier: nil
            )]
        }
        return INStartCallIntent(
            callRecordFilter: nil,
            callRecordToCallBack: nil,
            audioRoute: .unknown,
            destinationType: .normal,
            contacts: contacts,
            callCapability: capability
        )
    }

    func test_intent_videoCapability_callsTheHandleUserInVideo() {
        let request = CallBackRequest(intent: intent(handle: "65f0c0ffee0000000000abcd", capability: .videoCall))

        XCTAssertEqual(
            request,
            CallBackRequest(userId: "65f0c0ffee0000000000abcd", displayName: "Ada", isVideo: true, conversationId: nil)
        )
    }

    func test_intent_audioCapability_callsInAudio() {
        let request = CallBackRequest(intent: intent(handle: "u-ada", capability: .audioCall))

        XCTAssertEqual(request?.userId, "u-ada")
        XCTAssertEqual(request?.isVideo, false)
    }

    func test_intent_withoutContact_orEmptyHandle_placesNothing() {
        XCTAssertNil(CallBackRequest(intent: intent(handle: nil, capability: .audioCall)))
        XCTAssertNil(CallBackRequest(intent: intent(handle: "", capability: .videoCall)))
        XCTAssertNil(CallBackRequest(intent: intent(handle: "   ", capability: .videoCall)))
    }

    func test_userActivity_carryingAStartCallIntent_isDecoded() {
        let activity = NSUserActivity(activityType: CallBackRequest.startCallActivityType)
        let interaction = INInteraction(intent: intent(handle: "u-ada", capability: .videoCall), response: nil)

        XCTAssertEqual(CallBackRequest(intent: interaction.intent as? INStartCallIntent)?.userId, "u-ada")
        XCTAssertNil(CallBackRequest(userActivity: activity))
    }

    // MARK: - Non-régression sur l'écrivain du handle (#7735 § 4)

    /// Le lecteur ci-dessus n'a de sens que si l'écrivain continue de graver
    /// l'identifiant de l'utilisateur dans le `CXHandle`, sur les DEUX sens.
    func test_callManager_writesTheUserIdInTheCallKitHandle_onBothDirections() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(
            source.contains("let handle = CXHandle(type: .generic, value: userId)"),
            "l'appel SORTANT doit graver le userId dans le CXHandle — c'est ce que les Récents rendent à INStartCallIntent"
        )
        XCTAssertTrue(
            source.contains("update.remoteHandle = CXHandle(type: .generic, value: userId)"),
            "la mise à jour de l'appel sortant doit garder le userId comme handle"
        )
        XCTAssertTrue(
            source.contains("update.remoteHandle = CXHandle(type: .generic, value: callerUserId.isEmpty ? callerName : callerUserId)"),
            "l'appel ENTRANT doit graver le userId de l'appelant dans le CXHandle"
        )
    }

    // MARK: - Le composeur (CallBackDialer)

    private final class Recorder {
        var started: [CallBackRequest] = []
        var profiles: [String] = []
        var unavailable = 0
        var fetched: [String] = []
    }

    private func dialer(
        recorder: Recorder,
        cached: [String: CallPeer] = [:],
        remote: [String: CallPeer] = [:],
        conversationExists: Bool = true
    ) -> CallBackDialer {
        CallBackDialer(
            start: { request, onUnavailable in
                recorder.started.append(request)
                if request.conversationId == nil && !conversationExists { onUnavailable() }
            },
            cachedPeer: { cached[$0] },
            fetchPeer: { id in
                recorder.fetched.append(id)
                return remote[id]
            },
            openProfile: { recorder.profiles.append($0) },
            showUnavailable: { recorder.unavailable += 1 }
        )
    }

    func test_dial_placesTheCallThroughTheStarter() {
        let recorder = Recorder()
        let request = CallBackRequest(userId: "u-ada", displayName: "Ada", isVideo: true, conversationId: "c-ada")

        dialer(recorder: recorder).dial(request)

        XCTAssertEqual(recorder.started, [request])
        XCTAssertTrue(recorder.profiles.isEmpty)
    }

    func test_dial_withoutDirectConversation_opensTheProfile_neverCreatesOne() {
        let recorder = Recorder()

        dialer(recorder: recorder, conversationExists: false)
            .dial(CallBackRequest(userId: "u-ada", displayName: "Ada", isVideo: false, conversationId: nil))

        XCTAssertEqual(recorder.profiles, ["u-ada"])
    }

    func test_dialFromProfile_placesTheCallThroughTheStarter_withTheSharedConversation() {
        let recorder = Recorder()

        dialer(recorder: recorder).dialFromProfile(
            ProfileCallRequest(userId: "u-ada", displayName: "Ada", isVideo: true, conversationId: "c-ada")
        )

        XCTAssertEqual(recorder.started, [CallBackRequest(userId: "u-ada", displayName: "Ada", isVideo: true, conversationId: "c-ada")])
    }

    func test_dialFromProfile_withoutDirectConversation_saysSo_insteadOfReopeningTheProfile() {
        let recorder = Recorder()

        dialer(recorder: recorder, conversationExists: false).dialFromProfile(
            ProfileCallRequest(userId: "u-ada", displayName: "Ada", isVideo: false, conversationId: nil)
        )

        XCTAssertEqual(recorder.unavailable, 1)
        XCTAssertTrue(recorder.profiles.isEmpty)
    }

    func test_dialConversation_cachedPeer_dialsWithoutNetwork() async {
        let recorder = Recorder()
        let peer = CallPeer(userId: "u-ada", displayName: "Ada")

        await dialer(recorder: recorder, cached: ["c-ada": peer]).dialConversation(id: "c-ada", isVideo: true)

        XCTAssertEqual(recorder.started, [CallBackRequest(userId: "u-ada", displayName: "Ada", isVideo: true, conversationId: "c-ada")])
        XCTAssertTrue(recorder.fetched.isEmpty)
    }

    func test_dialConversation_uncachedPeer_isFetchedThenDialed() async {
        let recorder = Recorder()
        let peer = CallPeer(userId: "u-bob", displayName: "Bob")

        await dialer(recorder: recorder, remote: ["c-bob": peer]).dialConversation(id: "c-bob", isVideo: false)

        XCTAssertEqual(recorder.fetched, ["c-bob"])
        XCTAssertEqual(recorder.started.first?.userId, "u-bob")
        XCTAssertEqual(recorder.started.first?.isVideo, false)
    }

    func test_dialConversation_unknownPeer_saysSo_andPlacesNothing() async {
        let recorder = Recorder()

        await dialer(recorder: recorder).dialConversation(id: "c-ghost", isVideo: false)

        XCTAssertTrue(recorder.started.isEmpty)
        XCTAssertEqual(recorder.unavailable, 1)
    }
}
