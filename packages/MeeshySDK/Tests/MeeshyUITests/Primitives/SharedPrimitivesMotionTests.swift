import Foundation
import CoreGraphics
import Testing
@testable import MeeshyUI

/// **Les primitives partagées suivent « Réduire les animations » et leurs
/// états ne surgissent plus d'un coup** (#18302).
///
/// Tirer pour rafraîchir, la rangée balayable, l'état vide, la pilule de
/// verre, la bande du dock clavier, la note (i) et les champs Catégorie et
/// Étiquettes glissaient en ressort littéral sans chemin réduit, ou montaient
/// leurs éléments sans transition. Les lois se lisent sans rendu ; le câblage
/// se lit dans les sources, commentaires retirés.
@MainActor
@Suite("Mouvement des primitives partagées")
struct SharedPrimitivesMotionTests {

    // MARK: - Tirer pour rafraîchir

    @Test func pullIndicator_sousReduction_le_logo_ne_tourne_ni_ne_grossit() {
        for phase in [MeeshyPullPhase.idle, .pulling(progress: 0.5), .armed, .refreshing, .completing] {
            #expect(MeeshyPullIndicator.logoScale(phase: phase, reduceMotion: true) == 1)
            #expect(MeeshyPullIndicator.logoRotation(phase: phase, reduceMotion: true) == 0)
        }
    }

    @Test func pullIndicator_sansReduction_garde_le_retour_proportionnel_au_tirage() {
        #expect(MeeshyPullIndicator.logoRotation(phase: .pulling(progress: 0.5), reduceMotion: false) == 90)
        #expect(MeeshyPullIndicator.logoRotation(phase: .armed, reduceMotion: false) == 180)
        #expect(MeeshyPullIndicator.logoScale(phase: .idle, reduceMotion: false) == 0.6)
        #expect(MeeshyPullIndicator.logoScale(phase: .armed, reduceMotion: false) == 1.04)
    }

    @Test func logo_respire_quand_le_rafraichissement_commence_apres_l_apparition() throws {
        let code = try Self.source("Primitives/AnimatedLogoView.swift")
        #expect(code.contains("adaptiveOnChange(of: continuous)"),
                "la respiration ne démarre qu'à l'apparition : un rafraîchissement lancé après laisse le logo figé")
    }

    // MARK: - La rangée balayable

    @Test func rangeeBalayable_sousReduction_les_actions_ne_changent_pas_d_echelle() {
        #expect(SwipeRowRules.cellScale(progress: 0, reduceMotion: true) == 1)
        #expect(SwipeRowRules.cellScale(progress: 0.5, reduceMotion: true) == 1)
    }

    @Test func rangeeBalayable_sansReduction_les_actions_grandissent_avec_la_revelation() {
        #expect(SwipeRowRules.cellScale(progress: 0, reduceMotion: false) == 0.4)
        #expect(SwipeRowRules.cellScale(progress: 1, reduceMotion: false) == 1)
    }

    // MARK: - L'état vide

    @Test func etatVide_sousReduction_ne_monte_pas() {
        #expect(EmptyStateView.entryOffset(appeared: false, reduceMotion: true) == 0)
        #expect(EmptyStateView.entryOffset(appeared: false, reduceMotion: false) == MeeshySpacing.md)
        #expect(EmptyStateView.entryOffset(appeared: true, reduceMotion: false) == 0)
    }

    // MARK: - La bande du dock clavier (K17)

    @Test func dockClavier_sousReduction_la_bande_se_fond_en_150_ms() {
        typealias R = MeeshyKeyboardDockRecipe
        #expect(R.bandEnterDuration(reduceMotion: true) == 0.15)
        #expect(R.bandExitDuration(reduceMotion: true) == 0.15)
        #expect(R.bandEnterDuration(reduceMotion: false) == R.bandEnterDuration)
        #expect(R.bandExitDuration(reduceMotion: false) == R.bandExitDuration)
    }

    @Test func dockClavier_lit_les_deux_moities_de_la_reduction() throws {
        let code = try Self.source("Kit/MeeshyKeyboardDock.swift")
        #expect(code.contains("meeshyForceReduceMotion"))
        #expect(code.contains("bandEnterDuration(reduceMotion:"))
    }

    // MARK: - Câblage

    private static func source(_ relative: String) throws -> String {
        let url = ComposerSourceGuard.packageRoot.appendingPathComponent("Sources/MeeshyUI/" + relative)
        return ComposerSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private static func flat(_ relative: String) throws -> String {
        try source(relative).components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
    }

    nonisolated private static let rawMotionFiles = [
        "Primitives/MeeshyRefreshableScroll.swift",
        "Primitives/MeeshyPullIndicator.swift",
        "Primitives/SwipeableRow.swift",
        "Primitives/EmptyStateView.swift",
    ]

    @Test(arguments: rawMotionFiles)
    func aucun_ressort_brut_sans_chemin_reduit(_ relative: String) throws {
        let code = try Self.flat(relative)
        #expect(!code.contains("withAnimation(.spring("), "\(relative) pose un withAnimation brut")
        #expect(!code.contains(".animation(.spring("), "\(relative) pose un .animation brut")
    }

    @Test func pullIndicator_l_anneau_ne_grossit_pas_sous_reduction() throws {
        let code = try Self.flat("Primitives/MeeshyPullIndicator.swift")
        #expect(code.contains(".meeshyTransition(.opacity.combined(with: .scale))"))
    }

    @Test func pilule_la_rangee_ne_glisse_pas_sous_reduction() throws {
        let code = try Self.flat("Kit/MeeshyGlassPill.swift")
        #expect(code.contains(".meeshyTransition(rowTransition)"))
        #expect(!code.contains(".transition(rowTransition)"))
    }

    private static let conditionalFields: [(file: String, values: [String], transitions: Int)] = [
        ("Primitives/CategoryPickerField.swift", ["focused)", "selectedId)", "editing.isEmpty)"], 3),
        ("Primitives/TagInputField.swift", ["focused)", "selectedTags)", "editing.isEmpty)"], 3),
    ]

    @Test func champs_de_preferences_leurs_panneaux_et_puces_entrent_en_fondu() throws {
        for field in Self.conditionalFields {
            let code = try Self.flat(field.file)
            let values = code.components(separatedBy: ".meeshyAnimation(").dropFirst().compactMap { call in
                call.range(of: "value:").map { String(call[$0.upperBound...].prefix(40)) }
            }
            for value in field.values {
                #expect(values.contains { $0.hasPrefix(" " + value) }, "\(field.file) : aucune animation liée à \(value)")
            }
            #expect(code.components(separatedBy: ".transition(.opacity)").count - 1 >= field.transitions,
                    "\(field.file) : un élément monté sous condition sans fondu")
        }
    }

    @Test func noteInfo_se_deplie_en_fondu() throws {
        let code = try Self.flat("Primitives/MeeshyInfoNote.swift")
        #expect(code.contains(".transition(.opacity)"), "la note dépliée surgit d'un coup")
        #expect(code.contains("meeshyWithAnimation(MeeshyAnimation.springFast, reduceMotion: reduceMotion)"),
                "le (i) ouvre la note sans transaction animée")
    }
}
