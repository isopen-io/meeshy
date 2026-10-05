import Foundation
import Testing
@testable import MeeshySDK

/// Le bloc `game` à côté des champs actuels de `GET /me/engagement` (#9378) :
/// un ancien serveur ne le sert pas, un bloc incompris ne coûte pas la charge.
@Suite("Jeu Meeshy — le bloc game dans la charge d'engagement")
struct EngagementGameBlockTests {

    private static let legacyPayload = """
    "counters":[{"axisKey":"content.text_message","count":12}],
    "milestones":[],
    "streak":{"currentStreakDays":1,"longestStreakDays":1},
    "level":{"engagementScore":36}
    """

    private static func payload(game: String?) -> Data {
        let extra = game.map { ",\"game\":\($0)" } ?? ""
        return Data("{\(legacyPayload)\(extra)}".utf8)
    }

    @Test("une passerelle antérieure ne sert pas le bloc : la charge se décode, game est nil")
    func legacyGatewayHasNoGame() throws {
        let decoded = try JSONDecoder().decode(APIEngagementProgress.self, from: Self.payload(game: nil))
        #expect(decoded.game == nil)
        #expect(decoded.level.engagementScore == 36)
    }

    @Test("le bloc servi se lit à côté des champs actuels")
    func servedBlockIsRead() throws {
        let decoded = try JSONDecoder().decode(APIEngagementProgress.self, from: Self.payload(game: GameBlockFixture.json))
        #expect(decoded.game?.level.level == 34)
        #expect(decoded.counters.first?.count == 12)
    }

    @Test("un bloc incompris ne coûte pas la progression : game est nil, le reste se lit")
    func misunderstoodBlockKeepsTheRest() throws {
        let broken = GameBlockFixture.json.replacingOccurrences(of: "\"tier\":\"eclat\"", with: "\"tier\":\"nebuleuse\"")
        let decoded = try JSONDecoder().decode(APIEngagementProgress.self, from: Self.payload(game: broken))
        #expect(decoded.game == nil)
        #expect(decoded.level.engagementScore == 36)
        #expect(decoded.counters.count == 1)
    }

    @Test("un bloc null ou scalaire n'est pas un bloc")
    func nullBlockIsNoBlock() throws {
        #expect(try JSONDecoder().decode(APIEngagementProgress.self, from: Self.payload(game: "null")).game == nil)
        #expect(try JSONDecoder().decode(APIEngagementProgress.self, from: Self.payload(game: "42")).game == nil)
    }

    @Test("une charge ancienne mise en cache se relit sans la clé game")
    func oldCachedRowsStillDecode() throws {
        let cached = try JSONEncoder().encode(APIEngagementProgress.empty)
        let object = try #require(JSONSerialization.jsonObject(with: cached) as? [String: Any])
        var stripped = object
        stripped.removeValue(forKey: "game")
        let decoded = try JSONDecoder().decode(APIEngagementProgress.self, from: JSONSerialization.data(withJSONObject: stripped))
        #expect(decoded == .empty)
    }

    @Test("la frappe étendue se lit, et l'ancienne forme reste valide")
    func extendedMintResponse() throws {
        let legacy = try JSONDecoder().decode(APIMeeshMintResult.self, from: Data(#"{"status":"minted","balance":3,"mintedLifetime":3}"#.utf8))
        #expect(legacy.number == nil)
        #expect(legacy.edition == nil)

        let extended = try JSONDecoder().decode(APIMeeshMintResult.self, from: Data("""
        {"status":"minted","balance":10,"mintedLifetime":13,"number":13,"edition":"silver","price":1294,
         "gloryGained":100,"levelBefore":34,"levelAfter":32}
        """.utf8))
        #expect(extended.number == 13)
        #expect(extended.edition == .silver)
        #expect(extended.price == 1294)
        #expect(extended.levelAfter == 32)
    }

    @Test("une matière inconnue ne fait pas échouer une frappe déjà faite")
    func unknownEditionDoesNotFailAMint() throws {
        let decoded = try JSONDecoder().decode(APIMeeshMintResult.self, from: Data(
            #"{"status":"minted","balance":10,"mintedLifetime":13,"number":13,"edition":"diamant"}"#.utf8))
        #expect(decoded.status == "minted")
        #expect(decoded.number == 13)
        #expect(decoded.edition == nil)
    }
}
