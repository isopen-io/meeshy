import XCTest
import MeeshySDK
@testable import Meeshy

/// **« Mes proches » : quatre avatars sur l'accueil, un appui ouvre la vitrine, et le raccourci Talkie propose les mêmes
/// personnes** (planche `Hors-App`, vues 3 et 4, #19524).
@MainActor
final class ClosePeopleWidgetTests: XCTestCase {

    private func link(_ id: String, _ level: RelationLevel) -> RelationLink {
        RelationLink(userId: id, effectiveLevel: level, grantedByMe: level)
    }

    private func person(_ id: String, _ name: String, username: String? = nil) -> CirclePerson {
        CirclePerson(id: id, name: name, username: username, avatarURL: nil)
    }

    private func makeManager() throws -> (WidgetDataManager, UserDefaults, String) {
        let suite = "group.test.meeshy.close.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        let manager = WidgetDataManager(suiteName: suite, stagingDirectories: [], presenceState: { id in
            id == "leo" ? .online : nil
        })
        return (manager, defaults, suite)
    }

    // MARK: - Qui entre

    func test_onlyCloseAndAbove_enter_bloodFirst_thenByName() {
        let links = [
            link("ami", .friend), link("yuki", .close), link("mina", .blood),
            link("kwame", .close), link("connu", .acquaintance),
        ]
        let people = [
            "ami": person("ami", "Ami"), "yuki": person("yuki", "Yuki"), "mina": person("mina", "Mina"),
            "kwame": person("kwame", "Kwame"), "connu": person("connu", "Connu"),
        ]

        let result = ClosePeopleWidgetProjection.people(links: links, people: people, presence: { _ in nil })

        XCTAssertEqual(result.map(\.id), ["mina", "kwame", "yuki"], "sous Proche, personne n'entre")
        XCTAssertEqual(result.map(\.level), ["BLOOD", "CLOSE", "CLOSE"])
    }

    func test_anUnnamedCloseOne_isLeftOut_neverShownAsSomeone() {
        let result = ClosePeopleWidgetProjection.people(
            links: [link("leo", .close), link("x", .close)],
            people: ["leo": person("leo", "Léo")],
            presence: { _ in nil }
        )
        XCTAssertEqual(result.map(\.id), ["leo"])
    }

    func test_presence_isOnlyWhatWasServed() {
        let result = ClosePeopleWidgetProjection.people(
            links: [link("leo", .close), link("mina", .close)],
            people: ["leo": person("leo", "Léo"), "mina": person("mina", "Mina")],
            presence: { $0 == "leo" ? .away : nil }
        )
        XCTAssertEqual(result.first { $0.id == "leo" }?.presence, PresenceState.away.rawValue)
        XCTAssertNil(result.first { $0.id == "mina" }?.presence, "une présence non servie ne se fabrique pas")
    }

    func test_atMostEightArePublished() {
        let ids = (0..<12).map { "p\($0)" }
        let result = ClosePeopleWidgetProjection.people(
            links: ids.map { link($0, .close) },
            people: Dictionary(uniqueKeysWithValues: ids.map { ($0, person($0, $0)) }),
            presence: { _ in nil }
        )
        XCTAssertEqual(result.count, ClosePeopleWidgetKeys.publishedCap)
    }

    // MARK: - Ce qui part au groupe d'app

    func test_publish_writesTheKeyTheWidgetAndTheShortcutRead() throws {
        let (manager, defaults, _) = try makeManager()

        ClosePeopleWidgetFeed.publish(links: [link("leo", .close)],
                                      people: ["leo": person("leo", "Léo", username: "leo.m")],
                                      manager: manager)

        let decoded = ClosePeopleWidgetKeys.decode(defaults.data(forKey: ClosePeopleWidgetKeys.defaultsKey))
        XCTAssertEqual(decoded.map(\.id), ["leo"])
        XCTAssertEqual(decoded.first?.username, "leo.m")
        XCTAssertEqual(decoded.first?.presence, PresenceState.online.rawValue, "la présence servie au gestionnaire")
    }

    func test_publishingNobody_removesTheList_andLogoutWipesIt() throws {
        let (manager, defaults, _) = try makeManager()
        ClosePeopleWidgetFeed.publish(links: [link("leo", .close)], people: ["leo": person("leo", "Léo")], manager: manager)

        ClosePeopleWidgetFeed.publish(links: [], people: [:], manager: manager)
        XCTAssertNil(defaults.object(forKey: ClosePeopleWidgetKeys.defaultsKey))

        ClosePeopleWidgetFeed.publish(links: [link("leo", .close)], people: ["leo": person("leo", "Léo")], manager: manager)
        manager.wipeAll()
        XCTAssertNil(defaults.object(forKey: ClosePeopleWidgetKeys.defaultsKey), "rien ne survit au compte")
    }

    func test_anUnreadableList_readsAsNobody() {
        XCTAssertEqual(ClosePeopleWidgetKeys.decode(Data("pas du json".utf8)), [])
        XCTAssertEqual(ClosePeopleWidgetKeys.decode(nil), [])
    }

    // MARK: - Raccourci Talkie

    func test_talkieShortcut_offersThePublishedCloseOnes_withAVitrine() throws {
        let (manager, _, suite) = try makeManager()
        ClosePeopleWidgetFeed.publish(
            links: [link("leo", .close), link("mina", .blood)],
            people: ["leo": person("leo", "Léo", username: "leo.m"), "mina": person("mina", "Mina")],
            manager: manager
        )

        let offered = ClosePersonQuery.published(suiteName: suite)

        XCTAssertEqual(offered.map(\.id), ["leo"], "sans pseudo, pas de vitrine à ouvrir")
        XCTAssertEqual(offered.first?.username, "leo.m")
    }

    // MARK: - Un appui ouvre la vitrine

    func test_vitrineURL_isTheProfileRoute() {
        XCTAssertEqual(VitrineOpenRouter.vitrineURL(username: " leo.m ")?.absoluteString, "meeshy://u/leo.m")
        XCTAssertNil(VitrineOpenRouter.vitrineURL(username: "  "))
        let url = VitrineOpenRouter.vitrineURL(username: "leo.m")
        XCTAssertEqual(url.flatMap { DeepLinkParser.parse($0) }, .userProfile(username: "leo.m"))
    }

    func test_aTapBeforeTheAppIsReady_waits_thenOpensOnce() throws {
        let url = try XCTUnwrap(VitrineOpenRouter.vitrineURL(username: "leo.m"))
        let relay = VitrineOpenRelay()
        var opened: [URL] = []
        relay.open(url)
        XCTAssertEqual(opened, [])

        relay.install { opened.append($0) }
        XCTAssertEqual(opened, [url], "la vitrine demandée au démarrage à froid part au branchement")

        relay.install { opened.append($0) }
        XCTAssertEqual(opened, [url], "jamais deux fois")
    }
}
