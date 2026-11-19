import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

/// « Mon activité » (#18591, ex-Statistiques) : mes trois compteurs puis la frise des trente derniers jours. Les badges
/// ne s'y montrent plus : Ma Légende les porte, et les montrer ici en faisait deux vitrines.
///
/// L'écran est FAIT DU KIT (#19635, loi 12) : la bande de chiffres K34 dans une carte de groupe K43, la frise K50
/// (`StatsTimelineChart`), l'échec en bloc d'état K38 avec « Réessayer » (loi 8). Le squelette ne tient que la place
/// d'une donnée que ni le cache ni le serveur n'ont encore servie.
struct UserStatsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.isPresented) private var isPresented
    @Environment(\.meeshyPanelDismiss) private var panelDismiss
    /// Retour operant dans les trois contextes de presentation : pile iPhone,
    /// panneau droit iPad (ni pile ni modale — d'ou l'inertie historique), sheet.
    private var back: PanelBackAction {
        PanelBackAction(isPresented: isPresented, dismiss: dismiss, panelDismiss: panelDismiss)
    }
    private var theme: ThemeManager { ThemeManager.shared }
    @StateObject private var viewModel = UserStatsViewModel()

    private let accentColor = MeeshyColors.brandPrimaryHex

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            // Retour en verre de l'en-tête partagé (#6481). `back()` reste le
            // geste : l'écran s'ouvre aussi depuis le Profil, une route et le
            // panneau droit iPad.
            CollapsibleHeaderPage(
                title: String(localized: "user.stats.my_activity", defaultValue: "Mon activité", bundle: .main),
                onBack: { back() },
                titleColor: theme.textPrimary,
                backArrowColor: Color(hex: accentColor),
                backgroundColor: theme.backgroundPrimary
            ) {
                statsContent
            }
        }
        .task { await viewModel.load() }
    }

    // MARK: - Content

    /// L'échec et la frise paraissent en fondu à la réponse du réseau ; le contenu ne saute plus.
    private var statsContent: some View {
        VStack(spacing: MeeshySpacing.xl) {
            if let failure = viewModel.failure {
                failureBlock(failure)
                    .meeshyTransition(.move(edge: .top).combined(with: .opacity))
            }
            figuresCard
            timelineSection
            Spacer().frame(height: 40)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
        .meeshyMotion(.rise, value: viewModel.failure)
        .meeshyMotion(.rise, value: viewModel.timeline.isEmpty)
    }

    // MARK: - L'échec (K38)

    /// Une erreur a toujours « Réessayer » (loi 8) ; elle ne retire rien de ce qui est affiché.
    private func failureBlock(_ failure: UserActivityScreenPlan.Failure) -> some View {
        MeeshyStateBlock(kind: failure.isOffline ? .offline : .error, title: Self.failureTitle(failure),
                         primary: MeeshyStateBlockAction(title: ProfilePublicationsCopy.retry,
                                                         systemImage: "arrow.clockwise",
                                                         isPending: viewModel.isRetrying,
                                                         perform: { Task { await viewModel.retry() } }),
                         art: .none, size: .compact, tint: Color(hex: accentColor),
                         isOverContent: failure.keepsContent)
            .accessibilityIdentifier("user.stats.failure")
    }

    /// Rien d'affiché : Mon activité est indisponible (hors ligne se dit hors ligne). Déjà affichée : elle n'a pas pu
    /// se mettre à jour, et ce qu'on lit reste.
    static func failureTitle(_ failure: UserActivityScreenPlan.Failure) -> String {
        guard failure.keepsContent else { return ProfileActivityBand.unavailableTitle(offline: failure.isOffline) }
        return String(localized: "user.stats.refresh_failed", defaultValue: "Mon activité n'a pas pu se mettre à jour", bundle: .main)
    }

    // MARK: - Les chiffres (K34)

    /// Les trois compteurs SONT la bande de chiffres du kit, à l'encre du texte : la carte reste à l'hôte (K43). Les
    /// valeurs et leurs noms viennent des cartes de Mon activité, comme sur ma fiche — jamais trois zéros inventés.
    private var figuresCard: some View {
        let isLoading = UserActivityScreenPlan.figuresAreLoading(hasStats: viewModel.stats != nil,
                                                                 hasSettled: viewModel.hasSettled)
        return MeeshyGroupCard(tint: Color(hex: accentColor)) {
            MeeshyFigureBand(items: ProfileActivityBand.figures(of: viewModel.stats, isLoading: isLoading),
                             isLoading: isLoading, emptyLabel: ProfileActivityBand.emptyLabel)
                .frame(maxWidth: .infinity)
                .padding(.vertical, MeeshySpacing.lg)
                .padding(.horizontal, MeeshySpacing.md)
        }
        .accessibilityIdentifier("user.stats.figures")
    }

    // MARK: - La frise (K50)

    /// La frise dit sa période, pas « ACTIVITÉ » : le titre de l'écran le dit déjà.
    static var timelineHeader: String {
        String(localized: "user.stats.last_30_days", defaultValue: "30 DERNIERS JOURS", bundle: .main)
    }

    @ViewBuilder
    private var timelineSection: some View {
        let phase = UserActivityScreenPlan.timeline(pointCount: viewModel.timeline.count,
                                                    hasSettled: viewModel.hasSettled,
                                                    failed: viewModel.failure != nil)
        if phase != .hidden {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: Self.timelineHeader, form: .overline)
                MeeshyGroupCard(tint: Color(hex: MeeshyColors.tileBlueHex)) {
                    StatsTimelineChart(timeline: viewModel.timeline, isLoading: phase == .skeleton,
                                       tint: Color(hex: MeeshyColors.tileBlueHex))
                        .padding(MeeshySpacing.mdPlus)
                }
            }
            .meeshyTransition(.opacity)
            .accessibilityIdentifier("user.stats.timeline")
        }
    }
}

