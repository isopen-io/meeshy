import Testing
import Foundation
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

/// LA MEESH, UNE SEULE PIÈCE (épopée § 6, #11176) : iOS rejoue `packages/shared/design/meesh-coin.json`, le fichier que
/// le web lit. Ce témoin DÉCODE le fichier partagé et exige la même valeur, puis compare les formes calculées à des
/// valeurs relevées sur le web (`apps/web/src/lib/game/coin-geometry.ts`) : une coordonnée, une formule ou un arrondi
/// changé d'un seul côté le rougit.
@MainActor
@Suite("Jeu Meeshy — la Meesh rejoue la géométrie partagée avec le web")
struct MeeshCoinGeometryTests {

    private typealias P = MeeshCoinLayout.Point

    private static func sharedFile() throws -> Data {
        let packages = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return try Data(contentsOf: packages.appendingPathComponent("shared/design/meesh-coin.json"))
    }

    private func near(_ lhs: P, _ rhs: P) -> Bool {
        abs(lhs.x - rhs.x) < 0.0011 && abs(lhs.y - rhs.y) < 0.0011
    }

    @Test("la géométrie d'iOS est celle du fichier partagé, champ pour champ")
    func theGeometryIsTheSharedFile() throws {
        let decoded = try JSONDecoder().decode(MeeshCoinGeometry.self, from: Self.sharedFile())
        #expect(decoded == MeeshCoinGeometry.shared)
    }

    @Test("la couronne de l'avers est UNIVERSELLE : « MEESHY · 1 MEESH », deux fois, jamais traduite")
    func theInscriptionIsUniversal() {
        let layout = MeeshCoinLayout.inscription()
        #expect(String(layout.map(\.glyph)) == "MEESHY·1MEESH·MEESHY·1MEESH·")
        #expect(layout.filter(\.isSeparator).count == 4)
        #expect(layout.first.map { near($0.point, P(x: 15, y: 60)) && $0.rotate == 270 } == true)
        #expect(near(layout[1].point, P(x: 15.614, y: 52.593)) && abs(layout[1].rotate - 279.474) < 0.0011)
        #expect(layout[6].index == 7 && near(layout[6].point, P(x: 41.924, y: 18.79)))
        #expect(layout.last.map { $0.index == 36 && near($0.point, P(x: 17.438, y: 74.611)) } == true)
    }

    @Test("le revers porte l'oiseau de son édition : Mee (argent), Meo (or), Mee et Meo face à face (prisme)")
    func eachEditionCarriesItsBirds() {
        let geometry = MeeshCoinGeometry.shared
        #expect(geometry.edition(.silver).birds.map(\.bird) == [.meeJoy])
        #expect(geometry.edition(.gold).birds.map(\.bird) == [.meoOpen])
        #expect(geometry.edition(.prism).birds.map(\.bird) == [.meeJoy, .meoOpen])
        #expect(geometry.edition(.prism).birds.map(\.flip) == [false, true])
    }

    @Test("les décors : argent sobre, or raffiné, prisme royal")
    func eachEditionCarriesItsDecor() {
        let geometry = MeeshCoinGeometry.shared
        #expect(geometry.edition(.silver).decor.obverse == [.veins])
        #expect(geometry.edition(.gold).separator == .star)
        #expect(geometry.edition(.gold).decor.reverse.contains(.laurels))
        #expect(geometry.edition(.gold).field == .coinGoldIn, "l'or est PUR, centre compris")
        #expect(geometry.edition(.prism).decor.reverse.contains(.crown))
        #expect(geometry.edition(.prism).flute == .iris)
    }

    @Test("le grènetis, les cabochons, la rosace et le soleil tombent aux points du web")
    func theBorderAndFieldDecorMatchTheWeb() throws {
        let prismBeads = MeeshCoinLayout.beads(MeeshCoinGeometry.shared.decor.beads.prism[0])
        #expect(near(prismBeads[1], P(x: 109.328, y: 65.185)))

        let cabochons = MeeshCoinLayout.cabochons()
        #expect(cabochons.count == 8)
        let first = try #require(cabochons.first)
        #expect(near(first.center, P(x: 108.966, y: 80.282)))
        #expect(near(first.outer[0], P(x: 110.734, y: 82.05)) && near(first.outer[7], P(x: 111.466, y: 80.282)))
        #expect(near(first.table[0], P(x: 109.85, y: 81.166)))

        #expect(near(MeeshCoinLayout.rosetteCenters()[1], P(x: 72.557, y: 63.365)))

        let rays = MeeshCoinLayout.sunburst(fieldRadius: 45)
        #expect(rays.count == 64)
        #expect(near(rays[0].from, P(x: 64, y: 60)) && near(rays[0].to, P(x: 103, y: 60)))
        #expect(near(rays[1].from, P(x: 63.981, y: 60.392)) && near(rays[1].to, P(x: 92.702, y: 63.221)))
    }

    @Test("les étoiles de l'or, les éclats du prisme et les lauriers tombent aux points du web")
    func theStarsSparklesAndLaurelsMatchTheWeb() {
        let separator = MeeshCoinLayout.inscription()[6]
        let star = MeeshCoinLayout.star(at: separator)
        #expect(star.count == 10)
        #expect(near(star[0], P(x: 41.08, y: 16.867)) && near(star[9], P(x: 41.19, y: 18.361)))

        let sparkle = MeeshCoinLayout.sparkle(MeeshCoinGeometry.shared.decor.sparkles.points[1])
        #expect(near(sparkle[0], P(x: 82, y: 27.4)) && near(sparkle[1], P(x: 82.572, y: 29.428)))
        #expect(near(sparkle[6], P(x: 79.4, y: 30)))

        let leaf = MeeshCoinLayout.leaf(MeeshCoinGeometry.shared.decor.laurels.leaves[0])
        #expect(near(leaf.outerControl, P(x: 39.902, y: 98.501)))
        #expect(near(leaf.tip, P(x: 37.314, y: 97.875)))
        #expect(near(leaf.innerControl, P(x: 38.842, y: 95.694)))
    }

    @Test("les éclats scintillent comme `gameTwinkle` : petits et pâles au repos, pleins au milieu")
    func theSparklesTwinkleLikeTheWeb() {
        let rest = MeeshCoinPainter.twinkle(at: 0)
        let peak = MeeshCoinPainter.twinkle(at: 1.2)
        #expect(abs(rest.scale - 0.6) < 0.001 && abs(rest.opacity - 0.35) < 0.001)
        #expect(abs(peak.scale - 1.15) < 0.001 && abs(peak.opacity - 1) < 0.001)
        #expect(abs(MeeshCoinPainter.twinkle(at: -1.2).scale - 1.15) < 0.001, "un délai négatif reste dans la période")
    }
}
