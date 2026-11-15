import XCTest
import MeeshyUI
@testable import Meeshy

/// #16332 — **la baguette IMAGE, l'icône de post COMPOSE.**
///
/// Demande porteur, la même sur iOS, web et Android : la baguette magique
/// ouvrait la composition (« Composer ») ; elle devient l'action « Imager » des
/// rails d'actions — plein écran (le message et sa pièce jointe), réel, story.
/// La composition prend l'icône du POST, `square.and.pencil`, celle que l'app
/// donne déjà au type post (`PostType.post.symbol`). Dans les menus, « Imager »
/// garde son icône d'image.
@MainActor
final class WandImagerVocabularyTests: XCTestCase {

    // MARK: - Les symboles

    func test_composeSymbol_isThePostIcon() {
        XCTAssertEqual(FullscreenChromeSymbol.compose, "square.and.pencil")
        XCTAssertEqual(MessageActionVerb.compose.symbol, FullscreenChromeSymbol.compose)
    }

    func test_railImagerSymbol_isTheWand() {
        XCTAssertEqual(FullscreenChromeSymbol.imager, "wand.and.stars")
    }

    func test_menuImager_keepsItsImageIcon() {
        XCTAssertEqual(MessageActionVerb.imager.symbol, "photo.on.rectangle.angled")
        XCTAssertEqual(MessageCardExportMenu.imageSymbol, "photo.on.rectangle.angled")
    }

    // MARK: - Le rail de la story porte « Imager »

    func test_storyRail_publishedStory_offersImagerToEveryReader() {
        let own = StoryActionRailPlan.resolve(isOwnStory: true, canReply: false, isPublicStory: true,
                                              hasAudibleSound: false, commentCount: 0, hasTranslatableContent: false)
        let other = StoryActionRailPlan.resolve(isOwnStory: false, canReply: true, isPublicStory: true,
                                                hasAudibleSound: false, commentCount: 0, hasTranslatableContent: false)

        XCTAssertTrue(own.showsImager)
        XCTAssertTrue(other.showsImager)
    }

    func test_storyRail_pendingStory_offersNoImager() {
        let pending = StoryActionRailPlan.resolve(isOwnStory: true, canReply: false, isPublicStory: true,
                                                  hasAudibleSound: false, commentCount: 0, hasTranslatableContent: false,
                                                  isPending: true)

        XCTAssertFalse(pending.showsImager)
    }

    // MARK: - Plus aucune baguette n'ouvre la composition

    /// Les sites qui dessinent « Composer » ou « Studio » ne nomment plus la
    /// baguette : ils lisent `FullscreenChromeSymbol.compose`. Garde de source,
    /// la seule mesure d'un glyphe passé à un `Label`.
    func test_composeEntries_noLongerDrawTheWand() throws {
        let sites = [
            "Meeshy/Features/Stories/Views/StoryViewerView+Header.swift",
            "Meeshy/Features/Share/ShareSheetView+Actions.swift",
        ]
        for site in sites {
            let code = try MyStoriesSourceCorpus.text(of: site)
            XCTAssertFalse(code.contains("systemImage: \"wand.and.stars\""),
                           "\(site) : la baguette ne désigne plus la composition")
        }
        let rail = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Stories/Views/StoryViewerView+Sidebar.swift")
        XCTAssertTrue(rail.contains("icon: FullscreenChromeSymbol.compose"),
                      "le « Composer » du rail de story porte l'icône de post")
        XCTAssertTrue(rail.contains("icon: FullscreenChromeSymbol.imager"),
                      "le rail de story porte la baguette « Imager »")
    }

    /// Le rail du réel et celui du plein écran montent la baguette « Imager ».
    func test_reelAndFullscreenRails_carryTheImagerWand() throws {
        let reel = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/ReelsPlayerView+ActionRail.swift")
        let gallery = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/ConversationMediaGalleryView+Actions.swift")

        XCTAssertTrue(reel.contains("systemImage: FullscreenChromeSymbol.imager"))
        XCTAssertTrue(gallery.contains("systemImage: FullscreenChromeSymbol.imager"))
    }
}