// MARK: - ViewModel

@MainActor
final class UserStatsViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var stats: UserStats?
    @Published var timeline: [TimelinePoint] = []
    /// Faux tant que ni le cache ni le serveur n'ont répondu : c'est la seule fenêtre où un squelette se dessine.
    @Published private(set) var hasSettled = false
    @Published private(set) var failure: UserActivityScreenPlan.Failure?
    @Published private(set) var isRetrying = false

    private static let logger = MeeshyLog.logger(.stats)

    /// « Réessayer » relit le serveur quoi que dise le cache : c'est ce que l'utilisateur vient de demander.
    func retry() async {
        guard !isRetrying else { return }
        isRetrying = true
        await load(force: true)
        isRetrying = false
    }

    /// Le cache se peint d'abord ; compteurs et frise se relisent chacun selon SON cache (`UserActivityRefreshLaw`).
    func load(force: Bool = false) async {
        defer { hasSettled = true }
        let userId = AuthManager.shared.currentUser?.id ?? ""
        let cachedStats = await CacheCoordinator.shared.stats.load(for: userId)
        let cachedTimeline = await CacheCoordinator.shared.timeline.load(for: Self.timelineKey(userId))
        switch cachedStats {
        case .fresh(let cached, _), .stale(let cached, _): if let first = cached.first { stats = first }
        case .expired, .empty: break
        }
        switch cachedTimeline {
        case .fresh(let cached, _), .stale(let cached, _): if !cached.isEmpty { timeline = cached }
        case .expired, .empty: break
        }
        let statsFreshness = UserActivityRefreshLaw.freshness(of: cachedStats)
        let fetchesStats = force || UserActivityRefreshLaw.needsStatsFetch(stats: statsFreshness)
        let fetchesTimeline = force || UserActivityRefreshLaw.needsTimelineFetch(
            stats: statsFreshness, timeline: UserActivityRefreshLaw.freshness(of: cachedTimeline)
        )
        guard fetchesStats || fetchesTimeline else { return }
        async let statsFailed = refreshStats(fetchesStats, userId: userId)
        async let timelineFailed = refreshTimeline(fetchesTimeline, userId: userId)
        let failed = await [statsFailed, timelineFailed].contains(true)
        failure = UserActivityScreenPlan.failure(failed: failed, isOffline: NetworkMonitor.shared.isOffline,
                                                 hasContent: stats != nil || !timeline.isEmpty)
    }

    private static func timelineKey(_ userId: String) -> String { "timeline_\(userId)" }

    /// Vrai si la relecture demandée a échoué.
    private func refreshStats(_ fetches: Bool, userId: String) async -> Bool {
        guard fetches else { return false }
        do {
            let served = try await StatsService.shared.fetchStats()
            stats = served
            await bestEffort("userStatsView.stats.save", category: .cache) { try await CacheCoordinator.shared.stats.save([served], for: userId) }
            return false
        } catch {
            UserStatsViewModel.logger.error("stats refresh failed: \(error.localizedDescription)")
            return true
        }
    }

    private func refreshTimeline(_ fetches: Bool, userId: String) async -> Bool {
        guard fetches else { return false }
        do {
            let served = try await StatsService.shared.fetchTimeline(days: 30)
            timeline = served
            await bestEffort("userStatsView.timeline.save", category: .cache) { try await CacheCoordinator.shared.timeline.save(served, for: Self.timelineKey(userId)) }
            return false
        } catch {
            UserStatsViewModel.logger.error("timeline refresh failed: \(error.localizedDescription)")
            return true
        }
    }
}
