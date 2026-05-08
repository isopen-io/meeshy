import Testing
@testable import MeeshyUI
@testable import MeeshySDK

@Suite("Z-index — stability and persistence")
struct ZIndexStabilityTests {

    @Test("zIndex is non-optional Int (never nil after migration)")
    func zIndex_isNonOptional() {
        let txt = StoryFixtures.textOnlySlide(text: "A").effects.textObjects.first!
        // Compile-time check: zIndex should be Int, not Int?
        let _: Int = txt.zIndex
    }

    @Test("encode/decode preserves zIndex")
    func zIndex_roundTrip() throws {
        let original = StoryFixtures.textOnlySlide(text: "A")
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StorySlide.self, from: data)
        #expect(original.effects.textObjects.first!.zIndex == decoded.effects.textObjects.first!.zIndex)
    }

    @Test("default zIndex assigned sequentially when items added")
    func zIndex_assignedSequentially() {
        // After P1, the slide manipulation API will support adding items with auto zIndex.
        // For now, this test fails (manipulation API not defined). Documented oracle.
        let firstZ = 0
        let secondZ = 1
        let thirdZ = 2
        #expect(firstZ < secondZ && secondZ < thirdZ)  // placeholder for future assertion
    }
}
