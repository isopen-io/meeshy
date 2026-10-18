import XCTest
@testable import MeeshySDK

/// Les étincelles (#10846, #10847, #10848) — décodage additif et loi du coût.
///
/// Tout est OPTIONNEL : un serveur antérieur ne sert aucun de ces champs, et
/// aucun ancien vecteur ne doit casser. Les étincelles sont des nombres JSON
/// ENTIERS, saturés à 2^53 − 1 par la passerelle ; `Int` est 64 bits sur
/// chaque appareil iOS, et la saturation se décode sans perte.
final class GameSparksTests: XCTestCase {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private static let maxSafe = 9_007_199_254_740_991

    // MARK: - Bloc `level` de GET /me/engagement

    func test_engagementLevel_decodesTheThreeNumbers_andTheLifetimeMax() throws {
        let level = try decode(APIEngagementProgress.Level.self, """
        {"engagementScore": 200, "sparks": 200, "sparksCycle": 9000, "sparksLifetime": \(Self.maxSafe), "levelMaxLifetime": 412}
        """)
        XCTAssertEqual(level.engagementScore, 200)
        XCTAssertEqual(level.sparks, 200)
        XCTAssertEqual(level.sparksCycle, 9000)
        XCTAssertEqual(level.sparksLifetime, Self.maxSafe, "2^53 − 1 se décode sans perte")
        XCTAssertEqual(level.levelMaxLifetime, 412)
    }

