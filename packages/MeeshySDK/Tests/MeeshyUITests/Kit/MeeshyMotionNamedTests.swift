import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K26 — les trois recettes nommées APPLIQUÉES (#19528) : `reveal` (le squelette
/// cède au contenu, échange sec sous réduction), `shimmer` (aplat fixe sous
/// réduction) et `celebrate` (rebond et particules, repli fixe sans particule
/// sous réduction) ; et la garde qui interdit aux écrans du profil d'écrire un
/// mouvement hors de la table.
@Suite("MeeshyMotion — les recettes nommées")
struct MeeshyMotionNamedTests {

    @Test("reveal : le ressort rise hors réduction, un échange sec sous réduction")
    func reveal_isTheRiseSpring_orADryExchange() {
        let full = MeeshyMotion.animation(named: .reveal, reduce: false)
        let reduced = MeeshyMotion.animation(named: .reveal, reduce: true)
        #expect(full == MeeshyMotion.animation(.rise, reduce: false))
        #expect(reduced == nil)
    }

    @Test("celebrate : le ressort morph une fois, un repli fixe sous réduction")
    func celebrate_isTheMorphSpring_orAFixedPose() {
        let full = MeeshyMotion.animation(named: .celebrate, reduce: false)
        let reduced = MeeshyMotion.animation(named: .celebrate, reduce: true)
        #expect(full == MeeshyMotion.animation(.morph, reduce: false))
        #expect(reduced == nil)
    }

    @Test("shimmer : la boucle pulse hors réduction, un aplat fixe sous réduction")
    func shimmer_isThePulseLoop_orAFlatFill() {
        let full = MeeshyMotion.animation(named: .shimmer, reduce: false)
        let reduced = MeeshyMotion.animation(named: .shimmer, reduce: true)
        #expect(full == MeeshyMotion.animation(.pulse, reduce: false))
        #expect(reduced == nil)
    }

    @Test("seule la célébration porte des particules, et jamais sous réduction")
    func particles_belongToTheCelebrationOnly() {
        #expect(MeeshyMotion.showsParticles(.celebrate, reduce: false))
        #expect(!MeeshyMotion.showsParticles(.celebrate, reduce: true))
        #expect(!MeeshyMotion.showsParticles(.reveal, reduce: false))
        #expect(!MeeshyMotion.showsParticles(.shimmer, reduce: false))
    }

    @Test("le second temps d'une recette nommée part au rang 1 de la cascade, sans retard sous réduction")
    func followUp_startsAtTheFirstCascadeRank() {
        let delayed = MeeshyMotion.followUpDelay(reduce: false)
        let immediate = MeeshyMotion.followUpDelay(reduce: true)
        #expect(delayed == MeeshyMotion.delay(index: 1))
        #expect(immediate == 0)
    }

    @Test("chaque recette nommée tient sous le plafond de 600 ms, second temps compris")
    func named_staysUnderTheCeiling() {
        for name in [MeeshyMotionNamed.reveal, .celebrate] {
            let tokens = MeeshyMotionRecipe.named(name, reduce: false).tokens
            for token in tokens {
                let total = MeeshyMotion.delayMilliseconds(index: 1)
                    + MeeshyMotionRecipe.resolve(token: token).durationMilliseconds
                #expect(total <= MeeshyMotionRecipe.nonLoopCeilingMilliseconds, "\(name) \(token)")
            }
        }
    }

    // MARK: - La garde des écrans du profil (loi 7)

    private static let profileScreens = [
        "packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+Header.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Profile/ConnectionActionView.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Profile/AvatarListeningSource.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Profile/FullscreenImageView.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileAcquaintanceSection.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileRequestStageCards.swift",
        "apps/ios/Meeshy/Features/Contacts/ProfileCircleSection.swift",
        "apps/ios/Meeshy/Features/Profile/Views/ProfileView.swift",
        "apps/ios/Meeshy/Features/Profile/Views/ProfileCirclesSection.swift",
        "apps/ios/Meeshy/Features/Profile/Views/ProfileEditSettings.swift",
        "apps/ios/Meeshy/Features/Profile/Views/UserStatsView.swift",
        "apps/ios/Meeshy/Features/Profile/Views/ProgressionMeeshEntry.swift",
        "apps/ios/Meeshy/Features/Profile/Views/AchievementRevealView.swift",
    ]

    private static let handWritten = [
        ".spring(", ".easeOut(duration", ".easeInOut(duration", ".linear(duration",
        "MeeshyAnimation.springDefault", "withAnimation(.default",
    ]

    @Test("garde de source : les écrans du profil tirent tout mouvement de la table K26")
    func profileScreens_drawEveryMotionFromTheTable() throws {
        for path in Self.profileScreens {
            let url = KitAtomVectors.repositoryRoot.appendingPathComponent(path)
            let code = try String(contentsOf: url, encoding: .utf8)
                .split(separator: "\n", omittingEmptySubsequences: false)
                .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
                .joined(separator: "\n")
            for forbidden in Self.handWritten {
                #expect(!code.contains(forbidden), "\(path) écrit \(forbidden) hors de la table K26")
            }
        }
    }

    @Test("garde de source : la fiche révèle sa face par motion.reveal, la célébration par motion.celebrate")
    func profileScreens_useTheNamedRecipes() throws {
        let sheet = try String(contentsOf: KitAtomVectors.repositoryRoot.appendingPathComponent(
            "packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift"), encoding: .utf8)
        let own = try String(contentsOf: KitAtomVectors.repositoryRoot.appendingPathComponent(
            "apps/ios/Meeshy/Features/Profile/Views/ProfileView.swift"), encoding: .utf8)
        let reveal = try String(contentsOf: KitAtomVectors.repositoryRoot.appendingPathComponent(
            "apps/ios/Meeshy/Features/Profile/Views/AchievementRevealView.swift"), encoding: .utf8)
        #expect(sheet.contains("MeeshyRevealZone("))
        #expect(own.contains("MeeshyRevealZone("))
        #expect(reveal.contains("named: .celebrate"))
        #expect(reveal.contains("showsParticles(.celebrate"))
    }
}
