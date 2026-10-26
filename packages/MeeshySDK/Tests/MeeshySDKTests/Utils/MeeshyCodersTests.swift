import XCTest
@testable import MeeshySDK

final class MeeshyCodersTests: XCTestCase {

    private struct Stamp: Codable, Equatable {
        let id: String
        let at: Date
    }

    private static let gatewayPayload = Data(#"""
    {"id":"m1","at":"2026-09-15T09:34:23.563Z"}
    """#.utf8)

    private static let millisecond = Date(timeIntervalSince1970: 1_757_928_863.563)

    func test_apiAndSocket_decodeTheSameGatewayPayloadIdentically() throws {
        let api = try MeeshyCoders.decoder(.api).decode(Stamp.self, from: Self.gatewayPayload)
        let socket = try MeeshyCoders.decoder(.socket).decode(Stamp.self, from: Self.gatewayPayload)
        XCTAssertEqual(api, socket)
        XCTAssertEqual(api.at.timeIntervalSince1970, 1_757_928_863.563, accuracy: 0.000_5)
    }

    func test_everyPreset_decodesDatesWithAndWithoutFractionalSeconds() throws {
        let withFraction = Data(#"{"id":"a","at":"2026-09-15T09:34:23.563Z"}"#.utf8)
        let withoutFraction = Data(#"{"id":"a","at":"2026-09-15T09:34:23Z"}"#.utf8)
        let withOffset = Data(#"{"id":"a","at":"2026-09-15T11:34:23+02:00"}"#.utf8)
        for preset in MeeshyCoders.Preset.allCases {
            let decoder = MeeshyCoders.decoder(preset)
            let fractional = try decoder.decode(Stamp.self, from: withFraction)
            let whole = try decoder.decode(Stamp.self, from: withoutFraction)
            let offset = try decoder.decode(Stamp.self, from: withOffset)
            XCTAssertEqual(fractional.at.timeIntervalSince1970, 1_757_928_863.563, accuracy: 0.000_5, "\(preset)")
            XCTAssertEqual(whole.at.timeIntervalSince1970, 1_757_928_863, "\(preset)")
            XCTAssertEqual(offset.at, whole.at, "\(preset)")
        }
    }

    func test_everyPreset_rejectsATimeWithoutADate() {
        let timeOnly = Data(#"{"id":"a","at":"09:34:23.563"}"#.utf8)
        for preset in MeeshyCoders.Preset.allCases {
            XCTAssertThrowsError(try MeeshyCoders.decoder(preset).decode(Stamp.self, from: timeOnly), "\(preset)")
        }
    }

    func test_apiAndSocketEncoders_writeDatesToTheMillisecond() throws {
        for preset in [MeeshyCoders.Preset.api, .socket] {
            let data = try MeeshyCoders.encoder(preset).encode(Stamp(id: "a", at: Self.millisecond))
            let text = String(decoding: data, as: UTF8.self)
            XCTAssertTrue(text.contains(#""at":"2025-09-15T09:34:23.563Z""#), "\(preset): \(text)")
        }
    }

    func test_apiEncoder_roundTripsThroughTheApiDecoderToTheMillisecond() throws {
        let data = try MeeshyCoders.encoder(.api).encode(Stamp(id: "a", at: Self.millisecond))
        let back = try MeeshyCoders.decoder(.api).decode(Stamp.self, from: data)
        XCTAssertEqual(back.at.timeIntervalSince1970, Self.millisecond.timeIntervalSince1970, accuracy: 0.000_5)
    }

    func test_persistenceEncoders_writeTheSameBytesAsTheFoundationIso8601Strategy() throws {
        let foundation = JSONEncoder()
        foundation.dateEncodingStrategy = .iso8601
        let value = [Stamp(id: "a", at: Self.millisecond), Stamp(id: "b", at: Date(timeIntervalSince1970: 0))]
        XCTAssertEqual(try MeeshyCoders.encoder(.persistence).encode(value), try foundation.encode(value))
        foundation.outputFormatting = [.sortedKeys]
        XCTAssertEqual(try MeeshyCoders.encoder(.outbox).encode(value), try foundation.encode(value))
    }

    func test_outboxEncoder_sortsKeysForDeterministicBytes() throws {
        let text = String(decoding: try MeeshyCoders.encoder(.outbox).encode(["z": 1, "a": 2, "m": 3]), as: UTF8.self)
        XCTAssertEqual(text, #"{"a":2,"m":3,"z":1}"#)
    }

    func test_persistenceDecoder_readsFilesWrittenByTheFoundationIso8601Strategy() throws {
        let foundation = JSONEncoder()
        foundation.dateEncodingStrategy = .iso8601
        let stored = try foundation.encode(Stamp(id: "a", at: Date(timeIntervalSince1970: 1_757_928_863)))
        let back = try MeeshyCoders.decoder(.persistence).decode(Stamp.self, from: stored)
        XCTAssertEqual(back, Stamp(id: "a", at: Date(timeIntervalSince1970: 1_757_928_863)))
    }
}
