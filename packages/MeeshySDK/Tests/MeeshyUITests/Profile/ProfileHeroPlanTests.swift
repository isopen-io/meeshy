import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #19410 — l'en-tête de la fiche d'un autre est K28 sur une bannière K27 : un seul nombre, l'avancée du doigt,
/// mène le repli ; la barre repliée prend la pilule de relation ; sans photo ni décor, la bannière est vivante.
final class ProfileHeroPlanTests: XCTestCase {

    func test_progress_atRest_isZero() {
        XCTAssertEqual(ProfileHeroPlan.progress(scrollOffset: 0), 0, accuracy: 0.0001)
    }

    func test_progress_scrolledTheWholeDistance_isFullyCollapsed() {
        let distance = MeeshyCollapsingHeroRecipe.scrollDistance(expandedHeight: ProfileHeroPlan.expandedHeight,
                                                                 collapsedHeight: ProfileHeroPlan.collapsedHeight)
        XCTAssertEqual(ProfileHeroPlan.progress(scrollOffset: -distance), 1, accuracy: 0.0001)
    }

    func test_progress_pulledDown_isNegative_soOnlyTheBannerStretches() {
        let pulled = ProfileHeroPlan.progress(scrollOffset: 60)
        XCTAssertLessThan(pulled, 0)
        let recipe = MeeshyCollapsingHeroRecipe.resolve(progress: pulled,
                                                        expandedHeight: ProfileHeroPlan.expandedHeight,
                                                        collapsedHeight: ProfileHeroPlan.collapsedHeight)
        XCTAssertGreaterThan(recipe.bannerStretch, 0)
        XCTAssertEqual(recipe.height, ProfileHeroPlan.expandedHeight, accuracy: 0.0001)
    }

    func test_progress_notANumber_isZero() {
        XCTAssertEqual(ProfileHeroPlan.progress(scrollOffset: .nan), 0)
    }

    func test_content_startsUnderTheIdentity_andMeetsTheBarWhenCollapsed() {
        let distance = MeeshyCollapsingHeroRecipe.scrollDistance(expandedHeight: ProfileHeroPlan.expandedHeight,
                                                                 collapsedHeight: ProfileHeroPlan.collapsedHeight)
        XCTAssertEqual(ProfileHeroPlan.contentTop - distance, ProfileHeroPlan.collapsedHeight, accuracy: 0.0001)
    }

    func test_collapsedBar_holdsTheControlsBelowTheSheetTop() {
        XCTAssertGreaterThanOrEqual(ProfileHeroPlan.collapsedHeight,
                                    ProfileHeroPlan.topInset + MeeshyCollapsingHeroRecipe.controlTarget)
    }

    func test_relationPill_joinsTheBar_onlyOnceTheBarOwnsTheIdentity() {
        XCTAssertFalse(ProfileHeroPlan.barShowsRelation(progress: 0))
        XCTAssertFalse(ProfileHeroPlan.barShowsRelation(progress: 0.5))
        XCTAssertTrue(ProfileHeroPlan.barShowsRelation(progress: 0.51))
        XCTAssertTrue(ProfileHeroPlan.barShowsRelation(progress: 1))
    }

    func test_banner_withoutPhotoOrDesign_isTheLivingBanner() {
        XCTAssertEqual(ProfileHeroPlan.banner(.plain, isBlockedByTarget: false), .living(isMuted: false))
    }

    func test_banner_withoutPhotoOrDesign_isMutedWhenTheTargetBlockedMe() {
        XCTAssertEqual(ProfileHeroPlan.banner(.plain, isBlockedByTarget: true), .living(isMuted: true))
    }

    func test_banner_photo_isKept() {
        XCTAssertEqual(ProfileHeroPlan.banner(.photo("https://x/b.jpg"), isBlockedByTarget: false),
                       .photo("https://x/b.jpg"))
    }

    func test_storyRing_isKeptOnTheBigAvatar_andDroppedInTheBar() {
        XCTAssertEqual(ProfileHeroPlan.storyRing(.unread, avatarSize: MeeshyCollapsingHeroRecipe.avatarExpanded), .unread)
        XCTAssertEqual(ProfileHeroPlan.storyRing(.read, avatarSize: MeeshyCollapsingHeroRecipe.avatarCollapsed), .none)
        XCTAssertEqual(ProfileHeroPlan.storyRing(.none, avatarSize: MeeshyCollapsingHeroRecipe.avatarExpanded), .none)
    }

    func test_livingBanner_fillsTheStretch_whenPulledDown() {
        XCTAssertEqual(ProfileHeroPlan.bannerHeight(progress: 0), ProfileHeroPlan.expandedHeight, accuracy: 0.0001)
        XCTAssertEqual(ProfileHeroPlan.bannerHeight(progress: 0.6), ProfileHeroPlan.expandedHeight, accuracy: 0.0001)
        let pulled = ProfileHeroPlan.progress(scrollOffset: 40)
        XCTAssertEqual(ProfileHeroPlan.bannerHeight(progress: pulled), ProfileHeroPlan.expandedHeight + 40, accuracy: 0.0001)
    }

    /// Loi 12 : l'en-tête est fait du kit — K28 replie, K27 peint sans photo ; rien n'est redessiné sur place.
    func test_header_isMadeOfTheKit() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Profile/UserProfileSheet+Header.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(code.contains("MeeshyCollapsingHero("), "le héros est K28")
        XCTAssertTrue(code.contains("MeeshyLivingBanner("), "sans photo ni décor, la bannière est K27")
        XCTAssertTrue(code.contains("MeeshyGlassButton("), "« Fermer » est un bouton de verre du kit (K02)")
        XCTAssertFalse(code.contains("LinearGradient("), "aucun dégradé dessiné sur place")
        XCTAssertFalse(code.contains(".scaleEffect("), "aucun repli interpolé à la main")
        XCTAssertFalse(code.contains("compactPinnedBar"), "la barre repliée est celle de K28")
    }
}
