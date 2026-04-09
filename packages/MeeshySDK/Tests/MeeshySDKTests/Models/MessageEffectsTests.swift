import XCTest
@testable import MeeshySDK

final class MessageEffectsTests: XCTestCase {

    // MARK: - MessageEffectFlags Bit Values

    func test_messageEffectFlags_lifecycleBits() {
        XCTAssertEqual(MessageEffectFlags.ephemeral.rawValue, 1 << 0)
        XCTAssertEqual(MessageEffectFlags.blurred.rawValue, 1 << 1)
        XCTAssertEqual(MessageEffectFlags.viewOnce.rawValue, 1 << 2)
    }

    func test_messageEffectFlags_appearanceBits() {
        XCTAssertEqual(MessageEffectFlags.shake.rawValue, 1 << 8)
        XCTAssertEqual(MessageEffectFlags.zoom.rawValue, 1 << 9)
        XCTAssertEqual(MessageEffectFlags.explode.rawValue, 1 << 10)
        XCTAssertEqual(MessageEffectFlags.confetti.rawValue, 1 << 11)
        XCTAssertEqual(MessageEffectFlags.fireworks.rawValue, 1 << 12)
        XCTAssertEqual(MessageEffectFlags.waoo.rawValue, 1 << 13)
    }

    func test_messageEffectFlags_persistentBits() {
        XCTAssertEqual(MessageEffectFlags.glow.rawValue, 1 << 16)
        XCTAssertEqual(MessageEffectFlags.pulse.rawValue, 1 << 17)
        XCTAssertEqual(MessageEffectFlags.rainbow.rawValue, 1 << 18)
        XCTAssertEqual(MessageEffectFlags.sparkle.rawValue, 1 << 19)
    }

    // MARK: - MessageEffectFlags Masks

    func test_messageEffectFlags_lifecycleMask() {
        let flags: MessageEffectFlags = [.ephemeral, .blurred]
        XCTAssertTrue(flags.hasLifecycleEffect)
        XCTAssertFalse(flags.hasAppearanceEffect)
        XCTAssertFalse(flags.hasPersistentEffect)
        XCTAssertTrue(flags.hasAnyEffect)
    }

    func test_messageEffectFlags_appearanceMask() {
        let flags: MessageEffectFlags = [.confetti]
        XCTAssertFalse(flags.hasLifecycleEffect)
        XCTAssertTrue(flags.hasAppearanceEffect)
        XCTAssertFalse(flags.hasPersistentEffect)
    }

    func test_messageEffectFlags_persistentMask() {
        let flags: MessageEffectFlags = [.rainbow, .sparkle]
        XCTAssertFalse(flags.hasLifecycleEffect)
        XCTAssertFalse(flags.hasAppearanceEffect)
        XCTAssertTrue(flags.hasPersistentEffect)
    }

    func test_messageEffectFlags_emptyHasNoEffect() {
        let flags = MessageEffectFlags()
        XCTAssertFalse(flags.hasAnyEffect)
        XCTAssertFalse(flags.hasLifecycleEffect)
        XCTAssertFalse(flags.hasAppearanceEffect)
        XCTAssertFalse(flags.hasPersistentEffect)
    }

    func test_messageEffectFlags_combinedAcrossAxes() {
        let flags: MessageEffectFlags = [.ephemeral, .shake, .glow]
        XCTAssertTrue(flags.hasLifecycleEffect)
        XCTAssertTrue(flags.hasAppearanceEffect)
        XCTAssertTrue(flags.hasPersistentEffect)
    }

    // MARK: - MessageEffectFlags Codable

    func test_messageEffectFlags_encodesAndDecodesRoundTrip() throws {
        let flags: MessageEffectFlags = [.blurred, .confetti, .sparkle]
        let data = try JSONEncoder().encode(flags)
        let decoded = try JSONDecoder().decode(MessageEffectFlags.self, from: data)
        XCTAssertEqual(decoded, flags)
        XCTAssertTrue(decoded.hasLifecycleEffect)
        XCTAssertTrue(decoded.hasAppearanceEffect)
        XCTAssertTrue(decoded.hasPersistentEffect)
    }

    func test_messageEffectFlags_decodesFromRawInteger() throws {
        let rawValue: UInt32 = (1 << 0) | (1 << 8)
        let json = "\(rawValue)".data(using: .utf8)!
        let flags = try JSONDecoder().decode(MessageEffectFlags.self, from: json)
        XCTAssertTrue(flags.contains(.ephemeral))
        XCTAssertTrue(flags.contains(.shake))
        XCTAssertFalse(flags.contains(.blurred))
    }

    // MARK: - ExplodeStyle

