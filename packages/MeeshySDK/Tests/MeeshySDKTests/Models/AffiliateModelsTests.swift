import XCTest
@testable import MeeshySDK

final class AffiliateModelsTests: XCTestCase {

    // MARK: - AffiliateToken

    func test_affiliateToken_decodesAllFields() throws {
        let json = """
        {
            "id": "aff1",
            "token": "SUMMER2026",
            "name": "Summer Campaign",
            "affiliateLink": "https://meeshy.me/ref/SUMMER2026",
            "maxUses": 500,
            "currentUses": 42,
            "isActive": true,
            "expiresAt": "2026-09-01T00:00:00.000Z",
            "createdAt": "2026-06-01T12:00:00.000Z",
            "_count": { "affiliations": 38 },
            "clickCount": 120
        }
        """.data(using: .utf8)!

        let token = try JSONDecoder().decode(AffiliateToken.self, from: json)
        XCTAssertEqual(token.id, "aff1")
        XCTAssertEqual(token.token, "SUMMER2026")
        XCTAssertEqual(token.name, "Summer Campaign")
        XCTAssertEqual(token.affiliateLink, "https://meeshy.me/ref/SUMMER2026")
        XCTAssertEqual(token.maxUses, 500)
        XCTAssertEqual(token.currentUses, 42)
        XCTAssertTrue(token.isActive)
        XCTAssertEqual(token.expiresAt, "2026-09-01T00:00:00.000Z")
        XCTAssertEqual(token.createdAt, "2026-06-01T12:00:00.000Z")
        XCTAssertEqual(token.referralCount, 38)
        XCTAssertEqual(token.clickCount, 120)
    }

    func test_affiliateToken_decodesWithOptionalFieldsMissing() throws {
        let json = """
        {
            "id": "aff2",
            "token": "BASIC",
            "name": "Basic Token",
            "currentUses": 0,
            "isActive": false,
            "createdAt": "2026-04-01T00:00:00.000Z"
        }
        """.data(using: .utf8)!

        let token = try JSONDecoder().decode(AffiliateToken.self, from: json)
        XCTAssertEqual(token.id, "aff2")
        XCTAssertNil(token.affiliateLink)
        XCTAssertNil(token.maxUses)
        XCTAssertEqual(token.currentUses, 0)
        XCTAssertFalse(token.isActive)
        XCTAssertNil(token.expiresAt)
        XCTAssertNil(token._count)
        XCTAssertEqual(token.referralCount, 0)
        XCTAssertEqual(token.clickCount, 0)
    }

    func test_affiliateToken_clickCountDefaultsToZeroWhenMissing() throws {
        let json = """
        {
            "id": "aff3",
            "token": "NOCLICKS",
            "name": "No Clicks",
            "currentUses": 5,
            "isActive": true,
            "createdAt": "2026-03-15T08:00:00.000Z"
        }
        """.data(using: .utf8)!

        let token = try JSONDecoder().decode(AffiliateToken.self, from: json)
        XCTAssertEqual(token.clickCount, 0)
    }

    // MARK: - AffiliateCount

    func test_affiliateCount_decodes() throws {
        let json = """
        { "affiliations": 77 }
        """.data(using: .utf8)!

        let count = try JSONDecoder().decode(AffiliateCount.self, from: json)
        XCTAssertEqual(count.affiliations, 77)
    }

    // MARK: - AffiliateStats

    func test_affiliateStats_decodesAllFields() throws {
        let json = """
        {
            "totalTokens": 5,
            "totalReferrals": 200,
            "totalVisits": 1500,
            "conversionRate": 0.133
        }
        """.data(using: .utf8)!

        let stats = try JSONDecoder().decode(AffiliateStats.self, from: json)
        XCTAssertEqual(stats.totalTokens, 5)
        XCTAssertEqual(stats.totalReferrals, 200)
        XCTAssertEqual(stats.totalVisits, 1500)
        XCTAssertEqual(stats.conversionRate, 0.133, accuracy: 0.001)
    }

    func test_affiliateStats_decodesWithAllFieldsNil() throws {
        let json = """
        {}
        """.data(using: .utf8)!

        let stats = try JSONDecoder().decode(AffiliateStats.self, from: json)
        XCTAssertNil(stats.totalTokens)
        XCTAssertNil(stats.totalReferrals)
        XCTAssertNil(stats.totalVisits)
        XCTAssertNil(stats.conversionRate)
    }

    // MARK: - CreateAffiliateTokenRequest

    func test_createAffiliateTokenRequest_encodesAllFields() throws {
        let request = CreateAffiliateTokenRequest(
            name: "Winter Sale",
            maxUses: 100,
            expiresAt: "2026-12-31T23:59:59.000Z"
        )

        let data = try JSONEncoder().encode(request)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(dict["name"] as? String, "Winter Sale")
        XCTAssertEqual(dict["maxUses"] as? Int, 100)
        XCTAssertEqual(dict["expiresAt"] as? String, "2026-12-31T23:59:59.000Z")
    }

    func test_createAffiliateTokenRequest_encodesWithOptionalFieldsNil() throws {
        let request = CreateAffiliateTokenRequest(name: "Simple")

        let data = try JSONEncoder().encode(request)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(dict["name"] as? String, "Simple")
        XCTAssertNil(dict["maxUses"])
        XCTAssertNil(dict["expiresAt"])
    }
}
