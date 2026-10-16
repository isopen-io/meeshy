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
        XCTAssertEqual(replayed, 16, "8 facteurs, 5 prix, 3 lectures d'étincelles — le fichier entier pour ces trois lois")
    }
}