    func test_explodeStyle_allCases() {
        let cases = ExplodeStyle.allCases
        XCTAssertEqual(cases.count, 3)
        XCTAssertTrue(cases.contains(.burst))
        XCTAssertTrue(cases.contains(.shatter))
        XCTAssertTrue(cases.contains(.dissolve))
    }

    func test_explodeStyle_rawValues() {
        XCTAssertEqual(ExplodeStyle.burst.rawValue, "burst")
        XCTAssertEqual(ExplodeStyle.shatter.rawValue, "shatter")
        XCTAssertEqual(ExplodeStyle.dissolve.rawValue, "dissolve")
    }

    func test_explodeStyle_decodesFromJSON() throws {
        let json = "\"shatter\"".data(using: .utf8)!
        let style = try JSONDecoder().decode(ExplodeStyle.self, from: json)
        XCTAssertEqual(style, .shatter)
    }

    func test_explodeStyle_encodesToJSON() throws {
        let data = try JSONEncoder().encode(ExplodeStyle.dissolve)
        let string = String(data: data, encoding: .utf8)
        XCTAssertEqual(string, "\"dissolve\"")
    }

    // MARK: - MessageEffects

    func test_messageEffects_decodesFullPayload() throws {
        let json = """
        {
            "flags": 786435,
            "ephemeralDuration": 30,
            "maxViewOnceCount": 1,
            "blurRevealDuration": 5.0,
            "zoomScale": 2.5,
            "explodeStyle": "burst",
            "glowIntensity": 0.8,
            "pulseFrequency": 1.5,
            "rainbowColors": ["#FF0000", "#00FF00", "#0000FF"],
            "sparkleIntensity": 0.6
        }
        """.data(using: .utf8)!

        let effects = try JSONDecoder().decode(MessageEffects.self, from: json)
        XCTAssertTrue(effects.hasAnyEffect)
        XCTAssertEqual(effects.ephemeralDuration, 30)
        XCTAssertEqual(effects.maxViewOnceCount, 1)
        XCTAssertEqual(effects.blurRevealDuration, 5.0, accuracy: 0.001)
        XCTAssertEqual(effects.zoomScale, 2.5, accuracy: 0.001)
        XCTAssertEqual(effects.explodeStyle, .burst)
        XCTAssertEqual(effects.glowIntensity, 0.8, accuracy: 0.001)
        XCTAssertEqual(effects.pulseFrequency, 1.5, accuracy: 0.001)
        XCTAssertEqual(effects.rainbowColors, ["#FF0000", "#00FF00", "#0000FF"])
        XCTAssertEqual(effects.sparkleIntensity, 0.6, accuracy: 0.001)
    }

    func test_messageEffects_decodesWithOnlyFlags() throws {
        let json = """
        { "flags": 0 }
        """.data(using: .utf8)!

        let effects = try JSONDecoder().decode(MessageEffects.self, from: json)
        XCTAssertFalse(effects.hasAnyEffect)
        XCTAssertNil(effects.ephemeralDuration)
        XCTAssertNil(effects.maxViewOnceCount)
        XCTAssertNil(effects.explodeStyle)
        XCTAssertNil(effects.rainbowColors)
    }

    func test_messageEffects_noneStaticProperty() {
        let none = MessageEffects.none
        XCTAssertFalse(none.hasAnyEffect)
        XCTAssertEqual(none.flags.rawValue, 0)
    }

    func test_messageEffects_encodesAndDecodesRoundTrip() throws {
        var effects = MessageEffects(
            flags: [.viewOnce, .zoom, .glow],
            maxViewOnceCount: 3,
            zoomScale: 1.5,
            glowIntensity: 0.9
        )
        effects.rainbowColors = nil

        let data = try JSONEncoder().encode(effects)
        let decoded = try JSONDecoder().decode(MessageEffects.self, from: data)
        XCTAssertEqual(decoded.flags, effects.flags)
        XCTAssertEqual(decoded.maxViewOnceCount, 3)
        XCTAssertEqual(decoded.zoomScale, 1.5, accuracy: 0.001)
        XCTAssertEqual(decoded.glowIntensity, 0.9, accuracy: 0.001)
        XCTAssertNil(decoded.rainbowColors)
    }

    // MARK: - Hashable

    func test_messageEffectFlags_hashable() {
        let flags1: MessageEffectFlags = [.ephemeral, .shake]
        let flags2: MessageEffectFlags = [.ephemeral, .shake]
        let flags3: MessageEffectFlags = [.blurred]
        XCTAssertEqual(flags1, flags2)
        XCTAssertNotEqual(flags1, flags3)

        var set = Set<MessageEffectFlags>()
        set.insert(flags1)
        set.insert(flags2)
        XCTAssertEqual(set.count, 1)
    }
}
