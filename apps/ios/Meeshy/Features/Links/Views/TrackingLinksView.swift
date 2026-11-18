import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct TrackingLinksView: View {
    @StateObject private var viewModel = TrackingLinksViewModel()
    @State private var showCreate = false

    private let accent = MeeshyColors.trackingAccent

    var body: some View {
        LinksPage(
            title: String(localized: "tracking.links.title", defaultValue: "Liens de suivi", bundle: .main),
            accent: accent,
            action: LinksPageAction(
                label: String(localized: "tracking.links.create.a11y", defaultValue: "Créer un lien de suivi", bundle: .main),
                perform: { showCreate = true }
            )
        ) {
            VStack(spacing: MeeshySpacing.xl) {
                SettingsSentence(text: String(localized: "tracking.links.orientation", defaultValue: "Un lien de suivi compte les clics et dit d'où ils viennent.", bundle: .main))
                    .padding(.horizontal, MeeshySpacing.lg)
                if let stats = viewModel.stats {
                    trackingStatsOverview(stats).padding(.horizontal, MeeshySpacing.lg)
                }
                linksSection.padding(.horizontal, MeeshySpacing.lg)
            }
            .padding(.top, MeeshySpacing.sm).padding(.bottom, 40)
        }
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.load() }
        .sheet(isPresented: $showCreate) {
            CreateTrackingLinkView { link in
                viewModel.links.insert(link, at: 0)
                Task { await viewModel.loadStats() }
            }
        }
    }

    /// Les chiffres de mes liens de suivi : la bande du kit (K34), un seul élément pour VoiceOver (#18871).
    private func trackingStatsOverview(_ stats: TrackingLinkStats) -> some View {
        MeeshyFigureBand(items: [
            MeeshyFigureItem(value: stats.totalLinks.formatted(), unit: String(localized: "tracking.links.stats.links", defaultValue: "Liens", bundle: .main)),
            MeeshyFigureItem(value: stats.totalClicks.formatted(), unit: String(localized: "tracking.links.stats.clicks", defaultValue: "Clics", bundle: .main)),
            MeeshyFigureItem(value: stats.uniqueClicks.formatted(), unit: String(localized: "tracking.links.stats.uniques", defaultValue: "Uniques", bundle: .main)),
            MeeshyFigureItem(value: stats.activeLinks.formatted(), unit: String(localized: "tracking.links.stats.active", defaultValue: "Actifs", bundle: .main)),
        ], size: .compact, emptyLabel: ProfileActivityBand.emptyLabel)
    }

    /// Mes liens de suivi en billets du kit (#19601) : l'en-tête K44, les états dessinés, et chaque lien en billet de
    /// rangée — ses clics, sa courbe et ses pays, Copier, et ses états En pause, Expiré.
    private var linksSection: some View {
        LinksPageSection(
            title: String(localized: "tracking.links.section.myLinks", defaultValue: "MES LIENS", bundle: .main),
            count: viewModel.links.count,
            phase: LinksPageLaw.phase(isLoading: viewModel.isLoading, didFail: viewModel.loadFailed,
                                      hasLinks: !viewModel.links.isEmpty),
            tint: accent,
            empty: LinksPageEmpty(
                title: String(localized: "tracking.links.empty.title", defaultValue: "Aucun lien de suivi", bundle: .main),
                createTitle: String(localized: "tracking.links.create.a11y", defaultValue: "Créer un lien de suivi", bundle: .main),
                onCreate: { showCreate = true }
            ),
            onRetry: { Task { await viewModel.refresh() } }
        ) {
            LinksPageTicketList(
                tickets: viewModel.links.map { LinksFaceSummary.ticket(tracking: $0, owner: owner) },
                accent: accent,
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

    /// À qui sont ces liens : un lien de suivi vers ma vitrine le dit (« Vers ma vitrine »).
    private var owner: LinksFaceOwner {
        LinksFaceOwner(username: AuthManager.shared.currentUser?.username, webOrigin: MeeshyConfig.shared.webOrigin)
    }

    private func destination(of ticket: LinksFaceTicket) -> ProfileCreatedLinkDestination {
        guard let link = viewModel.link(ticketId: ticket.id) else { return .route(.trackingLinks) }
        let model = viewModel
        return .tracking(link, onChanged: { model.apply($0) }, onDeleted: { model.remove(linkId: $0) })
    }

    /// Ce qui fait reconnaître un lien sous son billet : sa campagne, puis ses dates (règle 7 de l'épure).
    private func footnote(for link: TrackingLink) -> String {
        [link.campaign, TrackingLinkRowDates.line(for: link)].compactMap { $0 }.joined(separator: " · ")
    }
}

/// Ce qui permet de reconnaître un lien de suivi dans la liste : la date de création et, s'il a servi, celle de son
/// dernier clic (règle 7 de l'épure). Aucune date inventée : un lien jamais cliqué ne dit que sa création.
enum TrackingLinkRowDates {
    static func line(for link: TrackingLink, now: Date = Date(), locale: Locale = .current) -> String {
        let created = String(
            format: String(localized: "links.row.created", defaultValue: "Créé le %@", bundle: .main),
            link.createdAt.formatted(.dateTime.day().month(.abbreviated).year().locale(locale))
        )
        let lastClick = link.lastClickedAt.map { last in
            String(
                format: String(localized: "tracking.links.row.lastClick", defaultValue: "Dernier clic %@", bundle: .main),
                RelativeTimeFormatter.fullString(for: min(last, now), now: now, locale: locale)
            )
        }
        return [created, lastClick].compactMap { $0 }.joined(separator: " · ")
    }
}

@MainActor
class TrackingLinksViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var links: [TrackingLink] = []
    @Published var stats: TrackingLinkStats? = nil
    @Published var isLoading = false
    /// La dernière relecture a échoué : sans rien en cache, la page dit l'erreur et offre « Réessayer ».
    @Published var loadFailed = false

    private let switches: ProfileLinksSwitches

    init(switches: ProfileLinksSwitches = .live) {
        self.switches = switches
    }

    func load() async {
        let cached = await CacheCoordinator.shared.trackingLinks.load(for: "list")
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
        async let l = TrackingLinkService.shared.listLinks()
        async let s = TrackingLinkService.shared.fetchStats()
        let fetched = try? await l
        let fetchedStats = try? await s
        links = LinksPageLaw.kept(current: links, fetched: fetched)
        loadFailed = fetched == nil
        if let fetchedStats { stats = fetchedStats }
        if let fetched { await bestEffort("trackingLinksView.trackingLinks.save", category: .cache) { try await CacheCoordinator.shared.trackingLinks.save(fetched, for: "list") } }
        isLoading = false
    }

    func loadStats() async {
        stats = try? await TrackingLinkService.shared.fetchStats()
    }

    func link(ticketId: String) -> TrackingLink? {
        links.first { "tracking:\($0.id)" == ticketId }
    }

    func setActive(_ isActive: Bool, ticketId: String) async -> Bool {
        guard let link = link(ticketId: ticketId) else { return false }
        return await setActive(isActive, linkId: link.id)
    }

    /// « Lien actif » posé depuis le billet d'un lien en pause : tout de suite, puis le serveur ; un refus se défait.
    func setActive(_ isActive: Bool, linkId: String) async -> Bool {
        guard let link = links.first(where: { $0.id == linkId }) else { return false }
        replace(link.withActive(isActive))
        do {
            try await switches.tracking(link.token, isActive)
            return true
        } catch {
            replace(link)
            return false
        }
    }

    /// Le lien tel que son détail l'a laissé (interrupteur, modification) : le billet et le cache le reprennent.
    func apply(_ link: TrackingLink) {
        replace(link)
    }

    /// Le lien supprimé depuis son détail quitte la page et le cache.
    func remove(linkId: String) {
        links = links.filter { $0.id != linkId }
        persist()
    }

    private func replace(_ link: TrackingLink) {
        links = links.map { $0.id == link.id ? link : $0 }
        persist()
    }

    private func persist() {
        let snapshot = links
        Task { await bestEffort("trackingLinksView.trackingLinks.save.2", category: .cache) { try await CacheCoordinator.shared.trackingLinks.save(snapshot, for: "list") } }
    }
}
