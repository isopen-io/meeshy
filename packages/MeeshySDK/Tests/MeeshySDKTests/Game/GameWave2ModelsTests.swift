import Foundation
import Testing
@testable import MeeshySDK

/// Les sept extensions du bloc `game` (#9384 à #9392) — chacune lue SEULE, jamais
/// à moitié lue, et un bloc sans elles reste lisible comme avant.
@Suite("Jeu Meeshy — les extensions de la vague 2 du bloc game")
struct GameWave2ModelsTests {

    /// Les extensions telles que `buildGameBlockExtras` (`packages/shared/utils/game/
    /// game-block-extras.ts`) les PRODUIT : joueur de niveau record 36, ligue jade,
    /// duo actif, saison 1, deux trophées, un tampon d'Atlas. Écrit à la main, il
    /// dériverait du contrat ; celui-ci vient du producteur.
    static let extrasJSON = """
    {"league":{"unlocked":true,"access":"open","pseudonym":"Zephyr","weekKey":"2026-10-12","closes":{"dayKey":"2026-10-18","minuteOfDay":1200},"current":{"league":"jade","groupId":"2026-10-12:jade:1","groupSize":12,"rank":4,"weekPoints":410,"zone":"promotion","cup":null,"pointsToPromotion":0},"friends":{"rank":2,"size":3,"weekPoints":410}},"duo":{"unlocked":true,"status":"active","duoId":"65a1b2c3d4e5f60718293a4b","weekKey":"2026-10-12","role":"inviter","partner":{"userId":"f1","displayName":"Ana"},"mission":{"templateKey":"duo-messages","signal":"axis:content.text_message","prism":false,"partTarget":52,"commonTarget":104},"progress":{"mine":30,"partner":52,"common":82,"commonTarget":104,"mineDone":false,"partnerDone":true,"bothDone":false},"reward":{"points":0,"doubled":false}},"season":{"number":1,"themeKey":"language:fr","startDay":"2026-10-12","endDay":"2026-12-06","week":1,"stars":18,"steps":4,"stepsTotal":40,"starsToNext":2,"progress":0.5,"completed":false,"claimedSteps":[1,2],"nextReward":{"step":3,"reward":{"kind":"points","amount":100}},"sealOwned":false,"sealPrice":10},"trophies":{"items":[{"key":"trophy.league-cup.2026-10-05.jade.gold","awardedAt":"2026-10-12T00:05:00.000Z"},{"key":"trophy.flame.100","awardedAt":"2026-10-01T10:00:00.000Z"}],"order":["trophy.flame.100","trophy.league-cup.2026-10-05.jade.gold"]},"atlas":{"stamped":1,"total":83,"stamps":[{"language":"ja","stampedOn":"2026-10-13"}],"pending":[{"language":"sw","sent":true,"received":false}]},"prestige":{"stars":0,"max":5,"canPrestige":false,"gloryOnPass":1000},"visibility":{"showcase":"friends","rank":"friends","treasury":"me","atlas":"me"}}
    """

    /// Le bloc de la vague 1 PLUS les extensions, fusionnés au premier niveau.
    private static func blockData(extras: String = extrasJSON, patch: (inout [String: Any]) -> Void = { _ in }) throws -> Data {
        var block = try #require(try JSONSerialization.jsonObject(with: GameBlockFixture.data) as? [String: Any])
        let extensions = try #require(try JSONSerialization.jsonObject(with: Data(extras.utf8)) as? [String: Any])
        block.merge(extensions) { _, new in new }
        patch(&block)
        return try JSONSerialization.data(withJSONObject: block)
    }

