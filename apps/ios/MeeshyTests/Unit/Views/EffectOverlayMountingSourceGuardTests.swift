import Foundation
import XCTest
@testable import Meeshy

/// Confrontation mécanique des systèmes de particules DÉCLARÉS avec ceux
/// réellement MONTÉS par `MessageEffectsModifier`.
///
/// `ExplodeOverlay` et `WaooOverlay` ont vécu déclarés et jamais montés : seuls
/// `ConfettiOverlay` et `FireworksOverlay` figuraient dans l'`.overlay` du
/// modifier. Les drapeaux `explode` et `waoo` jouaient donc leur transform —
/// échelle, halo — pendant que leur centaine de lignes de particules ne
/// s'exécutait jamais. Aucun test ne rougissait : le plan de lecture
/// (`MessageEffectPlan`) est correct, les deux vues compilent, et l'effet
/// PARAÎT jouer puisque son transform, lui, est bien monté.
///
/// C'est la forme « capacité déclarée, jamais câblée » : le code existe, le
/// drapeau voyage jusqu'au serveur, et pourtant l'utilisateur ne voit pas ce
/// qu'il a demandé. Une garde de rendu drapeau par drapeau est hors de portée
/// sans harnais de snapshot ; le montage, lui, se vérifie sur le texte source
/// et c'est exactement la marche manquée.
///
/// La garde exige l'égalité des deux ensembles. Un overlay neuf qu'on oublie de
/// brancher fait rougir — et un overlay volontairement non monté doit être
/// justifié dans l'allowlist ci-dessous, jamais laissé muet.
final class EffectOverlayMountingSourceGuardTests: XCTestCase {

    /// Overlays délibérément déclarés sans être montés par le modifier.
    /// Vide aujourd'hui, et c'est l'état sain : tout ce qui est décrit se joue.
    private static let deliberatelyUnmounted: Set<String> = []

    private var effectModifiersSource: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Views
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("Meeshy/Features/Main/Components/MessageEffectModifiers.swift")
    }

    /// Le fichier documente ses effets en prose abondante et cite les noms
    /// d'overlays dans ses commentaires. Sans dépouillement, la garde
    /// compterait la documentation comme un montage et serait verte à tort.
    private func strippedSource() throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: effectModifiersSource, encoding: .utf8))
    }

    private func matches(_ pattern: String, in source: String, group: Int = 1) -> Set<String> {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(source.startIndex..., in: source)
        return Set(regex.matches(in: source, range: range).compactMap { match in
            Range(match.range(at: group), in: source).map { String(source[$0]) }
        })
    }

    // MARK: - Balayage

    func test_everyDeclaredParticleOverlay_isMountedByTheModifier() throws {
        let source = try strippedSource()

        let declared = matches(#"struct\s+(\w*Overlay)\s*:\s*View"#, in: source)
        let mounted = matches(#"(\w*Overlay)\s*\("#, in: source)

        XCTAssertFalse(declared.isEmpty,
                       "Balayage vide : le dépouillement a trop mangé, ou le fichier a bougé. "
                       + "Un balayage vide ne doit jamais être indiscernable d'un succès.")

        let unmounted = declared.subtracting(mounted).subtracting(Self.deliberatelyUnmounted)
        XCTAssertTrue(
            unmounted.isEmpty,
            "Overlay(s) déclaré(s) mais jamais monté(s) par MessageEffectsModifier : "
            + "\(unmounted.sorted().joined(separator: ", ")). "
            + "Le drapeau correspondant joue son transform sans jamais lancer ses particules. "
            + "Brancher l'overlay, ou l'inscrire dans `deliberatelyUnmounted` AVEC sa raison."
        )
    }

    func test_allowlist_containsNoStaleEntry() throws {
        let declared = matches(#"struct\s+(\w*Overlay)\s*:\s*View"#, in: try strippedSource())
        let stale = Self.deliberatelyUnmounted.subtracting(declared)

        XCTAssertTrue(
            stale.isEmpty,
            "Entrée(s) périmée(s) dans l'allowlist — l'overlay n'existe plus : "
            + "\(stale.sorted().joined(separator: ", ")). "
            + "Une allowlist qu'on ne relit pas finit par autoriser ce qui n'existe pas."
        )
    }

    /// Les quatre drapeaux d'apparition à particules doivent chacun garder leur
    /// montage conditionnel. Sans cette garde, brancher les overlays « en dur »
    /// (hors de tout `plan.appearance.contains`) satisferait la garde
    /// précédente tout en jouant les particules sur TOUS les messages.
    func test_eachParticleOverlay_isMountedBehindItsOwnFlag() throws {
        let source = try strippedSource()

        for (flag, overlay) in [("confetti", "ConfettiOverlay"),
                                ("fireworks", "FireworksOverlay"),
                                ("explode", "ExplodeOverlay"),
                                ("waoo", "WaooOverlay")] {
            let guarded = matches(
                #"contains\(\.\#(flag)\)\s*\{\s*\#(overlay)\("#,
                in: source,
                group: 0   // le motif n'a pas de groupe capturant : c'est la correspondance entière qui porte la preuve
            )
            XCTAssertFalse(
                guarded.isEmpty,
                "\(overlay) n'est pas monté derrière `plan.appearance.contains(.\(flag))`. "
                + "Un overlay monté sans condition joue ses particules sur tous les messages."
            )
        }
    }
}
