import Testing
import Foundation
@testable import MeeshySDK

@Suite("StoryDrawingStroke.captureVersion — default 0, codable, legacy-tolerant")
struct StoryDrawingStrokeCaptureVersionTests {
    @Test("default captureVersion is 0 (legacy)")
    func default_is_zero() { #expect(StoryDrawingStroke(colorHex: "FF0000", width: 5).captureVersion == 0) }

    @Test("captureVersion round-trips through Codable")
    func roundtrips() throws {
        let s = StoryDrawingStroke(colorHex: "FF0000", width: 5, captureVersion: 1)
        let data = try JSONEncoder().encode(s)
        let back = try JSONDecoder().decode(StoryDrawingStroke.self, from: data)
        #expect(back.captureVersion == 1)
    }

    @Test("legacy JSON without captureVersion key decodes to 0")
    func legacy_json_defaults_zero() throws {
        let json = #"{"id":"x","points":[],"colorHex":"FF0000","width":5,"tool":"pen","smoothing":"raw","createdAt":0}"#
        let dec = JSONDecoder(); dec.dateDecodingStrategy = .secondsSince1970
        let s = try dec.decode(StoryDrawingStroke.self, from: Data(json.utf8))
        #expect(s.captureVersion == 0)
    }
}
