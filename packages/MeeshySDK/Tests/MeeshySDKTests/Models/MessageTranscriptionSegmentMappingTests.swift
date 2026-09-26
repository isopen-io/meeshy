import Foundation
import Testing
@testable import MeeshySDK

@Suite("MessageTranscriptionSegment — depuis le segment du fil")
struct MessageTranscriptionSegmentMappingTests {

    private func wireSegment(_ json: String) throws -> TranscriptionSegment {
        try JSONDecoder().decode(TranscriptionSegment.self, from: Data(json.utf8))
    }

    @Test("le texte, les bornes et le locuteur passent tels quels")
    func mapsEveryField() throws {
        let wire = try wireSegment(#"{"text":"Bonjour","startTime":1.5,"endTime":2.25,"speakerId":"s1"}"#)

        let segment = MessageTranscriptionSegment(wire)

        #expect(segment.text == "Bonjour")
        #expect(segment.startTime == 1.5)
        #expect(segment.endTime == 2.25)
        #expect(segment.speakerId == "s1")
    }

    @Test("des bornes en millisecondes arrivent en secondes")
    func mapsMillisecondBoundsInSeconds() throws {
        let wire = try wireSegment(#"{"text":"Salut","startMs":500,"endMs":1500}"#)

        let segment = MessageTranscriptionSegment(wire)

        #expect(segment.startTime == 0.5)
        #expect(segment.endTime == 1.5)
        #expect(segment.speakerId == nil)
    }
}
