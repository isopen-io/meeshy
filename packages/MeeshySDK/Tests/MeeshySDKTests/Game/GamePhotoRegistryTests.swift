import Foundation
import Testing
@testable import MeeshySDK

/// Le registre des moments photo (#20649, tranche iOS de #20643) : l'extension `game.photo` du bloc `game`, lue comme
/// `gamePhotoBlockSchema` (`packages/shared/types/game-photo.ts`, témoins `contract-photo.test.ts`), et l'accusé d'une
/// invitation présentée.
@Suite("Jeu Meeshy — le registre des moments photo")
struct GamePhotoRegistryTests {

    private static let row = #"{"stepId":"rank:ambassadeur:4","detectedAt":"2026-10-11T08:00:00.000Z","presentedAt":null,"notifiedAt":null,"keptAt":null}"#

    private static func photo(
        atmosphere: String = #""egypte""#,
        invitations: String = #""major""#,
        baseline: String = #"{"rank":"ambassadeur","division":4,"levelRecord":30,"prestige":0,"minted":12,"treasuryTier":"coffret","flameRecord":9}"#,
        treasuryPeakTier: String = #""coffre""#,
        moments: String = "[\(row)]"
    ) -> String {
        #"{"atmosphere":\#(atmosphere),"invitations":\#(invitations),"baselineAt":"2026-10-11T08:00:00.000Z","baseline":\#(baseline),"treasuryPeakTier":\#(treasuryPeakTier),"moments":\#(moments)}"#
    }

    private static func game(photo: String?) throws -> GameBlock {
        var json = GameBlockFixture.json.trimmingCharacters(in: .whitespacesAndNewlines)
        if let photo {
            json.removeLast()
            json += #","photo":\#(photo)}"#
        }
        return try JSONDecoder().decode(GameBlock.self, from: Data(json.utf8))
    }

    private static func block(_ json: String) throws -> GamePhotoBlock {
        try JSONDecoder().decode(GamePhotoBlock.self, from: Data(json.utf8))
    }

