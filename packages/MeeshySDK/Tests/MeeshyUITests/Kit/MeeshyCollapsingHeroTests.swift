import Testing
import Foundation
@testable import MeeshyUI

/// K28 — l'en-tête qui se replie, lu comme des VALEURS : un seul nombre `progress`
/// mène hauteur, avatar, titre, bannière et verre.
@Suite("MeeshyCollapsingHero")
struct MeeshyCollapsingHeroTests {

    private static let file = "K28-MeeshyCollapsingHero"

    @Test("les crans 0, 35, 70 et 100 % suivent les vecteurs")
    func steps_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "crans") {
            let progress = try #require(row["progress"] as? Double)
            let recipe = MeeshyCollapsingHeroRecipe.resolve(progress: progress)
            let close = KitAssemblyGuards.close
            #expect(close(recipe.height, row["hauteur"] as? Double ?? .nan), "\(row)")
            #expect(close(recipe.avatarSize, row["avatar"] as? Double ?? .nan), "\(row)")
            #expect(close(recipe.titleSize, row["titre"] as? Double ?? .nan), "\(row)")
            #expect(close(recipe.bannerOpacity, row["banniere"] as? Double ?? .nan), "\(row)")
            #expect(close(recipe.glassOpacity, row["verre"] as? Double ?? .nan), "\(row)")
            #expect(recipe.barOwnsIdentity == row["identiteDansLaBarre"] as? Bool, "\(row)")
        }
        let distance = try #require(try KitAtomVectors.load(Self.file)["distanceDefilement"] as? Double)
        #expect(MeeshyCollapsingHeroRecipe.scrollDistance() == distance)
    }

    @Test("progress est borné et monotone ; un non-nombre vaut zéro")
    func progress_isClampedAndMonotone() {
        var previous = Double.infinity
        for step in stride(from: -0.2, through: 1.2, by: 0.05) {
            let height = MeeshyCollapsingHeroRecipe.resolve(progress: step).height
            #expect(height <= previous + 0.0001)
            previous = height
        }
        #expect(MeeshyCollapsingHeroRecipe.resolve(progress: .nan).height == 318)
        #expect(MeeshyCollapsingHeroRecipe.clamped(.infinity) == 0)
    }

    @Test("tiré vers le bas, seule la bannière s'étire : rien ne grossit")
    func pullDown_stretchesOnlyTheBanner() {
        let pulled = MeeshyCollapsingHeroRecipe.resolve(progress: -0.5)
        let rest = MeeshyCollapsingHeroRecipe.resolve(progress: 0)
        #expect(pulled.avatarSize == rest.avatarSize)
        #expect(pulled.titleSize == rest.titleSize)
        #expect(pulled.height == rest.height)
        #expect(pulled.bannerStretch > 0)
        #expect(rest.bannerStretch == 0)
        #expect(MeeshyCollapsingHeroRecipe.resolve(progress: 0, overscroll: 40).bannerStretch == 40)
    }

    @Test("une seule identité : le héros sous 50 %, la barre au-delà, jamais les deux")
    func identity_isOwnedOnce() {
        #expect(!MeeshyCollapsingHeroRecipe.resolve(progress: 0.5).barOwnsIdentity)
        #expect(MeeshyCollapsingHeroRecipe.resolve(progress: 0.51).barOwnsIdentity)
        #expect(MeeshyCollapsingHeroRecipe.resolve(progress: 1).isPinned)
        #expect(!MeeshyCollapsingHeroRecipe.resolve(progress: 0.99).isPinned)
    }

    @Test("les commandes gardent 44 et ne se déplacent pas de plus de 6")
    func controls_stayPut() {
        for step in stride(from: 0.0, through: 1.0, by: 0.1) {
            let recipe = MeeshyCollapsingHeroRecipe.resolve(progress: step)
            #expect(recipe.controlSize == 44)
            #expect(abs(recipe.controlShift) <= 6)
        }
        #expect(MeeshyCollapsingHeroRecipe.resolve(progress: 0.7).controlsDiscOpacity == 0)
    }

    @Test("sans avatar l'avatar vaut zéro ; sans sous-titre le sous-titre vaut zéro")
    func optionalSlots_takeNoRoom() {
        let bare = MeeshyCollapsingHeroRecipe.resolve(progress: 0, hasAvatar: false, hasSubtitle: false)
        #expect(bare.avatarSize == 0)
        #expect(bare.subtitleSize == 0)
    }

    @Test("garde de source : aucun type du domaine, aucun singleton, aucun verre dessiné")
    func source_isAgnostic() throws {
        let files = ["MeeshyCollapsingHero.swift", "MeeshyCollapsingHeroRecipe.swift"]
        try KitAssemblyGuards.assertAgnostic(files)
        for file in files {
            #expect(!(try KitAtomVectors.code(file)).contains("UIBlurEffect"), file)
        }
    }
}
