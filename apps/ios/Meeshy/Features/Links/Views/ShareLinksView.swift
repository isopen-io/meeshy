import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - ShareLinksView

struct ShareLinksView: View {
    private var theme: ThemeManager { ThemeManager.shared }
    @StateObject private var viewModel = ShareLinksViewModel()
    @Environment(\.meeshyConversationList) private var conversationListViewModel
    @State private var showCreate = false

    private let accentColor = MeeshyColors.brandPrimaryHex

    var body: some View {
        LinksPage(
            title: String(localized: "share.links.title", defaultValue: "Liens de partage", bundle: .main),
            accent: Color(hex: accentColor),
            action: LinksPageAction(
                label: String(localized: "share.links.create.a11y", defaultValue: "Créer un lien de partage", bundle: .main),
                perform: { showCreate = true }
            )
        ) {
            VStack(spacing: MeeshySpacing.xl) {
                Text(String(localized: "share.links.intro", defaultValue: "Un lien invite dans une conversation : vous fixez ce que les invités peuvent faire et jusqu’à quand.", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                    .foregroundStyle(theme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, MeeshySpacing.lg)
                if let stats = viewModel.stats {
                    shareLinkStatsOverview(stats)
                        .padding(.horizontal, MeeshySpacing.lg)
                }
                linksSection
                    .padding(.horizontal, MeeshySpacing.lg)
            }
            .padding(.top, MeeshySpacing.sm)
            .padding(.bottom, 40)
        }
        .refreshable {
            await viewModel.load(.pullToRefresh)
        }
        .task { await viewModel.load() }
        .sheet(isPresented: $showCreate) {
            CreateShareLinkView { _ in
                Task { await viewModel.load(.linkCreated) }
            }
            .conversationListObject(conversationListViewModel)
        }
    }

    // MARK: - Stats overview

    /// Les chiffres de mes liens de partage : la bande du kit (K34), un seul élément pour VoiceOver (#18871).
    private func shareLinkStatsOverview(_ stats: MyShareLinkStats) -> some View {
        MeeshyFigureBand(items: [
            MeeshyFigureItem(value: stats.totalLinks.formatted(), unit: String(localized: "share.links.stats.total", defaultValue: "Liens", bundle: .main)),
            MeeshyFigureItem(value: stats.activeLinks.formatted(), unit: String(localized: "share.links.stats.active", defaultValue: "Actifs", bundle: .main)),
            MeeshyFigureItem(value: stats.totalUses.formatted(), unit: String(localized: "share.links.stats.joined", defaultValue: "Rejoints", bundle: .main)),
        ], size: .compact, emptyLabel: ProfileActivityBand.emptyLabel)
    }

    // MARK: - Links list

    /// Mes liens de partage en billets du kit (#19601) : l'en-tête K44, les états dessinés, et chaque lien en billet
    /// de rangée — ses arrivées sur son plafond (K42), Copier, et ses états Complet, En pause, Expiré.
    private var linksSection: some View {
        LinksPageSection(
            title: String(localized: "share.links.my_links", defaultValue: "MES LIENS", bundle: .main),
            count: viewModel.links.count,
            phase: LinksPageLaw.phase(isLoading: viewModel.isLoading, didFail: viewModel.loadFailed,
                                      hasLinks: !viewModel.links.isEmpty),
            tint: MeeshyColors.shareAccent,
            empty: LinksPageEmpty(
                title: String(localized: "share.links.empty.title", defaultValue: "Aucun lien de partage", bundle: .main),
                createTitle: String(localized: "share.links.create.a11y", defaultValue: "Créer un lien de partage", bundle: .main),
                onCreate: { showCreate = true }
            ),
            onRetry: { Task { await viewModel.load(.pullToRefresh) } }
        ) {
            LinksPageTicketList(
                tickets: viewModel.links.map { LinksFaceSummary.ticket(share: $0) },
                accent: MeeshyColors.shareAccent,
                footnote: { ticket in viewModel.link(ticketId: ticket.id).map { footnote(for: $0) } },
                destination: { ticket in destination(of: ticket) },
                onSwitch: { ticket, isActive in
                    Task {
                        let accepted = await viewModel.setActive(isActive, ticketId: ticket.id)
                        LinksPageSwitchFeedback.report(accepted: accepted)
                    }
                }
            )
        }
    }

    private func destination(of ticket: LinksFaceTicket) -> ProfileCreatedLinkDestination {
        guard let link = viewModel.link(ticketId: ticket.id) else { return .route(.shareLinks) }
        return .share(link, onChanged: { viewModel.replace($0) }, onDeleted: { viewModel.remove($0) })
    }

    private func createdOnLabel(_ link: MyShareLink) -> String {
        String(format: String(localized: "share.links.createdOn", defaultValue: "Créé le %@", bundle: .main), ShareLinkDateFormat.day(link.createdAt))
    }

    /// Ce qui fait reconnaître un lien sous son billet : sa conversation, puis sa date de création (règle 7 de l'épure).
    private func footnote(for link: MyShareLink) -> String {
        [link.conversationTitle, createdOnLabel(link)].compactMap { $0 }.joined(separator: " · ")
    }
}

// MARK: - Reload law

/// Ce qui demande la liste : la venue à l'écran se contente d'un cache frais ;
/// un geste de l'utilisateur (tirer, créer un lien) exige la vérité du serveur.
nonisolated enum ShareLinksReloadTrigger: Equatable, Sendable {
    case appear
    case pullToRefresh
    case linkCreated
}

/// #9195 — un cache frais ne dispense du réseau qu'à l'affichage ; une liste
/// qui n'a pas pu être relue reste celle qu'on montrait.
nonisolated enum ShareLinksReloadLaw {
    static func mustFetch(_ trigger: ShareLinksReloadTrigger, cacheIsFresh: Bool) -> Bool {
        trigger != .appear || !cacheIsFresh
    }

    static func linksAfterFetch(current: [MyShareLink], fetched: [MyShareLink]?) -> [MyShareLink] {
        fetched ?? current
    }
}

// MARK: - ViewModel

@MainActor
class ShareLinksViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var links: [MyShareLink] = []
    @Published var stats: MyShareLinkStats? = nil
    @Published var isLoading = false
    /// La dernière relecture a échoué : sans rien en cache, la page dit l'erreur et offre « Réessayer ».
    @Published var loadFailed = false

    private let switches: ProfileLinksSwitches

    init(switches: ProfileLinksSwitches = .live) {
        self.switches = switches
    }

    func load(_ trigger: ShareLinksReloadTrigger = .appear) async {
        let cached = await CacheCoordinator.shared.shareLinks.load(for: "list")
        let cacheIsFresh: Bool
        switch cached {
        case .fresh(let data, _):
            links = data
            cacheIsFresh = true
        case .stale(let data, _):
            links = data
            cacheIsFresh = false
        case .expired, .empty:
            isLoading = links.isEmpty
            cacheIsFresh = false
        }
        guard ShareLinksReloadLaw.mustFetch(trigger, cacheIsFresh: cacheIsFresh) else {
            if stats == nil { await loadStats() }
            return
        }
        await refreshFromAPI()
    }

    private func refreshFromAPI() async {
        async let l = ShareLinkService.shared.listMyLinks()
        async let s = ShareLinkService.shared.fetchMyStats()
        let fetched = try? await l
        let fetchedStats = try? await s
        links = ShareLinksReloadLaw.linksAfterFetch(current: links, fetched: fetched)
        loadFailed = fetched == nil
        if let fetchedStats { stats = fetchedStats }
        if let fetched { await bestEffort("shareLinksView.shareLinks.save", category: .cache) { try await CacheCoordinator.shared.shareLinks.save(fetched, for: "list") } }
        isLoading = false
    }

    /// La fiche d'un lien (#7797) écrit ici sa valeur optimiste : revenir à
    /// la liste montre le lien tel qu'il vient d'être modifié, et le cache
    /// le garde pour le prochain démarrage.
    func replace(_ link: MyShareLink) {
        links = links.map { $0.id == link.id ? link : $0 }
        persist()
    }

    func link(ticketId: String) -> MyShareLink? {
        links.first { "share:\($0.id)" == ticketId }
    }

    func setActive(_ isActive: Bool, ticketId: String) async -> Bool {
        guard let link = link(ticketId: ticketId) else { return false }
        return await setActive(isActive, linkId: link.id)
    }

    /// « Lien actif » posé depuis le billet d'un lien en pause : le billet change tout de suite, le serveur confirme
    /// ensuite, et un refus défait le geste. Rend `false` quand le geste n'a pas tenu.
    func setActive(_ isActive: Bool, linkId: String) async -> Bool {
        guard let link = links.first(where: { $0.id == linkId }) else { return false }
        replace(link.withActive(isActive))
        do {
            try await switches.share(link.linkId, isActive)
            return true
        } catch {
            replace(link)
            return false
        }
    }

    func remove(_ linkId: String) {
        links.removeAll { $0.id == linkId }
        persist()
    }

    private func persist() {
        let snapshot = links
        Task { await bestEffort("shareLinksView.shareLinks.save.2", category: .cache) { try await CacheCoordinator.shared.shareLinks.save(snapshot, for: "list") } }
    }

    func loadStats() async {
        stats = try? await ShareLinkService.shared.fetchMyStats()
    }
}
