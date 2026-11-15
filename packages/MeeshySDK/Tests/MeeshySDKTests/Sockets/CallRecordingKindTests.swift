import XCTest
@testable import MeeshySDK

/// #8437 — le TYPE d'un enregistrement (audio seul, ou vidéo avec son audio)
/// voyage avec la demande, pour que chacun sache ce qu'il accepte. La
/// passerelle antérieure au champ refuse toute clé inconnue (schéma strict) :
/// une demande AUDIO part donc sans `kind`, seule la vidéo le nomme.
final class CallRecordingKindTests: XCTestCase {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    func test_requestPayload_audio_omitsTheKindForTheStrictGateway() {
        let payload = MessageSocketManager.callRecordingRequestPayload(callId: "c1", kind: .audio)

        XCTAssertEqual(payload["callId"] as? String, "c1")
        XCTAssertNil(payload["kind"])
    }

    func test_requestPayload_video_namesTheKind() {
        let payload = MessageSocketManager.callRecordingRequestPayload(callId: "c1", kind: .video)

        XCTAssertEqual(payload["kind"] as? String, "video")
    }

    func test_requested_withoutKind_readsAsAudio() throws {
        let event = try decode(
            CallRecordingRequestedEvent.self,
            #"{"callId":"c1","recordingId":"r1","requesterId":"u1","requiredUserIds":["u2"]}"#
        )

        XCTAssertEqual(event.kind, .audio)
    }

    func test_requested_video_carriesTheKind() throws {
        let event = try decode(
            CallRecordingRequestedEvent.self,
            #"{"callId":"c1","recordingId":"r1","requesterId":"u1","requiredUserIds":["u2"],"kind":"video"}"#
        )

        XCTAssertEqual(event.kind, .video)
    }

    func test_started_unknownKind_readsAsAudio() throws {
        let event = try decode(
            CallRecordingStartedEvent.self,
            #"{"callId":"c1","recordingId":"r1","recorderId":"u1","kind":"hologram"}"#
        )

        XCTAssertEqual(event.kind, .audio)
    }

    func test_started_video_carriesTheKind() throws {
        let event = try decode(
            CallRecordingStartedEvent.self,
            #"{"callId":"c1","recordingId":"r1","recorderId":"u1","kind":"video"}"#
        )

        XCTAssertEqual(event.kind, .video)
    }
}
