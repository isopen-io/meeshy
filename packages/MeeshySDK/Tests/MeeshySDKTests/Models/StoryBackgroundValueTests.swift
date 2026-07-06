import Testing
@testable import MeeshySDK

@Suite("StoryBackgroundValue — format sérialisé du fond (C11)")
struct StoryBackgroundValueTests {

    @Test("hex simple")
    func plainHex() {
        #expect(StoryBackgroundValue.parse("FF2E63") == .hex("FF2E63"))
    }

    @Test("gradient bien formé")
    func wellFormedGradient() {
        #expect(StoryBackgroundValue.parse("gradient:FF2E63:08D9D6")
                == .gradient("FF2E63", "08D9D6"))
    }

    @Test("roundtrip serialize/parse")
    func roundtrip() {
        let g = StoryBackgroundValue.gradient("9B59B6", "FF6B6B")
        #expect(StoryBackgroundValue.parse(g.serialized) == g)
        let h = StoryBackgroundValue.hex("1E1B4B")
        #expect(StoryBackgroundValue.parse(h.serialized) == h)
    }

    @Test("gradient mal formé → hex tolérant (fallback renderer historique)")
    func malformedFallsBackToHex() {
        #expect(StoryBackgroundValue.parse("gradient:ZZZ") == .hex("gradient:ZZZ"))
        #expect(StoryBackgroundValue.parse("gradient:FF2E63") == .hex("gradient:FF2E63"))
        #expect(StoryBackgroundValue.parse("gradient:FF2E63:08D9D6:EXTRA")
                == .hex("gradient:FF2E63:08D9D6:EXTRA"))
    }

    @Test("le format gradient tient sous les caps serveur")
    func fitsServerCaps() {
        #expect(StoryBackgroundValue.gradient("AABBCC", "DDEEFF").serialized.count <= 64)
    }
}
