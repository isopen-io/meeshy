import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct CommunityLinksView: View {
    @StateObject private var viewModel = CommunityLinksViewModel()

    @Environment(\.routerCommands) private var router

    private let accent = MeeshyColors.communityAccent

    var body: some View {
        LinksPage(
            title: String(localized: "community.links.title", defaultValue: "Liens communauté", bundle: .main),
            accent: accent,
            action: LinksPageAction(
                label: String(localized: "community.links.create.a11y", defaultValue: "Créer une communauté", bundle: .main),
                perform: { router.push(.communityCreate) }
            )
        ) {
            VStack(spacing: MeeshySpacing.xl) {
                if !viewModel.links.isEmpty {
                    communityStatsOverview.padding(.horizontal, MeeshySpacing.lg)
                }
                communityLinksSection.padding(.horizontal, MeeshySpacing.lg)
            }
            .padding(.top, MeeshySpacing.sm).padding(.bottom, 40)
        }
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.load() }
    }

    /// Les chiffres de mes communautés : la bande du kit (K34), un seul élément pour VoiceOver (#19601).
    private var communityStatsOverview: some View {
        let stats = viewModel.stats
        return MeeshyFigureBand(items: [
            MeeshyFigureItem(value: stats.totalCommunities.formatted(), unit: String(localized: "community.links.stat.groups", defaultValue: "Groupes", bundle: .main)),
            MeeshyFigureItem(value: stats.activeCommunities.formatted(), unit: String(localized: "community.links.stat.active", defaultValue: "Actifs", bundle: .main)),
            MeeshyFigureItem(value: stats.totalMembers.formatted(), unit: String(localized: "community.links.stat.members", defaultValue: "Membres", bundle: .main)),
        ], size: .compact, emptyLabel: ProfileActivityBand.emptyLabel)
    }

    /// Mes communautés en billets du kit (#19601) : l'en-tête K44, les états dessinés, et chaque communauté en billet
    /// de rangée — ses membres et leurs visages (K48), Copier le lien d'invitation, ouvrir son détail.
    private var communityLinksSection: some View {
        LinksPageSection(
            title: String(localized: "community.links.section.mine", defaultValue: "MES COMMUNAUTÉS", bundle: .main),
            count: viewModel.links.count,
            phase: LinksPageLaw.phase(isLoading: viewModel.isLoading, didFail: viewModel.loadFailed,
                                      hasLinks: !viewModel.links.isEmpty),
            tint: accent,
            empty: LinksPageEmpty(
                title: String(localized: "community.links.empty.title", defaultValue: "Aucune communauté administrée", bundle: .main),
                createTitle: String(localized: "community.links.create.a11y", defaultValue: "Créer une communauté", bundle: .main),
                onCreate: { router.push(.communityCreate) }
            ),
            onRetry: { Task { await viewModel.refresh() } }
        ) {
            LinksPageTicketList(
                tickets: viewModel.links.map { LinksFaceSummary.ticket(community: $0) },
                accent: accent,
                footnote: { _ in nil },
                destination: { ticket in destination(of: ticket) },
                onSwitch: { _, _ in }
            )
        }
    }

    private func destination(of ticket: LinksFaceTicket) -> ProfileCreatedLinkDestination {
        guard let link = viewModel.links.first(where: { "community:\($0.id)" == ticket.id }) else {
            return .route(.communityLinks)
        }
        return .community(link)
    }
}

@MainActor
class CommunityLinksViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var links: [CommunityLink] = []
    @Published var isLoading = false
    /// La dernière relecture a échoué : sans rien en cache, la page dit l'erreur et offre « Réessayer ».
    @Published var loadFailed = false

    var stats: CommunityLinkStats { CommunityLinkService.shared.stats(links: links) }

    func load() async {
        let cached = await CacheCoordinator.shared.communityLinks.load(for: "list")
        switch cached {
        case .fresh(let data, _):
            links = data
            return
        case .stale(let data, _):
            links = data
            await refresh()
        case .expired, .empty:
            isLoading = links.isEmpty
            await refresh()
        }
    }

    /// Relit la liste ; un échec garde ce que la page montrait (cache d'abord).
    func refresh() async {
        let fetched = try? await CommunityLinkService.shared.listCommunityLinks()
        links = LinksPageLaw.kept(current: links, fetched: fetched)
        loadFailed = fetched == nil
        if let fetched { await bestEffort("communityLinksView.communityLinks.save", category: .cache) { try await CacheCoordinator.shared.communityLinks.save(fetched, for: "list") } }
        isLoading = false
    }
}
