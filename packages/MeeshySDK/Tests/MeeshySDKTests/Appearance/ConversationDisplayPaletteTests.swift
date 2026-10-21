import Foundation
import Testing
@testable import MeeshySDK

@Suite("MeeshyConversation.displayPalette — l'accent personnel (#10631, spec § 8.3)")
struct ConversationDisplayPaletteTests {

    private func makeConversation(accent: String?) -> MeeshyConversation {
        var state = ConversationUserState()
        if let accent { state.appearance = ConversationAppearance(accent: accent) }
        return MeeshyConversation(
            id: "507f1f77bcf86cd799439011", identifier: "demo", type: .group, title: "Demo",
            userState: state
        )
    }

    @Test("sans accent personnel, la palette d'affichage EST la palette calculée")
    func displayPaletteEqualsComputedWithoutPersonalAccent() {
        let conversation = makeConversation(accent: nil)
        #expect(conversation.displayPalette(scheme: .light) == conversation.colorPalette)
        #expect(conversation.displayPalette(scheme: .dark) == conversation.colorPalette)
    }

    @Test("un accent de la gamme devient la primaire du schéma, secondaire +30° et accent -30°")
    func personalAccentDrivesThePalette() {
        let conversation = makeConversation(accent: "corail")
        let light = conversation.displayPalette(scheme: .light)
        let dark = conversation.displayPalette(scheme: .dark)
        #expect(light.primary == "E0604E")
        #expect(dark.primary == "F38B7B")
        #expect(light.secondary == DynamicColorGenerator.hueShiftedHex("E0604E", degrees: 30))
        #expect(light.accent == DynamicColorGenerator.hueShiftedHex("E0604E", degrees: -30))
        #expect(dark.secondary == DynamicColorGenerator.hueShiftedHex("F38B7B", degrees: 30))
    }

    @Test("accentColor suit la primaire d'affichage")
    func accentColorFollowsDisplayPrimary() {
        let conversation = makeConversation(accent: "corail")
        #expect(conversation.accentColor == conversation.displayPalette(scheme: AppearanceScheme.current).primary)
    }

    @Test("la palette calculée stockée est encodée et décodée inchangée : le cache GRDB reste compatible")
    func storedPaletteRoundTripsUnchanged() throws {
        let conversation = makeConversation(accent: "corail")
        let decoded = try JSONDecoder().decode(MeeshyConversation.self, from: JSONEncoder().encode(conversation))
        #expect(decoded.colorPalette == conversation.colorPalette)
        #expect(decoded.colorPalette.primary != "E0604E")
    }

    @Test("changer l'accent de l'état utilisateur met la palette d'affichage à jour sans relecture réseau")
    func changingAccentUpdatesWithoutNetwork() {
        var conversation = makeConversation(accent: nil)
        let before = conversation.displayPalette(scheme: .light)
        conversation.userState.appearance = ConversationAppearance(accent: "corail")
        #expect(conversation.displayPalette(scheme: .light).primary == "E0604E")
        #expect(before.primary != "E0604E")
    }

    @Test("l'accent personnel entre dans l'empreinte de rendu : la cellule Equatable se redessine")
    func accentEntersRenderFingerprint() {
        #expect(makeConversation(accent: nil).renderFingerprint != makeConversation(accent: "corail").renderFingerprint)
    }
}
