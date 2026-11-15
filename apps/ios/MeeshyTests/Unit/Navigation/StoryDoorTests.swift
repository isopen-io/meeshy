import XCTest
@testable import Meeshy
import MeeshySDK

/// **Un lien de story ouvre CETTE story, quelle que soit la porte** (#7807, #7808).
///
/// L'iPhone avait reçu le correctif #4903 : le `postId` voyage jusqu'au
/// lecteur, et une story absente du tray est chargée avant de conclure qu'elle
/// n'existe pas. L'iPad ouvrait le groupe sans `postId`, donc sur une AUTRE
/// story, ou le détail du post dès que le tray ignorait la story ; et un lien
/// tapé DANS l'app ouvrait toujours le détail. Toutes passent désormais par
/// `StoryDoor`.
@MainActor
final class StoryDoorTests: XCTestCase {

    private final class StubTray: StoryTrayResolving {
        var groups: [String: String]
        var loadable: [String: String]
        private(set) var ensureCalls: [String] = []

        init(groups: [String: String] = [:], loadable: [String: String] = [:]) {
            self.groups = groups
            self.loadable = loadable
        }

        func groupId(forStoryId storyId: String) -> String? { groups[storyId] }

        func ensureStoryLoaded(postId: String) async -> Bool {
            ensureCalls.append(postId)
            guard let group = loadable[postId] else { return false }
            groups[postId] = group
            return true
        }
    }

    private final class SpyViewer: StoryViewerCoordinating {
        private(set) var requests: [StoryViewerRequest] = []
        func present(_ request: StoryViewerRequest) { requests.append(request) }
    }

    func test_open_uneStoryDuTray_ouvreLeLecteurSurCetteStory_sansRequete() async {
        let tray = StubTray(groups: ["s1": "alice"])
        let viewer = SpyViewer()
        var detail = false

        await StoryDoor(tray: tray, viewer: viewer).open(postId: "s1") { detail = true }

        XCTAssertEqual(viewer.requests.first?.id, "alice")
        XCTAssertEqual(viewer.requests.first?.postId, "s1")
        XCTAssertEqual(viewer.requests.first?.startAtFirstUnviewed, false)
        XCTAssertTrue(tray.ensureCalls.isEmpty)
        XCTAssertFalse(detail)
    }

    /// Le cas NOMINAL du partage : la story reçue n'est pas dans le tray.
    func test_open_uneStoryAbsenteDuTray_estChargeePuisOuverteSurElleMeme() async {
        let tray = StubTray(loadable: ["s2": "bob"])
        let viewer = SpyViewer()
        var detail = false

        await StoryDoor(tray: tray, viewer: viewer).open(postId: "s2") { detail = true }

        XCTAssertEqual(tray.ensureCalls, ["s2"])
        XCTAssertEqual(viewer.requests.first?.id, "bob")
        XCTAssertEqual(viewer.requests.first?.postId, "s2")
        XCTAssertFalse(detail)
    }

    /// Expirée ou supprimée : le détail du post dit la bonne chose.
    func test_open_uneStoryIntrouvable_retombeSurLeDetail() async {
        let tray = StubTray()
        let viewer = SpyViewer()
        var detail = false

        await StoryDoor(tray: tray, viewer: viewer).open(postId: "s3") { detail = true }

        XCTAssertTrue(viewer.requests.isEmpty)
        XCTAssertTrue(detail)
    }
}
