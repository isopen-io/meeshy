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

    @Test("#19925 : la fiche se replie en barre DROITE — bannière et verre sans coin arrondi, dépliée comme repliée")
    func corners_profileBarIsSquare() {
        for progress in Self.steps {
            let recipe = MeeshyCollapsingHeroRecipe.resolve(progress: progress)
            #expect(MeeshyCollapsingHeroRecipe.bannerCornerRadius(recipe, keepsBannerInBar: true) == 0)
            #expect(MeeshyCollapsingHeroRecipe.bannerCornerRadius(recipe, keepsBannerInBar: false) == 0)
        }
        #expect(MeeshyCollapsingHeroRecipe.glassCornerRadius(keepsBannerInBar: true) == 0)
        #expect(MeeshyCollapsingHeroRecipe.glassCornerRadius(keepsBannerInBar: false)
                == MeeshyCollapsingHeroRecipe.barCornerRadius)
    }

    @Test("#19925 : le nom descend sous ce que le cadre de l'avatar peint sous son bord, jamais moins de 10")
    func titleGap_clearsTheAvatarFrame() {
        #expect(MeeshyCollapsingHeroRecipe.titleGap(avatarSpill: 0) == 10)
        #expect(MeeshyCollapsingHeroRecipe.titleGap(avatarSpill: 37) == 41)
        #expect(MeeshyCollapsingHeroRecipe.titleGap(avatarSpill: .nan) == 10)
    }

    @Test("#19925 : l'avatar s'écarte du bord autant que son cadre déborde, jamais moins de 20")
    func avatarInset_keepsTheFrameOnScreen() {
        #expect(MeeshyCollapsingHeroRecipe.avatarInset(avatarSpill: 0) == 20)
        #expect(MeeshyCollapsingHeroRecipe.avatarInset(avatarSpill: 37) == 45)
        #expect(MeeshyCollapsingHeroRecipe.avatarInset(avatarSpill: .infinity) == 20)
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
