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

    // MARK: Le héros replié n'est QUE sa barre (#19987)

    @Test("#19987 : une bannière gardée dans la barre se replie AVEC l'identité — plus de bande vide sous la barre")
    func folding_endsWhenTheIdentityReachesTheBar() {
        let collapsed = 110.0
        let finish = MeeshyCollapsingHeroRecipe.finishShare
        for progress in [finish, 0.73, 0.9, 1] {
            let recipe = MeeshyCollapsingHeroRecipe.resolve(progress: progress, collapsedHeight: collapsed,
                                                            foldsWithIdentity: true)
            #expect(abs(recipe.height - collapsed) < 0.0001, "\(progress) : \(recipe.height)")
            #expect(abs(recipe.glassOpacity - 1) < 0.0001, "\(progress) : le verre est posé quand la barre l'est")
        }
        let rest = MeeshyCollapsingHeroRecipe.resolve(progress: 0, collapsedHeight: collapsed, foldsWithIdentity: true)
        #expect(rest.height == MeeshyCollapsingHeroRecipe.expandedHeight)
        #expect(rest.glassOpacity == 0)
        let half = MeeshyCollapsingHeroRecipe.resolve(progress: finish / 2, collapsedHeight: collapsed, foldsWithIdentity: true)
        #expect(abs(half.height - (MeeshyCollapsingHeroRecipe.expandedHeight + collapsed) / 2) < 0.0001)
    }

    @Test("#19987 : les autres hôtes gardent la loi d'origine — la hauteur suit tout le défilement")
    func folding_otherHostsKeepTheOriginalLaw() {
        let recipe = MeeshyCollapsingHeroRecipe.resolve(progress: 0.73)
        #expect(recipe.height > MeeshyCollapsingHeroRecipe.collapsedHeight)
    }

    // MARK: Le nom replié se lit sur la bannière (#19936)

    @Test("#19936 : replié sur la bannière gardée, le nom prend l'encre des médias — déplié, celle du thème")
    func titleInk_followsWhereTheNameSits() {
        #expect(MeeshyCollapsingHeroRecipe.titleInk(keepsBannerInBar: true, travel: 0) == .theme)
        #expect(MeeshyCollapsingHeroRecipe.titleInk(keepsBannerInBar: true, travel: 0.49) == .theme)
        #expect(MeeshyCollapsingHeroRecipe.titleInk(keepsBannerInBar: true, travel: 0.5) == .onMedia)
        #expect(MeeshyCollapsingHeroRecipe.titleInk(keepsBannerInBar: true, travel: 1) == .onMedia)
    }

    @Test("#19936 : sans bannière dans la barre, le nom garde l'encre du thème, replié ou non")
    func titleInk_withoutBanner_staysTheme() {
        #expect(MeeshyCollapsingHeroRecipe.titleInk(keepsBannerInBar: false, travel: 1) == .theme)
        #expect(MeeshyCollapsingHeroRecipe.titleInk(keepsBannerInBar: false, travel: .nan) == .theme)
    }
}
