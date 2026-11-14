import Testing
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

/// La combustion d'un éphémère (#17938) : ce que l'allumage fige, ce que la
/// vue rend hors combustion (rien ne change), ce que le repli rend en
/// combustion (plus rien), et l'atome du vent.
@MainActor
@Suite("Combustion d'un éphémère — le modificateur")
struct EphemeralBurnEffectTests {

    private static let noise = 0.05

    private func bubble() -> some View {
        Text("Bonjour")
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 16).fill(Color.blue))
            .frame(width: 120, height: 60)
    }

    private func render<V: View>(_ view: V) throws -> GameRenderProbe {
        try #require(GameRenderProbe.render(view, width: 120, height: 60))
    }

    @Test("l'allumage fige le sens du front d'après le vent et le côté, et garde la graine")
    func ignitionFreezesFrontDirection() {
        #expect(EphemeralBurnIgnition.ignite(rawWind: nil, side: .mine, seed: 0.3).frontDirection == 1)
        #expect(EphemeralBurnIgnition.ignite(rawWind: nil, side: .theirs, seed: 0.3).frontDirection == -1)
        #expect(EphemeralBurnIgnition.ignite(rawWind: -0.5, side: .mine, seed: 0.3).frontDirection == -1)
        #expect(EphemeralBurnIgnition.ignite(rawWind: 0.2, side: .theirs, seed: 0.3).frontDirection == 1)
        #expect(EphemeralBurnIgnition.ignite(rawWind: nil, side: .mine, seed: 0.3).seed == 0.3)
    }

    @Test("un message qui ne brûle pas ne change pas d'un pixel")
    func notBurningIsIdentity() throws {
        let plain = try render(bubble())
        #expect(try render(bubble().ephemeralBurn(isBurning: false)).distance(to: plain) < Self.noise)
        #expect(try render(bubble().ephemeralBurn(isBurning: false, side: .mine)).distance(to: plain) < Self.noise)
    }

    /// Mesuré sur fond NOIR : `ImageRenderer` rend une vue qui ne peint rien
    /// avec les octets périmés d'un rendu précédent (voir `GameRenderProbe.ink`),
    /// donc « plus rien » se lit comme « pareil que le fond », jamais comme une
    /// couverture nulle.
    @Test("le repli en combustion efface la bulle, avec ou sans « Réduire les animations »")
    func fallbackBurnsAway() throws {
        let black = try render(Color.black)
        let intact = try render(bubble().modifier(EphemeralBurnFallback(isBurning: false, reduceMotion: false)).background(Color.black))
        #expect(intact.distance(to: black) > 0.1)
        // Sous Reduce Motion : un fondu, et rien d'autre — plus rien ne se voit.
        let faded = try render(bubble().modifier(EphemeralBurnFallback(isBurning: true, reduceMotion: true)).background(Color.black))
        #expect(faded.distance(to: black) < Self.noise)
        // Avec mouvement : la bulle est partie, mais la braise reste posée à sa
        // place jusqu'au retrait de la ligne par l'hôte — ce n'est plus la bulle.
        let burnt = try render(bubble().modifier(EphemeralBurnFallback(isBurning: true, reduceMotion: false)).background(Color.black))
        #expect(burnt.distance(to: intact) > 0.1)
    }

    @Test("l'atome du vent porte une valeur brute, et l'environnement n'en a pas par défaut")
    func windAtom() {
        let wind = EphemeralBurnWind(raw: 0.4)
        #expect(wind.raw == 0.4)
        wind.raw = nil
        #expect(wind.raw == nil)
        #expect(EnvironmentValues().ephemeralBurnWind == nil)
    }
}
