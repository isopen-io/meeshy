import Testing
import Foundation
@testable import MeeshyUI

/// #19780 — la fiche de profil garde sa bannière DANS la barre repliée : pleine tout du long, le verre arrive
/// par-dessus et la floute, ses coins bas prennent ceux de la barre. Les autres hôtes de K28 gardent l'effacement.
@Suite("MeeshyCollapsingHero · bannière gardée dans la barre")
struct MeeshyCollapsingHeroBannerInBarTests {

    private static let steps: [Double] = [0, 0.35, 0.5, 0.7, 1]

    @Test("gardée : la bannière reste pleine à toute avancée, repliée comprise")
    func kept_bannerStaysFull() {
        for progress in Self.steps {
            let recipe = MeeshyCollapsingHeroRecipe.resolve(progress: progress)
            #expect(MeeshyCollapsingHeroRecipe.bannerOpacity(recipe, keepsBannerInBar: true) == 1, "\(progress)")
        }
    }

    @Test("effacée : la loi d'origine, nulle une fois la barre posée")
    func faded_followsTheOriginalLaw() {
        for progress in Self.steps {
            let recipe = MeeshyCollapsingHeroRecipe.resolve(progress: progress)
            #expect(MeeshyCollapsingHeroRecipe.bannerOpacity(recipe, keepsBannerInBar: false) == recipe.bannerOpacity)
        }
        let collapsed = MeeshyCollapsingHeroRecipe.resolve(progress: 1)
        #expect(MeeshyCollapsingHeroRecipe.bannerOpacity(collapsed, keepsBannerInBar: false) == 0)
    }

    @Test("coins : droits dépliée, ceux de la barre une fois repliée ; toujours droits pour une bannière effacée")
    func corners_followTheGlass() {
        let open = MeeshyCollapsingHeroRecipe.resolve(progress: 0)
        let closed = MeeshyCollapsingHeroRecipe.resolve(progress: 1)
        #expect(MeeshyCollapsingHeroRecipe.bannerCornerRadius(open, keepsBannerInBar: true) == 0)
        #expect(MeeshyCollapsingHeroRecipe.bannerCornerRadius(closed, keepsBannerInBar: true)
                == MeeshyCollapsingHeroRecipe.barCornerRadius)
        #expect(MeeshyCollapsingHeroRecipe.bannerCornerRadius(closed, keepsBannerInBar: false) == 0)
    }

    @Test("ma fiche et celle d'un autre gardent leur bannière dans la barre")
    func bothProfileHosts_keepTheBanner() throws {
        let sdk = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
        let other = try String(contentsOf: sdk.appendingPathComponent("Sources/MeeshyUI/Profile/UserProfileSheet+Header.swift"),
                               encoding: .utf8)
        let mine = try String(contentsOf: sdk.deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("apps/ios/Meeshy/Features/Profile/Views/ProfileView.swift"), encoding: .utf8)
        #expect(other.contains("keepsBannerInBar: true"))
        #expect(mine.contains("keepsBannerInBar: true"))
    }
}
