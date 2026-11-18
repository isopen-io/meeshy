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
            let close: (Double, Double) -> Bool = { KitAssemblyGuards.close($0, $1) }
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

    @Test("mouvement réduit : l'identité ne glisse plus, elle s'efface puis reparaît à sa place au passage de main")
    func reducedMotion_turnsTheTravelIntoACrossFade() {
        let before = MeeshyCollapsingHeroRecipe.resolve(progress: 0.3, reduceMotion: true)
        #expect(before.identityTravel == 0)
        #expect(before.avatarSize == MeeshyCollapsingHeroRecipe.avatarExpanded)
        #expect(before.titleSize == MeeshyCollapsingHeroRecipe.titleExpanded)
        #expect(before.identityOpacity == 1)

        let handover = MeeshyCollapsingHeroRecipe.resolve(progress: 0.5, reduceMotion: true)
        #expect(handover.identityOpacity == 0)

        let after = MeeshyCollapsingHeroRecipe.resolve(progress: 0.7, reduceMotion: true)
        #expect(after.identityTravel == 1)
        #expect(after.avatarSize == MeeshyCollapsingHeroRecipe.avatarCollapsed)
        #expect(after.titleSize == MeeshyCollapsingHeroRecipe.titleCollapsed)
        #expect(after.identityOpacity == 1)

        for step in stride(from: 0.0, through: 1.0, by: 0.05) {
            let travel = MeeshyCollapsingHeroRecipe.resolve(progress: step, reduceMotion: true).identityTravel
            #expect(travel == 0 || travel == 1, "progress \(step)")
        }
    }

    @Test("mouvement réduit : c'est toujours le doigt qui mène la hauteur, la bannière et le verre")
    func reducedMotion_keepsTheFingerOnTheHeight() {
        for step in stride(from: 0.0, through: 1.0, by: 0.1) {
            let full = MeeshyCollapsingHeroRecipe.resolve(progress: step)
            let reduced = MeeshyCollapsingHeroRecipe.resolve(progress: step, reduceMotion: true)
            #expect(full.height == reduced.height)
            #expect(full.bannerOpacity == reduced.bannerOpacity)
            #expect(full.glassOpacity == reduced.glassOpacity)
            #expect(full.barOwnsIdentity == reduced.barOwnsIdentity)
        }
    }

    @Test("sans mouvement réduit, l'identité voyage et reste pleinement visible")
    func fullMotion_travelsWithoutFading() {
        let midway = MeeshyCollapsingHeroRecipe.resolve(progress: 0.275)
        #expect(KitAssemblyGuards.close(midway.identityTravel, 0.5))
        for step in stride(from: 0.0, through: 1.0, by: 0.1) {
            #expect(MeeshyCollapsingHeroRecipe.resolve(progress: step).identityOpacity == 1)
        }
    }

    @Test("un tic léger à l'épinglage, un seul par sens")
    func pinTick_firesOncePerDirection() {
        #expect(MeeshyCollapsingHeroRecipe.pinTick(from: 0.9, to: 1.0))
        #expect(MeeshyCollapsingHeroRecipe.pinTick(from: 1.0, to: 0.9))
        #expect(!MeeshyCollapsingHeroRecipe.pinTick(from: 1.0, to: 1.4))
        #expect(!MeeshyCollapsingHeroRecipe.pinTick(from: 0.2, to: 0.6))
        #expect(!MeeshyCollapsingHeroRecipe.pinTick(from: .nan, to: 0.3))
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

    @Test("une feuille sans barre d'état pose ses commandes à l'inset donné ; sinon la zone sûre, sinon 54")
    func controlTop_followsTheHostInset() {
        #expect(MeeshyCollapsingHeroRecipe.controlTop(safeArea: 0, topInset: 12) == 12)
        #expect(MeeshyCollapsingHeroRecipe.controlTop(safeArea: 59, topInset: 12) == 12)
        #expect(MeeshyCollapsingHeroRecipe.controlTop(safeArea: 59) == 59)
        #expect(MeeshyCollapsingHeroRecipe.controlTop(safeArea: 0) == 54)
        #expect(MeeshyCollapsingHeroRecipe.controlTop(safeArea: 0, topInset: -4) == 0)
        #expect(MeeshyCollapsingHeroRecipe.controlTop(safeArea: 47, topInset: .nan) == 47)
    }

    @Test("garde de source : aucun type du domaine, aucun singleton, aucun verre dessiné")
    func source_isAgnostic() throws {
        let files = ["MeeshyCollapsingHero.swift", "MeeshyCollapsingHeroRecipe.swift"]
        try KitAssemblyGuards.assertAgnostic(files)
        for file in files {
            #expect(!(try KitAtomVectors.code(file)).contains("UIBlurEffect"), "\(file)")
        }
    }
}
