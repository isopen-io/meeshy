import XCTest
@testable import MeeshySDK

final class ConversationTypeUnicityTests: XCTestCase {

    private struct Wrapper: Codable, Equatable {
        let type: MeeshyConversation.ConversationType
    }

    private func palette(of type: MeeshyConversation.ConversationType) -> ConversationColorPalette {
        MeeshyConversation(identifier: "ref", type: type).colorPalette
    }

    private func reference(_ type: ConversationContext.ConversationType) -> ConversationColorPalette {
        DynamicColorGenerator.colorFor(context: ConversationContext(name: "ref", type: type))
    }

    private func assertSame(_ lhs: ConversationColorPalette, _ rhs: ConversationColorPalette, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(lhs.primary, rhs.primary, file: file, line: line)
        XCTAssertEqual(lhs.secondary, rhs.secondary, file: file, line: line)
        XCTAssertEqual(lhs.accent, rhs.accent, file: file, line: line)
        XCTAssertEqual(lhs.saturationBoost, rhs.saturationBoost, file: file, line: line)
    }

    func test_contexteEtModeleNePortentQuUnType() {
        XCTAssertEqual(
            ObjectIdentifier(ConversationContext.ConversationType.self),
            ObjectIdentifier(MeeshyConversation.ConversationType.self)
        )
    }

    func test_valeursBrutesInchangees() {
        XCTAssertEqual(
            MeeshyConversation.ConversationType.allCases.map(\.rawValue),
            ["direct", "group", "public", "global", "community", "channel", "bot", "broadcast"]
        )
    }

    func test_allerRetourJSONInchange() throws {
        let data = Data(#"{"type":"broadcast"}"#.utf8)
        let decoded = try JSONDecoder().decode(Wrapper.self, from: data)
        let encoded = try JSONEncoder().encode(decoded)

        XCTAssertEqual(decoded.type, .broadcast)
        XCTAssertEqual(try JSONDecoder().decode(Wrapper.self, from: encoded), decoded)
        XCTAssertEqual(String(decoding: encoded, as: UTF8.self), #"{"type":"broadcast"}"#)
    }

    func test_paletteInchangee() {
        assertSame(palette(of: .direct), reference(.direct))
        assertSame(palette(of: .group), reference(.group))
        assertSame(palette(of: .channel), reference(.channel))
        assertSame(palette(of: .bot), reference(.bot))
        [MeeshyConversation.ConversationType.public, .global, .community, .broadcast].forEach {
            assertSame(palette(of: $0), reference(.community))
        }
    }
}
