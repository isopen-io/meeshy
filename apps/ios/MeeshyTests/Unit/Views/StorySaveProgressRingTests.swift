import XCTest
import SwiftUI
@testable import Meeshy

// MARK: - StorySaveProgressRingTests
//
// L'anneau est partagé par la ligne « Mes stories » et le rail d'actions du
// reader (Task 7) : une seule fonction de clamp/pourcentage, sinon les deux
// surfaces divergeraient dès la première retouche (épaisseur, arrondi, sens
// de rotation — cf. la doc de `StorySaveProgressRing`). `clamp(_:)` et
// `percent(_:)` sont statiques et pures précisément pour rester testables
// sans instancier de vue SwiftUI ni monter un hôte de rendu.
//
// `@MainActor` : `StorySaveProgressRing` vit dans le target `Meeshy`, dont
// `SWIFT_DEFAULT_ACTOR_ISOLATION` est `MainActor` (SE-0466) — un type non
// annoté y est donc main-actor-isolé par défaut. Même patron que
// `StorySaveProgressMapperTests` (Task 2) et `MyStoryRowSaveRingTests` (Task 6)
// pour la même raison.
@MainActor
final class StorySaveProgressRingTests: XCTestCase {

    // MARK: clamp(_:)

    func test_clamp_negative_clampsToZero() {
        XCTAssertEqual(StorySaveProgressRing.clamp(-0.5), 0, accuracy: 0.0001)
    }

    func test_clamp_aboveOne_clampsToOne() {
        XCTAssertEqual(StorySaveProgressRing.clamp(1.5), 1, accuracy: 0.0001)
    }

    func test_clamp_zero_staysZero() {
        XCTAssertEqual(StorySaveProgressRing.clamp(0), 0, accuracy: 0.0001)
    }

    func test_clamp_one_staysOne() {
        XCTAssertEqual(StorySaveProgressRing.clamp(1), 1, accuracy: 0.0001)
    }

    // MARK: percent(_:)

    func test_percent_roundsToNearest() {
        XCTAssertEqual(StorySaveProgressRing.percent(0.435), 44)
    }

    func test_percent_clampsNegativeBeforeRounding() {
        XCTAssertEqual(StorySaveProgressRing.percent(-0.2), 0)
    }

    func test_percent_clampsAboveOneBeforeRounding() {
        XCTAssertEqual(StorySaveProgressRing.percent(1.2), 100)
    }

    // MARK: appearance(isCancellable:reduceMotion:)
    //
    // Revue finale round 2, item 2 : le passage « annulable → plus annulable »
    // était TOTALEMENT invisible. `.buttonStyle(.plain)` + `.disabled` ne
    // changent rien sur des `Shape` à couleur explicite, et le seuil ne
    // coïncide avec aucun changement d'affichage : l'anneau atteint 90 % à la
    // fin du bake puis y reste, muet, pendant `StoryExportIntro.prepend` ET
    // `StoryExportOutro.append`. L'utilisateur tapait deux fois au même
    // endroit, sur un anneau rigoureusement identique — la première fois « Export
    // annulé », la seconde rien du tout.

    func test_appearance_cancellable_keepsTheAccentArc_withoutSweep() {
        let appearance = StorySaveProgressRing.appearance(isCancellable: true, reduceMotion: false)
        XCTAssertEqual(appearance.arcTint, .accent)
        XCTAssertFalse(appearance.showsIndeterminateSweep,
                       "tant que le tap annule, l'anneau reste une progression déterminée")
    }

    func test_appearance_uncancellable_dropsTheAccentArc_andSweeps() {
        let appearance = StorySaveProgressRing.appearance(isCancellable: false, reduceMotion: false)
        XCTAssertEqual(appearance.arcTint, .inert,
                       "une fois l'écriture Photos commencée, l'anneau doit perdre sa couleur d'accent")
        XCTAssertTrue(appearance.showsIndeterminateSweep,
                      """
                      Les passes AVFoundation qui suivent le bake ne publient aucune progression : \
                      sans balayage indéterminé, l'anneau reste figé à 90 % sans rien indiquer.
                      """)
    }

    /// LE test de la correction : les deux états ne doivent JAMAIS se rendre
    /// à l'identique. C'est exactement le défaut constaté — anneau
    /// visuellement inchangé au basculement.
    func test_appearance_theTwoStates_neverRenderIdentically() {
        for reduceMotion in [false, true] {
            XCTAssertNotEqual(
                StorySaveProgressRing.appearance(isCancellable: true, reduceMotion: reduceMotion),
                StorySaveProgressRing.appearance(isCancellable: false, reduceMotion: reduceMotion),
                """
                Le basculement « plus annulable » doit se voir (reduceMotion=\(reduceMotion)). \
                `.disabled` seul ne produit aucun changement visuel sur des Shape à couleur \
                explicite : l'affordance redeviendrait muette.
                """
            )
        }
    }

    /// Le signal ne doit jamais reposer sur la SEULE animation : un
    /// utilisateur « Réduire les animations » verrait sinon exactement le
    /// même anneau qu'avant le basculement.
    func test_appearance_underReduceMotion_keepsTheColourSignal_withoutSweep() {
        let appearance = StorySaveProgressRing.appearance(isCancellable: false, reduceMotion: true)
        XCTAssertEqual(appearance.arcTint, .inert,
                       "la perte de couleur d'accent doit survivre à « Réduire les animations »")
        XCTAssertFalse(appearance.showsIndeterminateSweep,
                       "« Réduire les animations » doit supprimer le balayage, pas le signal")
    }

    /// La couleur inerte est SÉMANTIQUE (`Color.secondary`), donc adaptée aux
    /// deux `colorScheme` — pas une teinte claire codée en dur qui
    /// disparaîtrait sur les surfaces de verre en mode clair.
    func test_appearance_arcColor_followsTheResolvedTint() {
        let accent = Color.blue
        let live = StorySaveProgressRing.appearance(isCancellable: true, reduceMotion: false)
        let inert = StorySaveProgressRing.appearance(isCancellable: false, reduceMotion: false)

        XCTAssertEqual(live.arcColor(accent: accent), accent)
        XCTAssertEqual(inert.arcColor(accent: accent), Color.secondary)
        XCTAssertNotEqual(live.arcColor(accent: accent), inert.arcColor(accent: accent),
                          "les deux surfaces doivent rendre deux couleurs d'arc distinctes")
    }
}
