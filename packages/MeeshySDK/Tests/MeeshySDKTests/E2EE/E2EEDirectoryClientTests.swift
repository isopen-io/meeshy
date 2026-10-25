import Foundation
import Testing
@testable import MeeshyE2EE
@testable import MeeshySDK

@Suite("Le client de l'annuaire E2EE parle les huit routes /e2ee")
struct E2EEDirectoryClientTests {
    private let user = String(repeating: "b2", count: 12)
    private let signed = #"{"keyId":1,"publicKey":"cHVi","signature":"c2ln"}"#

    @Test func enrollPostsTheRequestAndReturnsTheDeviceNumber() async throws {
        let api = MockE2EEAPIClient()
        api.respond("POST", "/api/v1/e2ee/devices", json: #"{"success":true,"data":{"deviceId":3,"created":true}}"#)
        let request = E2EEEnrollDeviceRequest(
            registrationId: 42, identityKey: "aWs=",
            signedPreKey: E2EESignedKey(keyId: 1, publicKey: "cHVi", signature: "c2ln"),
            kyberLastResort: E2EESignedKey(keyId: 2, publicKey: "a3li", signature: "c2ln"),
            platform: .ios, label: nil,
            binding: E2EEDeviceBindingProof(timestamp: 7, signature: "c2ln"),
            oneTimePreKeys: [], kyberPreKeys: []
        )

        let enrolled = try await E2EEDirectoryClient(api: api).enroll(request)

        #expect(enrolled == E2EEEnrollment(deviceId: 3, created: true))
        let body = try #require(api.sent.first?.body)
        #expect(body.contains(#""registrationId":42"#))
        #expect(!body.contains("label"))
        #expect(!body.lowercased().contains("private"))
    }

    @Test func publishKeysTargetsItsOwnDeviceRoute() async throws {
        let api = MockE2EEAPIClient()
        api.respond("PUT", "/api/v1/e2ee/devices/3/keys", json: #"{"success":true,"data":{"deviceId":3,"oneTimePreKeys":5,"kyberPreKeys":5}}"#)

        let stock = try await E2EEDirectoryClient(api: api).publishKeys(
            deviceId: 3, E2EEPublishKeysRequest(oneTimePreKeys: [E2EEOneTimeKey(keyId: 9, publicKey: "cGs=")])
        )

        #expect(stock == E2EEPreKeyStock(deviceId: 3, oneTimePreKeys: 5, kyberPreKeys: 5))
        #expect(api.sent.map(\.method) == ["PUT"])
    }

    @Test func stockRetirementAndListingUseTheirRoutes() async throws {
        let api = MockE2EEAPIClient()
        api.respond("GET", "/api/v1/e2ee/devices/self/prekey-count", json: #"{"success":true,"data":{"deviceId":1,"oneTimePreKeys":0,"kyberPreKeys":2}}"#)
        api.respond("DELETE", "/api/v1/e2ee/devices/2", json: #"{"success":true,"data":{"deviceId":2,"retired":true}}"#)
        api.respond("GET", "/api/v1/e2ee/keys/\(user)/devices", json: #"{"success":true,"data":{"userId":"\#(user)","devices":[{"deviceId":1,"registrationId":7}]}}"#)
        let client = E2EEDirectoryClient(api: api)

        #expect(try await client.preKeyStock().kyberPreKeys == 2)
        #expect(try await client.retireDevice(deviceId: 2) == E2EERetirement(deviceId: 2, retired: true))
        #expect(try await client.devices(userId: user).devices == [E2EEDeviceListing(deviceId: 1, registrationId: 7)])
    }

    @Test func ownDevicesReadMyListWithItsMetadataAndToleratesAnUnknownPlatform() async throws {
        let api = MockE2EEAPIClient()
        api.respond("GET", "/api/v1/e2ee/devices", json: #"{"success":true,"data":{"devices":[{"deviceId":1,"registrationId":7,"platform":"ios","label":"iPhone","createdAt":"2026-10-25T12:00:00.000Z","lastSeenAt":"2026-10-25T13:00:00.000Z","current":true},{"deviceId":2,"registrationId":9,"platform":"visionos","label":null,"createdAt":"2026-10-24T12:00:00.000Z","lastSeenAt":"2026-10-24T12:00:00.000Z","current":false}]}}"#)

        let devices = try await E2EEDirectoryClient(api: api).ownDevices()

        #expect(api.sent.map(\.method) == ["GET"])
        #expect(devices.map(\.deviceId) == [1, 2])
        #expect(devices[0].platform == .ios)
        #expect(devices[0].label == "iPhone")
        #expect(devices[0].current)
        #expect(devices[0].createdAt == Date(timeIntervalSince1970: 1_792_929_600))
        #expect(devices[1].platform == nil)
        #expect(devices[1].label == nil)
        #expect(!devices[1].current)
    }

    @Test func bundlesNameTheRequestedDevicesAndAcceptAMissingOneTimeKey() async throws {
        let api = MockE2EEAPIClient()
        let bundle = #"{"deviceId":2,"registrationId":7,"identityKey":"aWs=","signedPreKey":\#(signed),"kyberPreKey":{"keyId":1,"publicKey":"cHVi","signature":"c2ln","lastResort":true},"preKey":null}"#
        api.respond("GET", "/api/v1/e2ee/keys/\(user)", json: #"{"success":true,"data":{"userId":"\#(user)","devices":[\#(bundle)]}}"#)

        let bundles = try await E2EEDirectoryClient(api: api).bundles(userId: user, deviceIds: [2, 5])

        #expect(bundles.devices.first?.preKey == nil)
        #expect(bundles.devices.first?.kyberPreKey.lastResort == true)
        #expect(api.sent.first?.query == ["deviceIds": "2,5"])
    }

    @Test func envelopesArePagedByCursorThenAcknowledged() async throws {
        let api = MockE2EEAPIClient()
        let envelope = #"{"id":"e1","messageId":"m1","conversationId":"c1","recipientRegistrationId":7,"senderUserId":"\#(user)","senderDeviceId":1,"type":3,"body":"Y2lwaGVy","createdAt":"2026-10-24T00:00:00.000Z"}"#
        api.respond("GET", "/api/v1/e2ee/envelopes", json: #"{"success":true,"data":{"envelopes":[\#(envelope)],"nextCursor":"e1"}}"#)
        api.respond("POST", "/api/v1/e2ee/envelopes/ack", json: #"{"success":true,"data":{"deleted":1}}"#)
        let client = E2EEDirectoryClient(api: api)

        let page = try await client.envelopes(after: "e0", limit: 50)
        let ack = try await client.acknowledge(envelopeIds: page.envelopes.map(\.id))

        #expect(page.nextCursor == "e1")
        #expect(ack.deleted == 1)
        #expect(api.sent.first?.query == ["after": "e0", "limit": "50"])
        #expect(api.sent.last?.body == #"{"ids":["e1"]}"#)
    }

    @Test func anEnvelopeForAnotherGenerationOfTheSlotIsNotForMe() throws {
        let json = #"{"id":"e1","messageId":"m1","conversationId":"c1","recipientRegistrationId":7,"senderUserId":"u","senderDeviceId":1,"type":3,"body":"eA==","createdAt":"t"}"#
        let envelope = try JSONDecoder().decode(E2EEServedEnvelope.self, from: Data(json.utf8))

        #expect(envelope.isAddressed(to: 7))
        #expect(!envelope.isAddressed(to: 8))
    }
}