    @Test("le bloc se lit tel que la passerelle le sert")
    func readsTheServedBlock() throws {
        let photo = try #require(try Self.game(photo: Self.photo()).photo)
        #expect(photo.atmosphere == "egypte")
        #expect(photo.invitations == .major)
        #expect(photo.baselineAt == "2026-10-11T08:00:00.000Z")
        #expect(photo.baseline == PhotoCatchUpStanding(rank: .ambassadeur, division: .iv, levelRecord: 30, prestige: 0,
                                                       minted: 12, treasuryTier: .coffret, flameRecord: 9))
        #expect(photo.treasuryPeakTier == .coffre)
        #expect(photo.moments == [GamePhotoMomentRow(stepId: "rank:ambassadeur:4", detectedAt: "2026-10-11T08:00:00.000Z",
                                                     presentedAt: nil, notifiedAt: nil, keptAt: nil)])
    }

    @Test("absent (serveur antérieur) : rien ne tombe")
    func absentKeepsTheGame() throws {
        let game = try Self.game(photo: nil)
        #expect(game.photo == nil)
        #expect(game.flame.days == 4)
    }

    @Test("illisible, il tombe SEUL : le reste du jeu reste lu")
    func unreadableFallsAlone() throws {
        let game = try Self.game(photo: Self.photo(invitations: #""souvent""#))
        #expect(game.photo == nil)
        #expect(game.flame.days == 4)
        #expect(try Self.game(photo: Self.photo(moments: #"[{"stepId":"une étape"}]"#)).photo == nil)
        let tooMany = "[" + Array(repeating: Self.row, count: GamePhotoRegistry.servedMax + 1).joined(separator: ",") + "]"
        #expect(try Self.game(photo: Self.photo(moments: tooMany)).photo == nil)
    }

    @Test("une ligne d'avant le signal « immortalisée » se lit sans `keptAt`")
    func rowWithoutKeptAt() throws {
        let photo = try Self.block(Self.photo(moments: #"[{"stepId":"start","detectedAt":null,"presentedAt":"2026-10-11T08:00:00.000Z","notifiedAt":null}]"#))
        #expect(photo.moments == [GamePhotoMomentRow(stepId: "start", detectedAt: nil, presentedAt: "2026-10-11T08:00:00.000Z",
                                                     notifiedAt: nil, keptAt: nil)])
    }

    @Test("une ligne de base ou un palier illisibles se lisent « aucun » sans emporter le reste")
    func unreadableBaselineReadsNone() throws {
        let photo = try Self.block(Self.photo(baseline: #"{"rank":3}"#, treasuryPeakTier: #""galion""#))
        #expect(photo.baseline == nil)
        #expect(photo.treasuryPeakTier == nil)
        #expect(photo.atmosphere == "egypte")
        #expect(try Self.block(Self.photo(baseline: #"{"rank":"astre","division":4,"levelRecord":30,"prestige":0,"minted":12,"treasuryTier":null,"flameRecord":9}"#)).baseline == nil,
                "un rang inconnu vaut « aucune ligne de base », comme `servedBaseline` du web")
        #expect(try Self.block(Self.photo(baseline: "null")).baseline == nil)
    }

    @Test("le Mythe se lit sans division")
    func mythicBaseline() throws {
        let photo = try Self.block(Self.photo(baseline: #"{"rank":"mythe","division":null,"levelRecord":120,"prestige":1,"minted":40,"treasuryTier":null,"flameRecord":30,"pastCycleRecords":[100]}"#))
        #expect(photo.baseline == PhotoCatchUpStanding(rank: .mythe, division: nil, levelRecord: 120, prestige: 1, minted: 40,
                                                       treasuryTier: nil, flameRecord: 30, pastCycleRecords: [100]))
    }

    @Test("le réglage d'invitation se lit dans les mots de la loi des alertes")
    func invitationsPolicy() {
        #expect(PhotoInvitationsSetting.every.policy == .standard)
        #expect(PhotoInvitationsSetting.major.policy.invitations == .bigMoments)
        #expect(PhotoInvitationsSetting.never.policy.invitations == .never)
        #expect(PhotoInvitationsSetting.major.policy.inApp == PhotoAlertPolicy.standard.inApp)
    }

    @Test("une étape présentée, notifiée ou immortalisée ne s'annonce plus ; seules les immortalisées sont gardées")
    func presentedAndKept() throws {
        let moments = #"[{"stepId":"rank:voix:3","detectedAt":null,"presentedAt":"2026-10-11T08:00:00.000Z","notifiedAt":null,"keptAt":null},{"stepId":"meesh:10","detectedAt":null,"presentedAt":null,"notifiedAt":"2026-10-11T09:00:00.000Z","keptAt":null},{"stepId":"flame:7","detectedAt":null,"presentedAt":null,"notifiedAt":null,"keptAt":"2026-10-12T08:00:00.000Z"},{"stepId":"level:40","detectedAt":"2026-10-12T08:00:00.000Z","presentedAt":null,"notifiedAt":null,"keptAt":null}]"#
        let photo = try Self.block(Self.photo(moments: moments))
        #expect(photo.presentedStepIds == ["rank:voix:3", "meesh:10", "flame:7"])
        #expect(photo.keptStepIds == ["flame:7"])
    }

    @Test("le bloc relu du cache est le bloc servi")
    func roundTrips() throws {
        let game = try Self.game(photo: Self.photo())
        let again = try JSONDecoder().decode(GameBlock.self, from: JSONEncoder().encode(game))
        #expect(again.photo == game.photo)
        #expect(again.photo != nil)
    }

    @Test("l'accusé part par lots de 64 étapes valides, sans doublon, dans l'ordre")
    func presentedBatches() {
        #expect(GamePhotoRegistry.presentedBatches([]) == [])
        #expect(GamePhotoRegistry.presentedBatches(["rank:voix:3", "meesh:10", "rank:voix:3", "une étape", ""]) == [["rank:voix:3", "meesh:10"]])
        let many = (1...130).map { "meesh:\($0)" }
        let batches = GamePhotoRegistry.presentedBatches(many)
        #expect(batches.map(\.count) == [64, 64, 2])
        #expect(batches.flatMap { $0 } == many)
    }

    @Test("une identité d'étape suit `PHOTO_STEP_ID_PATTERN`")
    func stepIdPattern() {
        #expect(GamePhotoRegistry.isStepId("rank:mythe:0"))
        #expect(GamePhotoRegistry.isStepId("day:2026-10-11"))
        #expect(GamePhotoRegistry.isStepId(String(repeating: "a", count: 96)))
        #expect(!GamePhotoRegistry.isStepId(String(repeating: "a", count: 97)))
        #expect(!GamePhotoRegistry.isStepId(":rank"))
        #expect(!GamePhotoRegistry.isStepId("rank voix"))
    }

    @Test("l'accusé est un POST vers le registre, qui porte l'intention et les étapes")
    func acknowledgePosts() async throws {
        let mock = MockAPIClient()
        let served = PhotoMomentsPresentedResponse(presented: [.init(stepId: "rank:voix:3", presentedAt: "2026-11-27T08:00:00.000Z")])
        mock.stub("/me/game/photo-moments/presented",
                  result: APIResponse<PhotoMomentsPresentedResponse>(success: true, data: served, error: nil))

        let result = try await GameService(api: mock).acknowledgePhotoMomentsPresented(["rank:voix:3"], requestId: "req-photo-0001")

        #expect(mock.lastRequest?.endpoint == "/me/game/photo-moments/presented")
        #expect(mock.lastRequest?.method == "POST")
        #expect(mock.lastRequest?.bodyJSON?["requestId"] as? String == "req-photo-0001")
        #expect(mock.lastRequest?.bodyJSON?["stepIds"] as? [String] == ["rank:voix:3"])
        #expect(result == served)
    }
}