    @Test("les sept extensions que la passerelle sert se décodent en entier")
    func decodesEverySevenExtensions() throws {
        let block = try #require(GameBlock.parse(try Self.blockData()))

        let league = try #require(block.league)
        #expect(league.access == .open)
        #expect(league.pseudonym == "Zephyr")
        #expect(league.current?.league == .jade)
        #expect(league.current?.zone == .promotion)
        #expect(league.current?.cup == nil)
        #expect(league.current?.pointsToPromotion == 0)
        #expect(league.friends == GameLeagueBlock.Friends(rank: 2, size: 3, weekPoints: 410))
        #expect(league.closes == GameLeagueBlock.Closes(dayKey: "2026-10-18", minuteOfDay: 1200))

        let duo = try #require(block.duo)
        #expect(duo.status == .active)
        #expect(duo.role == .inviter)
        #expect(duo.partner?.displayName == "Ana")
        #expect(duo.mission?.partTarget == 52)
        #expect(duo.progress?.partnerDone == true)
        #expect(duo.reward == GameDuoBlock.Reward(points: 0, doubled: false))

        let season = try #require(block.season)
        #expect(season.number == 1)
        #expect(season.steps == 4)
        #expect(season.claimedSteps == [1, 2])
        #expect(season.nextReward == GameSeasonBlock.NextReward(step: 3, reward: .init(kind: .points, amount: 100)))

        #expect(block.trophies?.items.count == 2)
        #expect(block.trophies?.order.first == "trophy.flame.100")
        #expect(block.atlas?.stamps == [GameAtlasBlock.Stamp(language: "ja", stampedOn: "2026-10-13")])
        #expect(block.atlas?.total == GameAtlas.total)
        #expect(block.prestige == GamePrestigeBlock(stars: 0, max: 5, canPrestige: false, gloryOnPass: 1000))
        #expect(block.visibility == GameVisibility(showcase: .friends, rank: .friends, treasury: .me, atlas: .me))
    }

    @Test("un serveur antérieur ne sert aucune extension : le bloc reste lisible, les sept sont nil")
    func aBlockWithoutExtensionsStaysReadable() throws {
        let block = try #require(GameBlock.parse(GameBlockFixture.data))
        #expect(block.wave2 == .empty)
        #expect(block.league == nil && block.duo == nil && block.season == nil && block.trophies == nil)
        #expect(block.atlas == nil && block.prestige == nil && block.visibility == nil)
    }

    @Test("une extension illisible tombe SEULE : le niveau, la Flamme et les autres extensions restent")
    func anUnreadableExtensionFallsAlone() throws {
        let data = try Self.blockData { block in
            block["league"] = ["unlocked": true, "access": "ouverte-dans-le-futur"]
        }
        let block = try #require(GameBlock.parse(data), "le bloc entier ne doit pas tomber avec une extension")
        #expect(block.league == nil)
        #expect(block.level.level == 34)
        #expect(block.flame.status == .lit)
        #expect(block.duo != nil)
        #expect(block.season != nil)
    }

    @Test("une clé de ligue inconnue ne fait tomber que la ligue")
    func anUnknownLeagueKeyOnlyDropsTheLeague() throws {
        let patched = Self.extrasJSON.replacingOccurrences(of: "\"league\":\"jade\"", with: "\"league\":\"mythril\"")
        let block = try #require(GameBlock.parse(try Self.blockData(extras: patched)))
        #expect(block.league == nil)
        #expect(block.trophies != nil)
    }

    @Test("une saison nulle — aucune saison ouverte — se lit nil")
    func aNullSeasonReadsNil() throws {
        let data = try Self.blockData { $0["season"] = NSNull() }
        let block = try #require(GameBlock.parse(data))
        #expect(block.season == nil)
        #expect(block.league != nil)
    }

    @Test("le bloc et ses extensions survivent à un aller-retour par le cache")
    func roundTripsThroughTheCache() throws {
        let block = try #require(GameBlock.parse(try Self.blockData()))
        let again = try JSONDecoder().decode(GameBlock.self, from: JSONEncoder().encode(block))
        #expect(again == block)
        #expect(again.league?.pseudonym == "Zephyr")
    }