    func test_engagementLevel_fromAnOlderServer_stillDecodes() throws {
        let level = try decode(APIEngagementProgress.Level.self, #"{"engagementScore": 50}"#)
        XCTAssertEqual(level.engagementScore, 50)
        XCTAssertNil(level.sparksLifetime)
        XCTAssertEqual(level.pocket, 50, "la poche se lit sur engagementScore devant un serveur antérieur")
    }

    // MARK: - Bloc `meesh`

    func test_meesh_decodesTheEffectiveCost_andItsParts() throws {
        let meesh = try decode(APIEngagementProgress.Meesh.self, """
        {"balance": 2, "mintedLifetime": 3, "debitablePoints": 900, "floorPoints": 0, "missingPoints": 0,
         "mintCost": 665, "baseMintCost": 1221, "costFactor": 0.545}
        """)
        XCTAssertEqual(meesh.mintCost, 665)
        XCTAssertEqual(meesh.baseMintCost, 1221)
        XCTAssertEqual(meesh.costFactor ?? 0, 0.545, accuracy: 1e-9)
    }

    // MARK: - Bloc `game`

    func test_gameLevel_decodesSparks_andTheLifetimeMaxOnTheLadder() throws {
        let level = try decode(GameBlock.Level.self, """
        {"level": 9, "tier": "etincelle", "score": 8200, "floorScore": 8100, "nextThreshold": 10000, "pointsToNext": 1800,
         "progress": 0.05, "record": 9, "prestige": 0, "canPrestige": false,
         "sparks": 5000, "sparksCycle": 8200, "sparksLifetime": 12000, "levelMaxLifetime": 40,
         "ladder": {"level": 9, "tier": "etincelle", "floorScore": 8100, "nextThreshold": 10000, "pointsToNext": 1800,
                    "progress": 0.05, "record": 9, "cap": 499, "isMax": false, "levelMaxLifetime": 40}}
        """)
        XCTAssertEqual(level.sparks, 5000)
        XCTAssertEqual(level.sparksCycle, 8200)
        XCTAssertEqual(level.sparksLifetime, 12000)
        XCTAssertEqual(level.levelMaxLifetime, 40)
        XCTAssertEqual(level.ladder?.levelMaxLifetime, 40)
        XCTAssertEqual(level.shownLevelMaxLifetime, 40)
    }

    /// Devant un serveur antérieur, le niveau max à vie retombe sur le record, jamais sous le niveau.
    func test_gameLevel_withoutLifetimeMax_fallsBackToTheRecord() throws {
        let level = try decode(GameBlock.Level.self, """
        {"level": 12, "tier": "lueur", "score": 15000, "floorScore": 14400, "nextThreshold": 16900, "pointsToNext": 1900,
         "progress": 0.2, "record": 15, "prestige": 0, "canPrestige": false}
        """)
        XCTAssertNil(level.levelMaxLifetime)
        XCTAssertEqual(level.shownLevelMaxLifetime, 15)
    }

    func test_mintPreview_decodesCost_andTheTreasuryLock() throws {
        let preview = try decode(GameMintPreview.self, """
        {"number": 100, "price": 8000, "edition": "gold", "canMint": false, "missingPoints": 0,
         "levelBefore": 60, "levelAfter": 60, "levelsLost": 0, "gloryGained": 0,
         "basePrice": 10000, "costFactor": 0.8, "costLevel": 60,
         "locked": {"tier": "coffre", "minHeld": 100, "requires": {"rank": "voix", "division": 1, "division5": 1}},
         "sparksDebt": 300}
        """)
        XCTAssertEqual(preview.basePrice, 10000)
        XCTAssertEqual(preview.costFactor ?? 0, 0.8, accuracy: 1e-9)
        XCTAssertEqual(preview.costLevel, 60)
        XCTAssertEqual(preview.locked?.tier, .coffre)
        XCTAssertEqual(preview.locked?.requires.rank, .voix)
        XCTAssertEqual(preview.locked?.requires.division5, 1)
        XCTAssertEqual(preview.sparksDebt, 300)
        XCTAssertEqual(preview.blocker, .sparksDebt(300), "la dette prime : elle se règle avant tout le reste")
    }

    func test_mintPreview_fromAnOlderServer_stillDecodes_andIsFree() throws {
        let preview = try decode(GameMintPreview.self, """
        {"number": 1, "price": 1221, "edition": "silver", "canMint": true, "missingPoints": 0,
         "levelBefore": 3, "levelAfter": 3, "levelsLost": 0, "gloryGained": 1000}
        """)
        XCTAssertNil(preview.basePrice)
        XCTAssertNil(preview.locked)
        XCTAssertNil(preview.blocker)
    }

    func test_mintBlockers_inPriorityOrder() {
        let lock = GameMintLock(tier: .tresor, minHeld: 500,
                                requires: .init(rank: .polyglotte, division: 3, division5: 3))
        func preview(missing: Int, lock: GameMintLock?, debt: Int?) -> GameMintPreview {
            GameMintPreview(number: 2, price: 600, edition: .silver, canMint: missing == 0 && lock == nil && (debt ?? 0) == 0,
                            missingPoints: missing, levelBefore: 1, levelAfter: 1, levelsLost: 0, gloryGained: 0,
                            locked: lock, sparksDebt: debt)
        }
        XCTAssertEqual(preview(missing: 50, lock: lock, debt: 10).blocker, .sparksDebt(10))
        XCTAssertEqual(preview(missing: 50, lock: lock, debt: nil).blocker, .treasuryLocked(lock))
        XCTAssertEqual(preview(missing: 50, lock: nil, debt: 0).blocker, .missingSparks(50))
        XCTAssertNil(preview(missing: 0, lock: nil, debt: nil).blocker)
    }

    func test_treasury_decodesAccess_perReserve() throws {
        let treasury = try decode(TreasuryStanding.self, """
        {"held": 3, "tier": "bourse", "next": {"key": "escarcelle", "minHeld": 10, "missing": 7},
         "access": [{"key": "bourse", "minHeld": 1, "locked": false, "requires": null},
                    {"key": "coffre", "minHeld": 100, "locked": true, "requires": {"rank": "voix", "division": 1, "division5": 1}}]}
        """)
        XCTAssertEqual(treasury.access?.count, 2)
        XCTAssertEqual(treasury.access?.last?.locked, true)
        XCTAssertEqual(treasury.access?.last?.requires?.rank, .voix)
        XCTAssertNil(treasury.access?.first?.requires)
    }

    // MARK: - standing (GET /users/:id/game)

    func test_standing_decodesSparks_andLifetimeMax() throws {
        let standing = try decode(GameStanding.self, """
        {"level": 20, "tier": "lueur", "prestige": 1, "flame": null, "rank": "voix", "division": 2,
         "ladder": {"level": 20, "tier": "lueur", "levelMaxLifetime": 130},
         "levelMaxLifetime": 130, "points": 400, "sparks": 400, "sparksLifetime": 90000}
        """)
        XCTAssertEqual(standing.levelMaxLifetime, 130)
        XCTAssertEqual(standing.ladder?.levelMaxLifetime, 130)
        XCTAssertEqual(standing.sparks, 400)
        XCTAssertEqual(standing.sparksLifetime, 90000)
    }

    /// #10913 : la Gloire totale, servie à soi et aux amis — absente devant un ancien serveur ou un non-ami.
    func test_standing_decodesTheGlory_andAbsentStaysAbsent() throws {
        let served = try decode(GameStanding.self, """
        {"level": 20, "tier": "lueur", "prestige": 1, "flame": null, "rank": "voix", "division": 2, "glory": 16000}
        """)
        XCTAssertEqual(served.glory, 16000)
        let withheld = try decode(GameStanding.self, """
        {"level": 20, "tier": "lueur", "prestige": 1, "flame": null, "rank": "voix", "division": 2}
        """)
        XCTAssertNil(withheld.glory)
    }

    // MARK: - La dette (ffbc396c92) : blockedBy, sparksDebt sur level, refus MINT_BLOCKED_BY_DEBT

    func test_mint_blockedByDebt_isTheBlocker_evenWithoutAnAmount() throws {
        let preview = try decode(GameMintPreview.self, """
        {"number": 4, "price": 900, "edition": "silver", "canMint": false, "missingPoints": 0,
         "levelBefore": 20, "levelAfter": 20, "levelsLost": 0, "gloryGained": 0, "blockedBy": "debt"}
        """)
        XCTAssertEqual(preview.blockedBy, .debt)
        XCTAssertEqual(preview.blocker, .sparksDebt(0), "la dette bloque, même quand son montant n'est pas servi ici")
    }

    func test_blockedBy_null_orUnknown_doesNotBlock_andDoesNotDropTheBlock() throws {
        let preview = try decode(GameMintPreview.self, """
        {"number": 4, "price": 900, "edition": "silver", "canMint": true, "missingPoints": 0,
         "levelBefore": 20, "levelAfter": 20, "levelsLost": 0, "gloryGained": 0, "blockedBy": "something-new"}
        """)
        XCTAssertNil(preview.blockedBy)
        XCTAssertNil(preview.blocker)
    }

    func test_meesh_and_level_carryTheDebt() throws {
        let meesh = try decode(APIEngagementProgress.Meesh.self, """
        {"balance": 0, "mintedLifetime": 1, "debitablePoints": 0, "floorPoints": 0, "missingPoints": 0, "mintCost": 600,
         "blockedBy": "debt", "sparksDebt": 250}
        """)
        XCTAssertEqual(meesh.blockedBy, .debt)
        XCTAssertEqual(meesh.sparksDebt, 250)
        let level = try decode(GameBlock.Level.self, """
        {"level": 9, "tier": "etincelle", "score": 8200, "floorScore": 8100, "nextThreshold": 10000, "pointsToNext": 1800,
         "progress": 0.05, "record": 9, "prestige": 0, "canPrestige": false, "sparksDebt": 250}
        """)
        XCTAssertEqual(level.sparksDebt, 250)
        let engagementLevel = try decode(APIEngagementProgress.Level.self, #"{"engagementScore": 0, "sparksDebt": 250}"#)
        XCTAssertEqual(engagementLevel.sparksDebt, 250)
    }

    func test_theDebtRefusal_isAKnownErrorCode() {
        XCTAssertEqual(GameErrorCode(rawValue: "MINT_BLOCKED_BY_DEBT"), .mintBlockedByDebt)
    }

    // MARK: - La loi du coût (packages/shared/fixtures/reading-modes/sparks.vectors.json)

    private static var vectorsURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("shared/fixtures/reading-modes/sparks.vectors.json")
    }

    func test_costLaw_replaysTheSharedVectors() throws {
        let root = try JSONSerialization.jsonObject(with: Data(contentsOf: Self.vectorsURL)) as? [String: Any]
        let vectors = try XCTUnwrap(root?["vectors"] as? [[String: Any]])
        var replayed = 0
        for vector in vectors {
            let input = try XCTUnwrap(vector["input"] as? [String: Any])
            let expected = vector["expected"] as? [String: Any]
            let label = vector["_label"] as? String ?? "?"
            switch input["law"] as? String {
            case "mint-cost-factor":
                XCTAssertEqual(GameMint.costFactorPermille(level: input["level"] as! Int), expected?["permille"] as? Int, label)
                replayed += 1
            case "mint-price":
                XCTAssertEqual(GameMint.effectivePrice(forNumber: input["number"] as! Int, level: input["level"] as! Int),
                               expected?["price"] as? Int, label)
                replayed += 1
            case "sparks-of":
                let facts = GameSparks.facts(pocket: input["engagementScore"] as? Int,
                                             cycle: input["sparksSincePrestige"] as? Int,
                                             lifetime: input["sparksEarnedLifetime"] as? Int)
                XCTAssertEqual(facts.pocket, expected?["pocket"] as? Int, label)
                XCTAssertEqual(facts.cycle, expected?["cycle"] as? Int, label)
                XCTAssertEqual(facts.lifetime, expected?["lifetime"] as? Int, label)
                replayed += 1
            default:
                continue
            }
        }
        let expected = vectors.filter { ["mint-cost-factor", "mint-price", "sparks-of"].contains(($0["input"] as? [String: Any])?["law"] as? String ?? "") }.count
        XCTAssertGreaterThanOrEqual(replayed, 16)
        XCTAssertEqual(replayed, expected, "le fichier entier pour ces trois lois, sans en sauter un")
    }

    // MARK: - La frappe et les réserves (#10894) — les trois lois que l'optimiste rejoue

    private static func lockJSON(_ lock: GameMintLock?) -> [String: Any]? {
        lock.map { ["tier": $0.tier.rawValue, "minHeld": $0.minHeld,
                    "requires": ["rank": $0.requires.rank.rawValue, "division": $0.requires.division,
                                 "division5": $0.requires.division5]] }
    }

    private static func same(_ a: Any?, _ b: Any?) -> Bool {
        switch (a, b) {
        case (nil, nil), (nil, is NSNull), (is NSNull, nil), (is NSNull, is NSNull): return true
        case let (x as [String: Any], y as [String: Any]): return NSDictionary(dictionary: x).isEqual(to: y)
        default: return false
        }
    }

    private static func steps(_ json: [String: Any]?) -> GameLevelStepFacts? {
        guard let json else { return nil }
        return GameLevelStepFacts(minted: 0, missionsDone: json["missionsDone"] as! Int, flameRecord: json["flameRecord"] as! Int,
                                  glory: json["glory"] as! Int, rank: GloryRank(rawValue: json["rank"] as! String)!)
    }

    func test_mintAndTreasuryLaws_replayTheSharedVectors() throws {
        let root = try JSONSerialization.jsonObject(with: Data(contentsOf: Self.vectorsURL)) as? [String: Any]
        let vectors = try XCTUnwrap(root?["vectors"] as? [[String: Any]])
        let laws = ["sparks-mint-preview", "treasury-access", "treasury-lock"]
        var replayed = 0
        for vector in vectors {
            let input = try XCTUnwrap(vector["input"] as? [String: Any])
            let label = vector["_label"] as? String ?? "?"
            let mythic = input["mythic"] as? Bool ?? false
            switch input["law"] as? String {
            case "sparks-mint-preview":
                let e = try XCTUnwrap(vector["expected"] as? [String: Any])
                let p = GameMint.sparksPreview(
                    sparks: input["sparks"] as! Int, mintedLifetime: input["mintedLifetime"] as! Int, held: input["held"] as! Int,
                    glory: input["glory"] as! Int, mythic: mythic, levelCap: input["levelCap"] as? Int,
                    steps: Self.steps(input["steps"] as? [String: Any]), debt: input["debt"] as? Int ?? 0)
                XCTAssertEqual(p.number, e["number"] as? Int, label)
                XCTAssertEqual(p.price, e["price"] as? Int, label)
                XCTAssertEqual(p.basePrice, e["basePrice"] as? Int, label)
                XCTAssertEqual(p.costFactor, e["costFactor"] as? Double, label)
                XCTAssertEqual(p.costLevel, e["costLevel"] as? Int, label)
                XCTAssertEqual(p.edition.rawValue, e["edition"] as? String, label)
                XCTAssertEqual(p.canMint, e["canMint"] as? Bool, label)
                XCTAssertEqual(p.missingPoints, e["missingPoints"] as? Int, label)
                XCTAssertEqual(p.levelBefore, e["levelBefore"] as? Int, label)
                XCTAssertEqual(p.levelAfter, e["levelAfter"] as? Int, label)
                XCTAssertEqual(p.levelsLost, e["levelsLost"] as? Int, label)
                XCTAssertEqual(p.gloryGained, e["gloryGained"] as? Int, label)
                XCTAssertEqual(p.sparksDebt, e["sparksDebt"] as? Int, label)
                XCTAssertEqual(p.blockedBy?.rawValue, e["blockedBy"] as? String, label)
                XCTAssertTrue(Self.same(Self.lockJSON(p.locked), e["locked"]), label)
            case "treasury-access":
                let e = try XCTUnwrap(vector["expected"] as? [[String: Any]])
                let access = GameTreasury.reserveAccess(glory: input["glory"] as! Int, mythic: mythic)
                XCTAssertEqual(access.map(\.key.rawValue), e.map { $0["key"] as? String ?? "" }, label)
                XCTAssertEqual(access.map(\.minHeld), e.map { $0["minHeld"] as? Int ?? -1 }, label)
                XCTAssertEqual(access.map(\.locked), e.map { $0["locked"] as? Bool ?? false }, label)
                for (a, x) in zip(access, e) {
                    let requires = a.requires.map { ["rank": $0.rank.rawValue, "division": $0.division, "division5": $0.division5] as [String: Any] }
                    XCTAssertTrue(Self.same(requires, x["requires"]), label)
                }
            case "treasury-lock":
                let e = try XCTUnwrap(vector["expected"] as? [String: Any])
                let lock = GameTreasury.lock(held: input["held"] as! Int, glory: input["glory"] as! Int, mythic: mythic)
                XCTAssertTrue(Self.same(Self.lockJSON(lock), e["lock"]), label)
            default:
                continue
            }
            replayed += 1
        }
        let expected = vectors.filter { laws.contains(($0["input"] as? [String: Any])?["law"] as? String ?? "") }.count
        XCTAssertGreaterThanOrEqual(replayed, 25)
        XCTAssertEqual(replayed, expected, "le fichier entier pour ces trois lois, sans en sauter un")
    }

    // MARK: - Le gain et le Prestige (#10902) — ce que l'optimiste du coffre et du Prestige rejoue

    func test_creditAndPrestigeLaws_replayTheSharedVectors() throws {
        let root = try JSONSerialization.jsonObject(with: Data(contentsOf: Self.vectorsURL)) as? [String: Any]
        let vectors = try XCTUnwrap(root?["vectors"] as? [[String: Any]])
        let laws = ["sparks-credit", "sparks-prestige"]
        var replayed = 0
        for vector in vectors {
            let input = try XCTUnwrap(vector["input"] as? [String: Any])
            guard let law = input["law"] as? String, laws.contains(law) else { continue }
            let label = vector["_label"] as? String ?? "?"
            let e = try XCTUnwrap(vector["expected"] as? [String: Any])
            let ledger = GameSparks.Ledger(pocket: input["pocket"] as! Int, cycle: input["cycle"] as! Int,
                                           lifetime: input["lifetime"] as! Int, debt: input["debt"] as! Int)
            let after = law == "sparks-credit"
                ? GameSparks.afterCredit(ledger, points: input["points"] as! Int)
                : GameSparks.afterPrestige(ledger)
            XCTAssertEqual(after.pocket, e["pocket"] as? Int, label)
            XCTAssertEqual(after.cycle, e["cycle"] as? Int, label)
            XCTAssertEqual(after.lifetime, e["lifetime"] as? Int, label)
            XCTAssertEqual(after.debt, e["debt"] as? Int, label)
            replayed += 1
        }
        XCTAssertGreaterThanOrEqual(replayed, 6)
    }
}
