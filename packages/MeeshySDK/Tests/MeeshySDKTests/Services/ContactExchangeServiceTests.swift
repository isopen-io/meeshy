import XCTest
@testable import MeeshySDK

/// `ContactExchangeService` (#19484) — le partage sans contact. La passerelle fait foi
/// (`services/gateway/src/routes/contact-exchange.ts`, `packages/shared/types/contact-exchange.ts`).
final class ContactExchangeServiceTests: XCTestCase {

    private static let token = "ce1.AAAAAAAAAAAAAAAAAAAAAA.3.1795000000.BBBBBBBBBBBBBBBBBBBBBB"

    private func makeSUT() -> (service: ContactExchangeService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (ContactExchangeService(api: api), api)
    }

    // MARK: - Le jeton

    func test_token_followsTheContractPattern() {
        XCTAssertTrue(ContactExchangeToken.isWellFormed(Self.token))
    }

    func test_token_outsideThePattern_isRefused_soNothingForeignEntersAPath() {
        let refused = [
            "", "ce1", "ce2.AAAAAAAAAAAAAAAAAAAAAA.3.1795000000.BBBBBBBBBBBBBBBBBBBBBB",
            "ce1.AAAAAAAAAAAAAAAAAAAAAA.4.1795000000.BBBBBBBBBBBBBBBBBBBBBB",
            "ce1.AAAAAAAAAAAAAAAAAAAAA/.3.1795000000.BBBBBBBBBBBBBBBBBBBBBB",
            "ce1.AAAAAAAAAAAAAAAAAAAAAA.3.179500000.BBBBBBBBBBBBBBBBBBBBBB",
            "ce1.AAAAAAAAAAAAAAAAAAAAAA.3.1795000000.BBBBBBBBBBBBBBBBBBBBBB.x",
            "ce1.AAAAAAAAAAAAAAAAAAAAAA.3.1795000000.BBBBBBBBBBBBBBBBBBBBB?",
        ]
        for token in refused {
            XCTAssertFalse(ContactExchangeToken.isWellFormed(token), "\(token)")
        }
    }

    // MARK: - Émettre

    func test_issue_postsOnlyTheOffers_inTheContractOrder_andReadsTheToken() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/me/contact-exchange", json: """
        {"success":true,"data":{"token":"\(Self.token)","expiresAt":"2026-11-18T10:02:00.000Z","offers":["vitrine","friendRequest"],"locked":["phone"]}}
        """)

        let issued = try await service.issue(offers: [.friendRequest, .vitrine])

        XCTAssertEqual(issued.token, Self.token)
        XCTAssertEqual(issued.offers, [.vitrine, .friendRequest])
        XCTAssertEqual(api.lastRequest?.method, "POST")
        XCTAssertEqual(api.lastRequest?.bodyJSON?.keys.sorted(), ["offers"])
        XCTAssertEqual(api.lastRequest?.bodyJSON?["offers"] as? [String], ["vitrine", "friendRequest"])
    }

    func test_issue_withNothingChosen_sendsNothing() async {
        let (service, api) = makeSUT()

        do {
            _ = try await service.issue(offers: [])
            XCTFail("rien ne part tant que rien n'est choisi")
        } catch {
            XCTAssertEqual(error as? ContactExchangeError, .nothingChosen)
        }
        XCTAssertEqual(api.requestCount, 0)
    }

    func test_issue_aRouteThatDoesNotExist_isUnavailable_soTheScreenFallsBackOnTheQR() async {
        let (service, api) = makeSUT()
        api.stubError("/me/contact-exchange", error: MeeshyError.server(statusCode: 404, message: "Route not found"))

        do {
            _ = try await service.issue(offers: [.vitrine])
            XCTFail("un drapeau éteint ne doit pas passer pour un jeton")
        } catch {
            XCTAssertEqual(error as? ContactExchangeError, .unavailable)
        }
    }

    func test_issue_aServedTokenOutsideThePattern_isUnavailable() async {
        let (service, api) = makeSUT()
        api.stubWire("/me/contact-exchange", json: #"{"success":true,"data":{"token":"../users/me","expiresAt":"x","offers":["vitrine"],"locked":[]}}"#)

        do {
            _ = try await service.issue(offers: [.vitrine])
            XCTFail("un jeton hors motif ne voyage pas")
        } catch {
            XCTAssertEqual(error as? ContactExchangeError, .unavailable)
        }
    }

    // MARK: - Accepter

    func test_accept_readsTheIssuerFromTheServer_theShowcaseBio_andTheFriendRequestOutcome() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/contact-exchange/\(Self.token)/accept", json: """
        {"success":true,"data":{"issuer":{"id":"65a1b2c3d4e5f6a7b8c9d0e1","username":"sofia.b","displayName":"Sofia Benali","avatar":null},
        "offers":["vitrine","friendRequest"],"profile":{"bio":"Programmatrice de festival.","phoneNumber":"+33600000000"},
        "friendRequest":"not-sent","locked":["phone"]}}
        """)

        let accepted = try await service.accept(token: Self.token)

        XCTAssertEqual(accepted.issuer, ContactExchangePerson(id: "65a1b2c3d4e5f6a7b8c9d0e1", username: "sofia.b",
                                                               displayName: "Sofia Benali", avatar: nil))
        XCTAssertEqual(accepted.offers, [.vitrine, .friendRequest])
        XCTAssertEqual(accepted.bio, "Programmatrice de festival.")
        XCTAssertEqual(accepted.friendRequest, .notSent)
        XCTAssertEqual(api.lastRequest?.method, "POST")
    }

    func test_accept_withoutShowcase_hasNoBio_andNoFriendRequestOutcome() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/contact-exchange/\(Self.token)/accept", json: """
        {"success":true,"data":{"issuer":{"id":"65a1b2c3d4e5f6a7b8c9d0e1","username":"sofia.b","displayName":null,"avatar":null},
        "offers":["friendRequest","teleport"],"locked":["phone"]}}
        """)

        let accepted = try await service.accept(token: Self.token)

        XCTAssertNil(accepted.bio)
        XCTAssertNil(accepted.friendRequest)
        XCTAssertEqual(accepted.offers, [.friendRequest])
    }

    func test_accept_aTokenOutsideThePattern_neverLeaves() async {
        let (service, api) = makeSUT()

        do {
            _ = try await service.accept(token: "../../me")
            XCTFail("un jeton hors motif n'entre pas dans un chemin")
        } catch {
            XCTAssertEqual(error as? ContactExchangeError, .unavailable)
        }
        XCTAssertEqual(api.requestCount, 0)
    }

    func test_accept_theGenericRefusal_isUnavailable() async {
        let (service, api) = makeSUT()
        api.stubError("/contact-exchange/\(Self.token)/accept",
                      error: MeeshyError.server(statusCode: 404, message: "CONTACT_EXCHANGE_UNAVAILABLE"))

        do {
            _ = try await service.accept(token: Self.token)
            XCTFail("expiré, rejoué ou bloqué : un seul refus")
        } catch {
            XCTAssertEqual(error as? ContactExchangeError, .unavailable)
        }
    }
}
