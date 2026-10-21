import Foundation
import Testing
@testable import MeeshySDK

/// LA CONSTELLATION (#10053) — miroir de `packages/shared/utils/game/constellation.ts`, rejoué aussi sur les
/// vecteurs partagés (`constellation`, `constellation-key`, `league-next-close`).
@Suite("Jeu Meeshy — la constellation")
struct GameConstellationTests {

    @Test("une étoile tous les dix fragments, l'étoile suivante, un cosmétique par étoile")
    func law() {
        let shape = GameConstellation.of(collected: 23)
        #expect(shape.stars == 2)
        #expect(shape.inStar == 3)
        #expect(shape.toNextStar == 7)
        #expect(shape.cosmetics.map(\.cosmeticKey) == ["constellation.star-1.halo", "constellation.star-2.frame"])
        #expect(GameConstellation.of(collected: -4) == GameConstellation.of(collected: 0))
        #expect(GameConstellation.starCosmetic(3)?.kind == .sparkle)
        #expect(GameConstellation.starCosmetic(0) == nil)
        #expect(GameConstellation.isCosmeticKey("constellation.star-4.halo"))
        #expect(!GameConstellation.isCosmeticKey("constellation.star-4.frame"))
    }

    @Test("la prochaine fermeture de semaine, strictement après le moment (#10225)")
    func nextClose() {
        #expect(GameLeague.nextWeekClose(after: LeagueMoment(dayKey: "2026-12-20", minuteOfDay: 1199))
                == LeagueMoment(dayKey: "2026-12-20", minuteOfDay: 1200))
        #expect(GameLeague.nextWeekClose(after: LeagueMoment(dayKey: "2026-12-20", minuteOfDay: 1200))
                == LeagueMoment(dayKey: "2026-12-27", minuteOfDay: 1200))
    }

    @Test("la vitrine d'un autre décode sa constellation ; un ancien serveur n'en sert pas")
    func showcaseDecodes() throws {
        let served = try JSONDecoder().decode(UserShowcaseResponse.self, from: Data(#"{"visible":true,"items":[],"order":[],"constellation":{"stars":3}}"#.utf8))
        #expect(served.constellation?.stars == 3)
        let old = try JSONDecoder().decode(UserShowcaseResponse.self, from: Data(#"{"visible":true,"items":[],"order":[]}"#.utf8))
        #expect(old.constellation == nil)
    }
}
