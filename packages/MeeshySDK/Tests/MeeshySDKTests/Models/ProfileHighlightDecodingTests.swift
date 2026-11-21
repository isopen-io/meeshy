import XCTest
@testable import MeeshySDK

/// « À la une » (#19431, contrat serveur #19394) : un album se décode sans exiger ce que la passerelle peut taire, et
/// le rail ne montre qu'un album qui a un titre et au moins une story.
final class ProfileHighlightDecodingTests: XCTestCase {

    private func decode(_ json: String) throws -> [ProfileHighlight] {
        try JSONDecoder().decode([ProfileHighlight].self, from: Data(json.utf8))
    }

    func test_decode_aServedAlbum_keepsItsTitleGlyphCoverAndStories() throws {
        let albums = try decode(#"[{"id":"h1","title":"Lisbonne","glyph":"map-pin","coverUrl":"/c.jpg","storyIds":["s1","s2"]}]"#)
        XCTAssertEqual(albums, [ProfileHighlight(id: "h1", title: "Lisbonne", glyph: "map-pin", coverUrl: "/c.jpg",
                                                 storyIds: ["s1", "s2"])])
    }

    func test_decode_withoutOptionalFields_givesAnEmptyAlbum_insteadOfFailingTheWholeList() throws {
        let albums = try decode(#"[{"id":"h1"}]"#)
        XCTAssertEqual(albums.first?.title, "")
        XCTAssertEqual(albums.first?.storyIds, [])
        XCTAssertNil(albums.first?.glyph)
    }

    func test_shown_dropsAlbumsWithoutStoryOrTitle_andNothingServedMeansNoRail() {
        let kept = ProfileHighlight(id: "h1", title: "Nuit", storyIds: ["s1"])
        let empty = ProfileHighlight(id: "h2", title: "Lyon", storyIds: [])
        let untitled = ProfileHighlight(id: "h3", title: "  ", storyIds: ["s3"])
        XCTAssertEqual(ProfileHighlight.shown([kept, empty, untitled]), [kept])
        XCTAssertEqual(ProfileHighlight.shown(nil), [])
    }
}
