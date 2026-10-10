import Foundation
import Testing
@testable import MeeshySDK

/// Les lectures d'intégration du jeu (#9481) : les réglages servis par le serveur, et le jeu d'un AUTRE membre —
/// chaque bloc se lit seul, un refus ne se distingue pas d'un compte inconnu.
@Suite("Jeu Meeshy — lectures d'intégration")
struct GameIntegrationModelsTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    @Test("les réglages : deux interrupteurs et quatre visibilités")
    func settingsAreRead() throws {
        let settings = try decode(GameSettingsResponse.self, """
        {"gameHidden":true,"friendsLeagueOptOut":false,"visibility":{"showcase":"me","rank":"friends","treasury":"everyone","atlas":"me"}}
        """)
        #expect(settings.gameHidden)
        #expect(!settings.friendsLeagueOptOut)
        #expect(settings.visibility == GameVisibility(showcase: .me, rank: .friends, treasury: .everyone, atlas: .me))
    }

    @Test("le jeu d'un autre : niveau, palier, étoiles, Flamme, rang, division et palier du trésor")
    func aVisibleProfileIsRead() throws {
        let profile = try decode(UserGameProfileResponse.self, """
        {"visible":true,"standing":{"level":42,"tier":"eclat","prestige":2,"flame":"brasier","rank":"voix","division":2},"treasury":{"tier":"coffre"}}
        """)
        #expect(profile.visible)
        #expect(profile.standing == GameStanding(level: 42, tier: .eclat, prestige: 2, flame: .brasier, rank: .voix, division: .ii))
        #expect(profile.treasury?.tier == .coffre)
        #expect(profile.hasSomethingToShow)
    }

    @Test("le rang d'un autre lit division5 et la place du Mythe quand le serveur les sert")
    func standingReadsDivision5AndMythicSeat() throws {
        let profile = try decode(UserGameProfileResponse.self, """
        {"visible":true,"standing":{"level":42,"tier":"eclat","prestige":2,"flame":null,"rank":"voix","division":3,"division5":4},"treasury":null}
        """)
        #expect(profile.standing?.shownDivision == .iv)
        let mythic = try decode(UserGameProfileResponse.self, """
        {"visible":true,"standing":{"level":100,"tier":"galaxie","prestige":5,"flame":null,"rank":"mythe","division":null,"mythic":{"number":7,"edition":9}},"treasury":null}
        """)
        #expect(mythic.standing?.mythic == MythicSeatRef(number: 7, edition: 9))
        #expect(mythic.standing?.shownDivision == nil)
    }

    @Test("Mythe n'a pas de division, une Flamme éteinte n'a pas de forme")
    func mythAndExtinguishedFlame() throws {
        let profile = try decode(UserGameProfileResponse.self, """
        {"visible":true,"standing":{"level":100,"tier":"galaxie","prestige":5,"flame":null,"rank":"mythe","division":null},"treasury":{"tier":null}}
        """)
        #expect(profile.standing?.rank == .mythe)
        #expect(profile.standing?.division == nil)
        #expect(profile.standing?.flame == nil)
        #expect(profile.treasury?.tier == nil)
    }

    @Test("un refus rend exactement visible:false et deux blocs nuls — il ne dessine rien")
    func aRefusalShowsNothing() throws {
        let refused = try decode(UserGameProfileResponse.self, #"{"visible":false,"standing":null,"treasury":null}"#)
        #expect(refused == UserGameProfileResponse.hidden)
        #expect(!refused.hasSomethingToShow)
    }

    @Test("un palier inconnu fait tomber le niveau SEUL, le trésor reste lu")
    func anUnknownTierDropsTheStandingOnly() throws {
        let profile = try decode(UserGameProfileResponse.self, """
        {"visible":true,"standing":{"level":42,"tier":"hypernova","prestige":0,"flame":null,"rank":"voix","division":3},"treasury":{"tier":"bourse"}}
        """)
        #expect(profile.standing == nil)
        #expect(profile.treasury?.tier == .bourse)
        #expect(profile.hasSomethingToShow)
    }

    @Test("une forme de Flamme inconnue tombe seule : le niveau et le rang restent")
    func anUnknownFlameFormDropsTheFlameOnly() throws {
        let profile = try decode(UserGameProfileResponse.self, """
        {"visible":true,"standing":{"level":7,"tier":"lueur","prestige":0,"flame":"pulsar","rank":"echo","division":1},"treasury":null}
        """)
        #expect(profile.standing?.flame == nil)
        #expect(profile.standing?.level == 7)
        #expect(profile.standing?.division == .i)
    }

    @Test("un palier de trésor inconnu ne montre aucun palier, et rien à dessiner")
    func anUnknownTreasuryTierShowsNothing() throws {
        let profile = try decode(UserGameProfileResponse.self, #"{"visible":true,"standing":null,"treasury":{"tier":"abysse"}}"#)
        #expect(profile.treasury?.tier == nil)
        #expect(!profile.hasSomethingToShow)
    }

    @Test("les étoiles de Prestige restent entre 0 et 5")
    func prestigeIsClamped() throws {
        let profile = try decode(UserGameProfileResponse.self, """
        {"visible":true,"standing":{"level":1,"tier":"etincelle","prestige":9,"flame":null,"rank":"murmure","division":3},"treasury":null}
        """)
        #expect(profile.standing?.prestige == 5)
    }
}