    @Test("l'écriture du consentement porte son requestId et n'envoie un pseudonyme que s'il est choisi")
    func consentRequestEncoding() throws {
        let plain = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(LeagueConsentRequest(requestId: "req-12345678", consent: true))) as? [String: Any]
        #expect(plain?["requestId"] as? String == "req-12345678")
        #expect(plain?["consent"] as? Bool == true)
        #expect(plain?["pseudonym"] == nil)

        let chosen = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(LeagueConsentRequest(requestId: "req-12345678", consent: true, pseudonym: "Zephyr"))) as? [String: Any]
        #expect(chosen?["pseudonym"] as? String == "Zephyr")
    }

    @Test("la visibilité n'envoie que les réglages qu'on change")
    func visibilityRequestOnlyCarriesWhatChanged() throws {
        let object = try #require(try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(ShowcaseVisibilityRequest(requestId: "req-12345678", atlas: .friends))) as? [String: Any])
        #expect(object["atlas"] as? String == "friends")
        #expect(object["showcase"] == nil && object["rank"] == nil && object["treasury"] == nil)
    }

    @Test("la vitrine d'un visiteur : un mois et un compte, jamais une date")
    func visitorShowcaseCarriesAMonth() throws {
        let json = """
        {"visible":true,"items":[{"key":"trophy.league-cup.2026-10.jade.gold","awardedMonth":"2026-10","count":2},{"key":"trophy.flame.100","awardedMonth":"2026-09"}],"order":["trophy.flame.100"]}
        """
        let response = try JSONDecoder().decode(UserShowcaseResponse.self, from: Data(json.utf8))
        #expect(response.visible)
        #expect(response.items[0].count == 2)
        #expect(response.items[1].count == nil)
        #expect(response.items.map(\.awardedMonth) == ["2026-10", "2026-09"])
    }

    @Test("un statut d'écriture inconnu ne fait pas échouer une écriture déjà faite")
    func aNewStatusDoesNotBreakADoneWrite() throws {
        let json = #"{"status":"already-claimed","step":5,"reward":{"kind":"fragment","amount":1},"seal":null,"completed":false,"gloryGained":0,"score":120}"#
        let response = try JSONDecoder().decode(SeasonClaimResponse.self, from: Data(json.utf8))
        #expect(response.alreadyDone)
        #expect(response.reward.kind == .fragment)
    }

    @Test("la rareté mesurée se lit entrée par entrée : une valeur illisible tombe seule, et rien ne se montre sous les seuils")
    func rarityMapIsReadEntryByEntry() throws {
        let data = try Self.blockData { block in
            block["achievementRarities"] = [
                "achievement.first_content": ["rarity": "epic", "holders": 4000, "population": 100_000],
                "achievement.editor": ["rarity": "mythic", "holders": 2, "population": 100_000],
                "achievement.first_voice": ["rarity": "inconnue-de-ce-client", "holders": 9, "population": 100],
                "achievement.three_conversation_kinds": ["rarity": NSNull(), "holders": 1, "population": 500],
            ]
        }
        let block = try #require(GameBlock.parse(data))
        let map = try #require(block.wave2.achievementRarities)
        #expect(map.count == 2, "une rareté inconnue ou nulle tombe seule : le contrat déclare une rareté, toujours")
        #expect(map["achievement.first_voice"] == nil)
        #expect(map["achievement.first_content"]?.visibleRarity == .epic)
        #expect(map["achievement.editor"]?.rarity == .mythic)
        #expect(map["achievement.editor"]?.visibleRarity == nil, "2 titulaires : fail-closed, jamais « mythique »")
        #expect(map["achievement.three_conversation_kinds"] == nil, "rareté nulle : jamais servie par un serveur à jour, jamais montrée")
        #expect(map["achievement.first_content"]?.sharePercent == 4)
    }

    @Test("sans carte de raretés, le bloc reste lisible et la carte est nil")
    func rarityMapIsOptional() throws {
        let block = try #require(GameBlock.parse(try Self.blockData()))
        #expect(block.wave2.achievementRarities == nil)
    }
}
