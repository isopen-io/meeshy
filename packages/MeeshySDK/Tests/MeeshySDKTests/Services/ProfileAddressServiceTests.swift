import XCTest
@testable import MeeshySDK

/// Mes adresses sur le fil (#18871) : le contrat que la passerelle sert depuis #18863.
final class ProfileAddressServiceTests: XCTestCase {

    private func makeService() -> (ProfileAddressService, MockAPIClient) {
        let mock = MockAPIClient()
        return (ProfileAddressService(api: mock), mock)
    }

    private let twoAddresses = """
    {"success":true,"data":{"addresses":[
      {"id":"b","title":"Musique","url":"https://soundcloud.com/aissa","glyph":"music","circle":"FRIEND","position":1,"isShown":true,"clicks":4},
      {"id":"a","title":"Site","url":"https://aissandiaye.studio/","glyph":"site","circle":"PUBLIC","position":0,"isShown":true,"clicks":12}
    ]}}
    """

    private let oneAddress = """
    {"success":true,"data":{"id":"c","title":"Photos","url":"https://instagram.com/aissa.snd","glyph":"photos","circle":"PUBLIC","position":2,"isShown":true}}
    """

    func test_list_readsMyAddressesInTheirOrder() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/users/me/addresses", json: twoAddresses)

        let addresses = try await service.list()

        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/me/addresses")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(addresses.map(\.id), ["a", "b"])
        XCTAssertEqual(addresses.first?.clicks, 12)
    }

    func test_create_postsOnlyTheFieldsItCarries() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/users/me/addresses", json: oneAddress)

        let created = try await service.create(ProfileAddressDraft(url: "instagram.com/aissa.snd", title: "Photos",
                                                                    glyph: .photos, circle: .public))

        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["glyph"] as? String, "photos")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["circle"] as? String, "PUBLIC")
        XCTAssertNil(mock.lastRequest?.bodyJSON?["isShown"])
        XCTAssertEqual(created.id, "c")
    }

    func test_update_patchesTheAddressById() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/users/me/addresses/c", json: oneAddress)

        _ = try await service.update(id: "c", ProfileAddressDraft(isShown: false))

        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/me/addresses/c")
        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["isShown"] as? Bool, false)
    }

    func test_remove_deletesTheAddressById() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/users/me/addresses/c", json: #"{"success":true,"data":{"deleted":true}}"#)

        try await service.remove(id: "c")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/me/addresses/c")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    func test_reorder_sendsEveryIdOnceAndReadsTheNewOrder() async throws {
        let (service, mock) = makeService()
        mock.stubWire("/users/me/addresses/order", json: twoAddresses)

        let addresses = try await service.reorder(ids: ["a", "b"])

        XCTAssertEqual(mock.lastRequest?.method, "PUT")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["ids"] as? [String], ["a", "b"])
        XCTAssertEqual(addresses.map(\.id), ["a", "b"])
    }
}
