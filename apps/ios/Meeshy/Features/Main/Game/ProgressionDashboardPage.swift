import SwiftUI
import MeeshySDK
import MeeshyUI

/// LE TABLEAU DE BORD (#9564) — une page dédiée où CHAQUE concept a son bloc compact : l'emblème et le nom en
/// titre, puis toutes ses données, dans le MÊME ordre que la première page (`ProgressionConcepts.served`). Le titre
/// d'un bloc ouvre la fiche du concept. LECTURE SEULE : aucun geste du jeu ne vit ici.
///
/// Autonome dans la pile, comme les fiches : elle lit sa progression cache d'abord.
struct ProgressionDashboardPage: View {

    @StateObject private var viewModel: ProgressionViewModel
    @EnvironmentObject private var router: Router
    @Environment(\.dismiss) private var dismiss
    /// « Jeu masqué » (#9481) : le tableau se lit alors comme devant un serveur sans jeu.
    @ObservedObject private var prefs = GameDevicePrefsStore.current()

    private var theme: ThemeManager { ThemeManager.shared }
    private var game: GameBlock? { prefs.prefs.hidden ? nil : viewModel.game }

    init(viewModel: ProgressionViewModel? = nil) {
        _viewModel = StateObject(wrappedValue: viewModel ?? ProgressionViewModel())
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            VStack(spacing: 0) {
                GamePageHeader(title: ConceptText.dashboardTitle, onBack: { dismiss() })
                ScrollView(showsIndicators: false) {
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
                        Spacer().frame(height: MeeshySpacing.xl)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.vertical, MeeshySpacing.md)
                }
                .refreshable { await viewModel.load(forceNetwork: true) }
            }
        }
        .background(InteractivePopEnabler())
        .task { await viewModel.load() }
    }

    @ViewBuilder
    private func blocks(_ progress: EngagementProgress) -> some View {
        // Le trésor et la Flamme, côte à côte (#9383) : ce qu'aucun geste ne fait monter ensemble se lit ensemble.
        if let game { GameGaugesView(game: game) }
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
                Button {
                    HapticFeedback.light()
                    onOpen()
                } label: {
                    ProgressionConceptHead(concept: concept, name: ConceptText.name(concept), value: value, game: game)
                        .frame(minHeight: MeeshyControlSize.tapTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(ConceptText.name(concept) + ", " + value)
                .accessibilityHint(ConceptText.cardHint)
                .accessibilityAddTraits([.isButton, .isHeader])
                .accessibilityIdentifier("progression.dashboard.\(concept.rawValue)")
                if !facts.isEmpty {
                    ProgressionConceptFacts(facts: facts)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
