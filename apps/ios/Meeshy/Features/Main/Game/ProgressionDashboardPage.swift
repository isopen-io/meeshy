import SwiftUI
import MeeshySDK
import MeeshyUI

/// LE TABLEAU DE BORD (#9564) — une page dédiée où CHAQUE concept a son bloc compact : l'emblème et le nom en
/// titre, puis toutes ses données, dans le MÊME ordre que la première page (`ProgressionConcepts.served`). Le titre
/// d'un bloc ouvre la fiche du concept ; chaque ligne rebondit et ouvre SES précisions. LECTURE SEULE : aucun geste
/// du jeu ne vit ici, et rien ne s'y pose hors des blocs de concept.
///
/// Autonome dans la pile, comme les fiches : elle lit sa progression cache d'abord.
struct ProgressionDashboardPage: View {

    @StateObject private var viewModel: ProgressionViewModel
    @EnvironmentObject private var router: Router
    /// « Jeu masqué » (#9481) : le tableau se lit alors comme devant un serveur sans jeu.
    @ObservedObject private var prefs = GameDevicePrefsStore.current()

    private var theme: ThemeManager { ThemeManager.shared }
    private var game: GameBlock? { prefs.prefs.hidden ? nil : viewModel.game }

    init(viewModel: ProgressionViewModel? = nil) {
        _viewModel = StateObject(wrappedValue: viewModel ?? ProgressionViewModel())
    }

    var body: some View {
        GamePageScaffold(
            title: ConceptText.dashboardTitle,
            onRefresh: { await viewModel.load(forceNetwork: true) },
            // D'ici, les précisions d'une ligne offrent « Voir la fiche ».
            onOpenConcept: { router.push(.progressionConcept($0)) }
        ) {
            VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                if viewModel.isOffline {
                    ProgressionNotice(kind: .offline(hasSnapshot: viewModel.progress != nil))
                }
                if let message = viewModel.errorMessage {
                    ProgressionNotice(kind: .error(message)) {
                        Task { await viewModel.load(forceNetwork: true) }
                    }
                }
                if let progress = viewModel.progress {
                    blocks(progress)
                } else if viewModel.showsSkeleton {
                    ProgressionSkeleton()
                }
            }
        }
        .task { await viewModel.load() }
    }

    @ViewBuilder
    private func blocks(_ progress: EngagementProgress) -> some View {
        ForEach(ProgressionConcepts.served(for: progress, game: game)) { concept in
            ProgressionDashboardBlock(
                concept: concept,
                value: ProgressionConceptModel.value(concept, progress: progress, game: game),
                facts: ProgressionConceptModel.facts(concept, progress: progress, game: game),
                game: game,
                onOpen: { router.push(.progressionConcept(concept)) }
            )
        }
    }
}

/// Le bloc d'un concept au tableau de bord : un titre qui ouvre la fiche, puis ses lignes libellé → valeur.
struct ProgressionDashboardBlock: View {
    let concept: ProgressionConcept
    let value: String
    let facts: [ProgressionConceptFact]
    let game: GameBlock?
    let onOpen: () -> Void

    var body: some View {
        ProgressionCard(tint: concept.tint) {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                GameBounceButton(action: onOpen) {
                    ProgressionConceptHead(concept: concept, name: ConceptText.name(concept), value: value, game: game)
                        .frame(minHeight: MeeshyControlSize.tapTarget)
                        .contentShape(Rectangle())
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(ConceptText.name(concept) + ", " + value)
                .accessibilityHint(ConceptText.cardHint)
                .accessibilityAddTraits([.isButton, .isHeader])
                .accessibilityIdentifier("progression.dashboard.\(concept.rawValue)")
                if !facts.isEmpty {
                    ProgressionConceptFacts(facts: facts, concept: concept)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
