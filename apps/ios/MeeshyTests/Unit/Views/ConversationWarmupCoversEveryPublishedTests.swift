import XCTest
@testable import Meeshy

/// **Le warm-up lit CHAQUE `@Published` de `ConversationViewModel` — la liste
/// est DÉRIVÉE, jamais tenue à la main.**
///
/// Le mécanisme, lui, était juste depuis 2026-08-17 : le getter synthétisé d'un
/// `@Published` passe par le subscript statique `_enclosingInstance`, qui
/// instancie deux `ReferenceWritableKeyPath`. Cette instanciation
/// (`_swift_getKeyPath`) descend dans le décodeur de métadonnées du runtime sur
/// ~43 trames à ~17 Ko chacune ≈ 730 Ko. Faite pour la PREMIÈRE fois au fond
/// d'un rendu SwiftUI, elle épuise les 1008 Ko du thread principal ; faite
/// depuis la pile PLATE du warm-up, elle tient largement — et le cache de
/// métadonnées étant global au process, le vrai rendu la retrouve chaude.
///
/// **Ce qui a échoué est l'INVENTAIRE.** Le warm-up nommait cinq propriétés,
/// choisies à chaque crash d'après la trame fautive de ce crash-là. Une telle
/// liste se périme en SILENCE dès qu'un `body` se met à lire un sixième
/// `@Published` — et c'est exactement ce qui s'est produit : le composer lit
/// `ephemeralDuration` (`ConversationView+Composer.swift`, `composerCoreBody`),
/// absent de la liste, et l'app plantait AU LANCEMENT (device iPhone 16 Pro
/// Max, `signal 11` dans la page de garde, `segv_backtrace.txt` du
/// 2026-09-03 17:41 :
/// `_swift_getKeyPath` → `ConversationViewModel.ephemeralDuration.getter` →
/// `composerCoreBody.getter` → … → `performWarmup()`).
///
/// > Une liste de couverture écrite à la main n'énonce pas un invariant, elle
/// > énonce l'historique des pannes déjà vues. La garde qui tient DÉRIVE la
/// > liste de la source qu'elle prétend couvrir.
///
/// C'est le même mode de panne que « un témoin qui affirme *toutes* se périme à
/// chaque capacité ajoutée » : la seule liste qui ne se périme pas est celle
/// que la garde recalcule.
final class ConversationWarmupCoversEveryPublishedTests: XCTestCase {

    private static let viewModelPath =
        "Meeshy/Features/Main/ViewModels/ConversationViewModel.swift"
    private static let warmupPath =
        "Meeshy/Features/Main/Services/ConversationFirstRenderWarmup.swift"

    /// Tous les `@Published` déclarés par l'unité de `ConversationViewModel`
    /// (le type ET ses extensions — `AppSourceGuard.unit` les recolle).
    private func declaredPublishedProperties() throws -> Set<String> {
        let source = AppSourceGuard.stripComments(
            try AppSourceGuard.unit(Self.viewModelPath)
        )
        var found: Set<String> = []
        let pattern = #"@Published\s+(?:(?:private\(set\)|fileprivate|internal|public)\s+)*var\s+(\w+)"#
        let regex = try NSRegularExpression(pattern: pattern)
        let range = NSRange(source.startIndex..., in: source)
        regex.enumerateMatches(in: source, range: range) { match, _, _ in
            guard let match, let r = Range(match.range(at: 1), in: source) else { return }
            found.insert(String(source[r]))
        }
        return found
    }

    func test_lInventaireDesPublished_nEstPasVide() throws {
        let declared = try declaredPublishedProperties()
        XCTAssertGreaterThan(
            declared.count, 20,
            """
            Moins de 20 `@Published` trouvés sur `ConversationViewModel` : le \
            balayage a probablement perdu son chemin ou sa forme, et cette suite \
            passerait au vert en ne couvrant RIEN. Trouvés : \
            \(declared.sorted().joined(separator: ", "))
            """
        )
    }

    func test_leWarmup_litChaquePublishedDuViewModel() throws {
        let declared = try declaredPublishedProperties()
        let warmup = AppSourceGuard.stripComments(
            try AppSourceGuard.unit(Self.warmupPath)
        )
        XCTAssertFalse(warmup.isEmpty, "Source du warm-up introuvable")

        let missing = declared
            .filter { !warmup.contains("vm.\($0)") }
            .sorted()

        XCTAssertTrue(
            missing.isEmpty,
            """
            \(missing.count) `@Published` de `ConversationViewModel` ne sont \
            JAMAIS lus par `ConversationFirstRenderWarmup` :

              \(missing.joined(separator: "\n              "))

            Chacun est un débordement de pile en attente : le premier `body` qui \
            le lira instanciera son pattern de keypath (~730 Ko de récursion du \
            décodeur de métadonnées) au fond du rendu SwiftUI, où il ne reste pas \
            730 Ko des 1008 Ko du thread principal. Les lire dans \
            `warmUpViewModelKeyPaths()` — pile plate, cache global au process — \
            fait disparaître la classe entière, pas le crash du jour.
            """
        )
    }
}
