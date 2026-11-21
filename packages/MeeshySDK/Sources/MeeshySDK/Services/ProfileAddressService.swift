import Foundation

/// Mes adresses (#18871) sur `/users/me/addresses` (#18863) : les lire, en ajouter, en modifier, en retirer et les
/// réordonner. Toujours le compte connecté ; une adresse d'autrui est un 404.
public protocol ProfileAddressProviding: Sendable {
    func list() async throws -> [ProfileAddress]
    func create(_ draft: ProfileAddressDraft) async throws -> ProfileAddress
    func update(id: String, _ draft: ProfileAddressDraft) async throws -> ProfileAddress
    func remove(id: String) async throws
    func reorder(ids: [String]) async throws -> [ProfileAddress]
}

/// La liste servie : `{ addresses: [...] }`.
struct ProfileAddressList: Decodable, Sendable {
    let addresses: [ProfileAddress]
}

private struct ProfileAddressOrder: Encodable, Sendable {
    let ids: [String]
}

public final class ProfileAddressService: ProfileAddressProviding, Sendable {
    public static let shared = ProfileAddressService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func list() async throws -> [ProfileAddress] {
        let response: APIResponse<ProfileAddressList> = try await api.request(
            UsersEndpoint.meAddresses, method: "GET", body: nil, queryItems: nil
        )
        return Self.ordered(response.data.addresses)
    }

    public func create(_ draft: ProfileAddressDraft) async throws -> ProfileAddress {
        let response: APIResponse<ProfileAddress> = try await api.post(UsersEndpoint.meAddresses, body: draft)
        return response.data
    }

    public func update(id: String, _ draft: ProfileAddressDraft) async throws -> ProfileAddress {
        let response: APIResponse<ProfileAddress> = try await api.patch(UsersEndpoint.meAddressesById(id: id), body: draft)
        return response.data
    }

    public func remove(id: String) async throws {
        _ = try await api.delete(UsersEndpoint.meAddressesById(id: id))
    }

    public func reorder(ids: [String]) async throws -> [ProfileAddress] {
        let response: APIResponse<ProfileAddressList> = try await api.put(
            UsersEndpoint.meAddressesOrder, body: ProfileAddressOrder(ids: ids)
        )
        return Self.ordered(response.data.addresses)
    }

    static func ordered(_ addresses: [ProfileAddress]) -> [ProfileAddress] {
        addresses.enumerated()
            .sorted { ($0.element.position, $0.offset) < ($1.element.position, $1.offset) }
            .map(\.element)
    }
}
