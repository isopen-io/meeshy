import XCTest
import MeeshySDK
@testable import Meeshy

/// Le jeton PushToTalk à la déconnexion (#17143, revue de sécurité) : il est retiré du serveur de façon ATTENDUE, même
/// sans canal instancié, le canal de ce compte est oublié, et un départ du canal qui suivrait ne retire rien deux fois —
/// les talkies du compte précédent ne réveillent jamais l'appareil du suivant.
@MainActor
final class TalkiePushToTalkChannelTests: XCTestCase {

    actor FakeRegistrar: TalkiePushToTalkTokenRegistering {
        private(set) var registered: [String] = []
        private(set) var unregistered: [String] = []

        func register(token: String) async throws { registered.append(token) }
        func unregister(token: String) async throws { unregistered.append(token) }
    }

    private func makeDefaults() throws -> UserDefaults {
        try XCTUnwrap(UserDefaults(suiteName: "talkie-ptt-\(UUID().uuidString)"))
    }

    func test_aReceivedToken_isRegistered_andKeptOnTheDevice() async throws {
        let registrar = FakeRegistrar()
        let sut = TalkiePushToTalkChannel(registrar: registrar, defaults: try makeDefaults())

        await sut.tokenReceived("0aff")

        let registered = await registrar.registered
        XCTAssertEqual(registered, ["0aff"])
        XCTAssertEqual(sut.storedToken, "0aff")
    }

    func test_endSession_unregistersTheStoredToken_evenWithoutAChannelManager() async throws {
        let registrar = FakeRegistrar()
        let defaults = try makeDefaults()
        defaults.set("0aff", forKey: TalkiePushToTalkRules.tokenDefaultsKey)
        let sut = TalkiePushToTalkChannel(registrar: registrar, defaults: defaults)
        let channelBefore = sut.channelUUID

        await sut.endSession()

        let unregistered = await registrar.unregistered
        XCTAssertEqual(unregistered, ["0aff"])
        XCTAssertNil(sut.storedToken)
        XCTAssertNotEqual(sut.channelUUID, channelBefore)
    }

    func test_aChannelLeftAfterTheSessionEnded_unregistersNothingMore() async throws {
        let registrar = FakeRegistrar()
        let defaults = try makeDefaults()
        defaults.set("0aff", forKey: TalkiePushToTalkRules.tokenDefaultsKey)
        let sut = TalkiePushToTalkChannel(registrar: registrar, defaults: defaults)

        await sut.endSession()
        await sut.channelLeft()

        let unregistered = await registrar.unregistered
        XCTAssertEqual(unregistered, ["0aff"])
    }

    func test_endSession_withoutToken_callsNothing() async throws {
        let registrar = FakeRegistrar()
        let sut = TalkiePushToTalkChannel(registrar: registrar, defaults: try makeDefaults())

        await sut.endSession()

        let unregistered = await registrar.unregistered
        XCTAssertTrue(unregistered.isEmpty)
    }

    /// Recette du 2026-11-09 : sans environnement déclaré, la passerelle rangeait le jeton d'une build de
    /// développement en `production`, Apple répondait `BadEnvironmentKeyInToken` et le réveil n'arrivait jamais.
    func test_registrationBody_declaresTheBuildApnsEnvironmentAndBundle() throws {
        let body = TalkiePushToTalkRegistration(token: "abcdef0123456789")
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(body)) as? [String: Any])

        XCTAssertEqual(json["token"] as? String, "abcdef0123456789")
        XCTAssertEqual(json["apnsEnvironment"] as? String, PushNotificationManager.apnsEnvironment)
        XCTAssertEqual(json["bundleId"] as? String, Bundle.main.bundleIdentifier)
    }
}
