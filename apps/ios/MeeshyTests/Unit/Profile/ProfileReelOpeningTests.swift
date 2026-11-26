import XCTest
import MeeshySDK
@testable import Meeshy

/// #18690 — l'auteur d'un réel de la liste du profil mène à sa fiche ou disparaît,
/// un réel s'ouvre au DÉPART de la feuille (jamais après un délai), et « Ma Légende »
/// répond à l'appui comme le reste du kit.
@MainActor
final class ProfileReelOpeningTests: XCTestCase {

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    // MARK: - L'auteur touché

    func test_authorTap_onTheListedAuthorsOwnReel_isAbsent() {
        let post = FeedPost(author: "Ana", authorId: "ana", authorUsername: "ana", content: "réel")

        XCTAssertNil(ProfileAuthorTap.action(for: post, listedUserId: "ana") { _ in })
    }

    func test_authorTap_onARepublishedReel_opensTheOriginalAuthorsProfile() {
        let media = FeedMedia(id: "m1", type: .video, url: "https://cdn/x.mp4")
        let original = RepostContent(author: "Bob", authorId: "bob", authorUsername: "bobby", content: "original", media: [media])
        let post = FeedPost(author: "Ana", authorId: "ana", authorUsername: "ana", content: "", repost: original)
        var opened: [ProfileSheetUser] = []

        let tap = ProfileAuthorTap.action(for: post, listedUserId: "ana") { opened.append($0) }
        tap?(ReelAuthorAttribution.authorId(of: post))

        XCTAssertEqual(opened.map(\.userId), ["bob"])
        XCTAssertEqual(opened.first?.username, "bobby")
    }

    func test_reelAuthor_isTheOriginalOnlyWhenTheRepostCarriesTheMedia() {
        let media = FeedMedia(id: "m1", type: .video, url: "https://cdn/x.mp4")
        let withMedia = RepostContent(author: "Bob", authorId: "bob", content: "o", media: [media])
        let withoutMedia = RepostContent(author: "Bob", authorId: "bob", content: "o")

        XCTAssertEqual(ReelAuthorAttribution.authorId(of: FeedPost(author: "Ana", authorId: "ana", content: "", repost: withMedia)), "bob")
        XCTAssertEqual(ReelAuthorAttribution.authorId(of: FeedPost(author: "Ana", authorId: "ana", content: "", repost: withoutMedia)), "ana")
    }

    func test_reelCard_authorRow_isAButtonOnlyWhenItLeadsSomewhere() throws {
        let card = try code("Meeshy/Features/Main/Views/ReelFeedCard.swift")
        XCTAssertTrue(card.contains("var onTapAuthor: ((String) -> Void)? = nil"))
        XCTAssertTrue(card.contains("if let onTapAuthor"))
        let list = try code("Meeshy/Features/Profile/Views/ProfileUserPostsList.swift")
        XCTAssertTrue(list.contains("onTapAuthor: ProfileAuthorTap.action(for: post, listedUserId: userId"))
    }

    // MARK: - Le réel s'ouvre au départ de la feuille

    func test_reelOpening_waitsForTheSheetToLeave_neverAClock() throws {
        let opening = try code("Meeshy/Features/Profile/Views/ProfilePostOpening.swift")
        XCTAssertFalse(opening.contains("asyncAfter"))
        XCTAssertFalse(opening.contains("static func openReel"))
        let hosts = [
            "Meeshy/Features/Main/Views/FeedPostCard.swift",
            "Meeshy/Features/Main/Views/GlobalSearchView.swift",
            "Meeshy/Features/Main/Views/PostDetailView.swift",
            "Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift",
            "Meeshy/Features/Main/Views/RootLayers/iPadRootViewLayers.swift",
        ]
        for host in hosts {
            let source = try code(host)
            XCTAssertFalse(source.contains("ProfilePostsOpener.openReel"), host)
        }
        let search = try code("Meeshy/Features/Main/Views/GlobalSearchView.swift")
        XCTAssertTrue(search.contains("departure.leave(dismissing: { dismiss() })"))
        XCTAssertTrue(search.contains("departure.sheetDidLeave()"))
    }

    // MARK: - Ma Légende répond à l'appui

    func test_progressionEntry_takesTheKitsPressStyle() throws {
        let entry = try code("Meeshy/Features/Profile/Views/ProfileProgressionEntry.swift")
        XCTAssertFalse(entry.contains(".buttonStyle(.plain)"))
        XCTAssertTrue(entry.contains(".buttonStyle(MeeshyGlassPressStyle())"))
        XCTAssertTrue(entry.contains("isInteractive: true"))
    }

    func test_decorEntry_isTheKitsToggleRow() throws {
        let decor = try code("Meeshy/Features/Profile/Views/ProfileDecorSheet.swift")
        XCTAssertTrue(decor.contains("MeeshyToggleRow(ProfileDecorEntry.title"))
    }
}
