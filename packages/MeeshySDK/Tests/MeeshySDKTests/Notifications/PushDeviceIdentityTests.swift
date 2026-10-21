import XCTest
@testable import MeeshySDK

final class PushDeviceIdentityTests: XCTestCase {

    private func makeKeychain() -> InMemoryPushIdentityKeychain { InMemoryPushIdentityKeychain() }

    // MARK: - installationId

    func test_installationId_firstCall_seedsFromVendorIdAndPersistsIt() {
        let keychain = makeKeychain()

        let id = PushDeviceIdentity.installationId(keychain: keychain, vendorId: { "VENDOR-1" })

        XCTAssertEqual(id, "VENDOR-1")
        XCTAssertEqual(keychain.load(forKey: PushDeviceIdentity.installationIdKey, account: nil), "VENDOR-1")
    }

    func test_installationId_storedValue_winsOverAChangedVendorId() {
        let keychain = makeKeychain()
        _ = PushDeviceIdentity.installationId(keychain: keychain, vendorId: { "VENDOR-BEFORE-REINSTALL" })

        let id = PushDeviceIdentity.installationId(keychain: keychain, vendorId: { "VENDOR-AFTER-REINSTALL" })

        XCTAssertEqual(id, "VENDOR-BEFORE-REINSTALL",
                       "A reinstall changes identifierForVendor; the keychain value must keep the device's identity")
    }

    func test_installationId_withoutVendorId_generatesAStableUUID() throws {
        let keychain = makeKeychain()

        let first = PushDeviceIdentity.installationId(keychain: keychain, vendorId: { nil })
        let second = PushDeviceIdentity.installationId(keychain: keychain, vendorId: { nil })

        XCTAssertNotNil(UUID(uuidString: first))
        XCTAssertEqual(first, second)
    }

    // MARK: - RegisterDeviceTokenRequest carries the device

    func test_registerDeviceTokenRequest_encodesTheDeviceIdentity() throws {
        let device = PushDeviceIdentity(
            deviceId: "install-42",
            deviceName: "iPhone16,2",
            appVersion: "1.4.0 (812)",
            bundleId: "me.meeshy.app"
        )
        let request = RegisterDeviceTokenRequest(
            token: "abc123def456",
            platform: "ios",
            type: "voip",
            apnsEnvironment: "production",
            device: device
        )

        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(json["deviceId"] as? String, "install-42")
        XCTAssertEqual(json["deviceName"] as? String, "iPhone16,2")
        XCTAssertEqual(json["appVersion"] as? String, "1.4.0 (812)")
        XCTAssertEqual(json["bundleId"] as? String, "me.meeshy.app")
        XCTAssertEqual(json["type"] as? String, "voip")
    }

    func test_registerDeviceTokenRequest_withoutDevice_omitsTheDeviceKeys() throws {
        let request = RegisterDeviceTokenRequest(token: "abc123def456")

        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertNil(json["deviceId"])
        XCTAssertNil(json["deviceName"])
        XCTAssertNil(json["appVersion"])
        XCTAssertNil(json["bundleId"])
    }

    // MARK: - current

    @MainActor
    func test_current_carriesThePersistedInstallationIdAndTheBundle() {
        let keychain = makeKeychain()
        try? keychain.save("install-7", forKey: PushDeviceIdentity.installationIdKey, account: nil)

        let identity = PushDeviceIdentity.current(keychain: keychain)

        XCTAssertEqual(identity.deviceId, "install-7")
        XCTAssertNotNil(identity.deviceName)
        XCTAssertLessThanOrEqual(identity.deviceName?.count ?? 0, 100)
        XCTAssertLessThanOrEqual(identity.appVersion?.count ?? 0, 50)
    }
}

private final class InMemoryPushIdentityKeychain: KeychainStoring, @unchecked Sendable {
    private var store: [String: String] = [:]

    func save(_ value: String, forKey key: String, account: String?) throws { store[key] = value }
    func load(forKey key: String, account: String?) -> String? { store[key] }
    func delete(forKey key: String, account: String?) { store.removeValue(forKey: key) }
    func saveAsync(_ value: String, forKey key: String, account: String?) async throws {
        try save(value, forKey: key, account: account)
    }
    func loadAsync(forKey key: String, account: String?) async -> String? { load(forKey: key, account: account) }
}
