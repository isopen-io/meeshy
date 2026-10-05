import Testing
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

/// Les shaders du jeu (#9381) : la ressource Metal est COMPILÉE dans le module et
/// porte ses trois fonctions ; les modificateurs ne posent aucun effet hors de
/// leur temps ; les replis iOS 16 peignent.
@MainActor
@Suite("Jeu Meeshy — shaders Metal et replis")
struct GameShadersTests {

    private func coin() -> some View {
        MeeshCoinView(face: .obverse, edition: .gold, figures: nil).frame(width: 120, height: 120)
    }

    private func render<V: View>(_ view: V) throws -> GameRenderProbe {
        try #require(GameRenderProbe.render(view))
    }

    @Test("default.metallib est dans le bundle du module et porte les trois fonctions stitchables")
    func metallibCarriesTheThreeFunctions() throws {
        let url = try #require(GameShaders.metallibURL, "default.metallib absent : le .metal n'a pas été compilé en ressource")
        let bytes = try Data(contentsOf: url)
        #expect(bytes.count > 1000)
        for name in GameShaders.functionNames {
            #expect(bytes.range(of: Data(name.utf8)) != nil, "la fonction \(name) manque à default.metallib")
        }
    }

    @Test("le reflet hors de son temps ne change rien, ni à 0 ni à 1 ni sans intensité")
    func sheenAtRestIsIdentity() throws {
        let plain = try render(coin())
        #expect(try render(coin().gameSpecularSheen(progress: 0)).distance(to: plain) == 0)
        #expect(try render(coin().gameSpecularSheen(progress: 1)).distance(to: plain) == 0)
        #expect(try render(coin().gameSpecularSheen(progress: 0.5, intensity: 0)).distance(to: plain) == 0)
    }

    @Test("l'onde hors de son temps ne change rien")
    func waveAtRestIsIdentity() throws {
        let plain = try render(coin())
        #expect(try render(coin().gameStrikeWave(progress: 0)).distance(to: plain) == 0)
        #expect(try render(coin().gameStrikeWave(progress: 1)).distance(to: plain) == 0)
        #expect(try render(coin().gameStrikeWave(progress: 0.5, amplitude: 0)).distance(to: plain) == 0)
    }

    @Test("l'irisation sans intensité ne change rien")
    func iridescenceWithoutIntensityIsIdentity() throws {
        let plain = try render(coin())
        #expect(try render(coin().gamePrismIridescence(tilt: 0.3, intensity: 0)).distance(to: plain) == 0)
    }

    @Test("les intensités et amplitudes hors bornes sont ramenées dans leurs bornes")
    func outOfRangeInputsAreClamped() throws {
        let plain = try render(coin())
        #expect(try render(coin().gameSpecularSheen(progress: 0.5, intensity: -3)).distance(to: plain) == 0)
        #expect(try render(coin().gameStrikeWave(progress: 0.5, amplitude: -4)).distance(to: plain) == 0)
    }

    @Test("le temps d'un effet est l'intervalle ouvert ]0, 1[")
    func activeWindow() {
        #expect(!GameShaders.isActive(0))
        #expect(GameShaders.isActive(0.01))
        #expect(GameShaders.isActive(0.99))
        #expect(!GameShaders.isActive(1))
        #expect(!GameShaders.isActive(-0.2))
    }

    @Test("le repli du reflet peint une bande, et le repli de l'onde un anneau")
    func fallbacksPaint() throws {
        let band = try render(SheenBand(progress: 0.5, intensity: 1).background(Color.black))
        let flat = try render(Color.black)
        #expect(band.distance(to: flat) > 0.1)
        let ring = try render(StrikeRing(progress: 0.5, center: .center).background(Color.black))
        #expect(ring.distance(to: flat) > 0.05)
    }

    @Test("le repli de l'irisation teinte la matière, et glisse avec l'inclinaison")
    func iridescenceFallbackTints() throws {
        let still = try render(IridescentSheet(tilt: 0, intensity: 1).background(Color.gray))
        let tilted = try render(IridescentSheet(tilt: 0.4, intensity: 1).background(Color.gray))
        let flat = try render(Color.gray)
        #expect(still.distance(to: flat) > 0.5)
        #expect(still.distance(to: tilted) > 0.5)
    }
}
