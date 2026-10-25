import Foundation
import MeeshySDK

/// Le client des neuf routes de l'annuaire par appareil et du relais
/// d'enveloppes (#3706, spec E2EE libsignal § 3.3 et § 4.3). Il ne connaît ni
/// libsignal ni le trousseau : il transporte des clés publiques et des
/// enveloppes opaques. Chaque appel part au nom de la session courante, que la
/// passerelle lie à l'appareil.
public protocol E2EEDirectoryClientProviding: Sendable {
    func enroll(_ request: E2EEEnrollDeviceRequest) async throws -> E2EEEnrollment
    func publishKeys(deviceId: UInt32, _ request: E2EEPublishKeysRequest) async throws -> E2EEPreKeyStock
    func preKeyStock() async throws -> E2EEPreKeyStock
    func retireDevice(deviceId: UInt32) async throws -> E2EERetirement
    func bundles(userId: String, deviceIds: [UInt32]?) async throws -> E2EEUserBundles
    func devices(userId: String) async throws -> E2EEUserDevices
    /// MES appareils, avec leurs métadonnées (#13009). Une passerelle qui ne
    /// sert pas encore la route répond 404 : l'appelant retombe sur `devices`.
    func ownDevices() async throws -> [E2EEOwnDeviceDetails]
    func envelopes(after cursor: String?, limit: Int?) async throws -> E2EEEnvelopePage
    func acknowledge(envelopeIds: [String]) async throws -> E2EEAckResult
}

public final class E2EEDirectoryClient: E2EEDirectoryClientProviding {
    private let api: any APIClientProviding

    public init(api: any APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func enroll(_ request: E2EEEnrollDeviceRequest) async throws -> E2EEEnrollment {
        let response: APIResponse<E2EEEnrollment> = try await api.post(E2EeEndpoint.devices, body: request)
        return response.data
    }

    public func publishKeys(deviceId: UInt32, _ request: E2EEPublishKeysRequest) async throws -> E2EEPreKeyStock {
        let response: APIResponse<E2EEPreKeyStock> = try await api.put(
            E2EeEndpoint.devicesByDeviceIdKeys(deviceId: String(deviceId)),
            body: request
        )
        return response.data
    }

    public func preKeyStock() async throws -> E2EEPreKeyStock {
        let response: APIResponse<E2EEPreKeyStock> = try await api.request(E2EeEndpoint.devicesSelfPrekeyCount)
        return response.data
    }

    public func retireDevice(deviceId: UInt32) async throws -> E2EERetirement {
        let response: APIResponse<E2EERetirement> = try await api.request(
            E2EeEndpoint.devicesByDeviceId(deviceId: String(deviceId)),
            method: "DELETE"
        )
        return response.data
    }

    public func bundles(userId: String, deviceIds: [UInt32]?) async throws -> E2EEUserBundles {
        let query = deviceIds.map { ids in [URLQueryItem(name: "deviceIds", value: ids.map(String.init).joined(separator: ","))] }
        let response: APIResponse<E2EEUserBundles> = try await api.request(
            E2EeEndpoint.keysByUserId(userId: userId),
            method: "GET",
            body: nil,
            queryItems: query
        )
        return response.data
    }

    public func devices(userId: String) async throws -> E2EEUserDevices {
        let response: APIResponse<E2EEUserDevices> = try await api.request(E2EeEndpoint.keysByUserIdDevices(userId: userId))
        return response.data
    }

    public func ownDevices() async throws -> [E2EEOwnDeviceDetails] {
        let response: APIResponse<E2EEOwnDeviceList> = try await api.request(E2EeEndpoint.devices)
        return response.data.devices
    }

    public func envelopes(after cursor: String?, limit: Int?) async throws -> E2EEEnvelopePage {
        let query = [
            cursor.map { URLQueryItem(name: "after", value: $0) },
            limit.map { URLQueryItem(name: "limit", value: String($0)) },
        ].compactMap { $0 }
        let response: APIResponse<E2EEEnvelopePage> = try await api.request(
            E2EeEndpoint.envelopes,
            method: "GET",
            body: nil,
            queryItems: query.isEmpty ? nil : query
        )
        return response.data
    }

    public func acknowledge(envelopeIds: [String]) async throws -> E2EEAckResult {
        let response: APIResponse<E2EEAckResult> = try await api.post(E2EeEndpoint.envelopesAck, body: AckBody(ids: envelopeIds))
        return response.data
    }
}

private struct AckBody: Encodable {
    let ids: [String]
}
