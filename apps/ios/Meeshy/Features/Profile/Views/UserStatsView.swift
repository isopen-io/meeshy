import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI
import Charts

/// « Mon activité » (#18591, ex-Statistiques) : mes trois compteurs (`UserActivityCards`) puis la frise des trente
/// derniers jours. Les badges ne s'y montrent plus : Ma Légende les porte, et les montrer ici en faisait deux vitrines.
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

    private var statsContent: some View {
        VStack(spacing: MeeshySpacing.xl) {
            if let errorMessage = viewModel.errorMessage {
                HStack(spacing: MeeshySpacing.md) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .semibold))
                        .foregroundStyle(MeeshyColors.error)
                        .accessibilityHidden(true)
                    Text(errorMessage)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                        .foregroundStyle(MeeshyColors.error)
                    Spacer()
                }
                .padding(MeeshySpacing.md)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .fill(MeeshyColors.error.opacity(MeeshyOpacity.subtle))
                )
            }
            statsCards
            if !viewModel.timeline.isEmpty {
                timelineChart
            }
            Spacer().frame(height: 40)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
    }

    // MARK: - Stats Cards

    private var statsCards: some View {
        VStack(spacing: MeeshySpacing.md) {
            ForEach(UserActivityCards.make(stats: viewModel.stats)) { card in
                statCard(card)
            }
        }
    }

    private func statCard(_ card: UserActivityCards.Card) -> some View {
        let color = card.colorHex
        return HStack(spacing: MeeshySpacing.md) {
            // Icône figée : glyphe décoratif verrouillé dans une puce 36×36 à géométrie fixe
            // (doctrine 74i/83i — la valeur/label scalent, le chip ne bouge pas). Masqué VoiceOver.
            Image(systemName: card.icon)
                .font(MeeshyFont.fixedGlyph(MeeshyIconSize.xl, weight: .semibold))
                .foregroundStyle(Color(hex: color))
                .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .fill(Color(hex: color).opacity(MeeshyOpacity.light))
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(card.value, format: .number)
                    .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold, design: .rounded))
                    .foregroundStyle(Color(hex: color))

                Text(card.label)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(theme.textMuted)
            }

            Spacer()
        }
        .padding(MeeshySpacing.mdPlus)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(theme.surfaceGradient(tint: color))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .stroke(theme.border(tint: color), lineWidth: 1)
                )
        )
        .accessibilityElement(children: .combine)
    }

    // MARK: - Timeline Chart

    /// La frise dit sa période, pas « ACTIVITÉ » : le titre de l'écran le dit déjà.
    static var timelineHeader: String {
        String(localized: "user.stats.last_30_days", defaultValue: "30 DERNIERS JOURS", bundle: .main)
    }

    private var timelineChart: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "chart.xyaxis.line")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundStyle(MeeshyColors.info)
                    .accessibilityHidden(true)
                Text(Self.timelineHeader)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold, design: .rounded))
                    .foregroundColor(MeeshyColors.info)
                    .tracking(1.2)
            }
            .padding(.leading, MeeshySpacing.xs)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            StatsTimelineChart(timeline: viewModel.timeline, color: MeeshyColors.tileBlueHex)
                .frame(height: 180)
                .padding(MeeshySpacing.mdPlus)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .fill(theme.surfaceGradient(tint: MeeshyColors.tileBlueHex))
                        .overlay(
                            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                                .stroke(theme.border(tint: MeeshyColors.tileBlueHex), lineWidth: 1)
                        )
                )
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
    @Published var isLoading = false
    @Published var errorMessage: String?

    private static let logger = MeeshyLog.logger(.stats)

    func load() async {
        let userId = AuthManager.shared.currentUser?.id ?? ""

        // Load stats from cache
        let cacheResult = await CacheCoordinator.shared.stats.load(for: userId)

        // Load timeline from cache.
        //
        // SWR: timeline data only matters when it has rows to render — both
        // fresh and stale variants satisfy the cache-first contract. The
        // stats branch below already drives the network revalidation when
        // appropriate, so we do not kick a separate refresh here.
        let timelineCacheKey = "timeline_\(userId)"
        let timelineCached = await CacheCoordinator.shared.timeline.load(for: timelineCacheKey)
        switch timelineCached {
        case .fresh(let cached, _), .stale(let cached, _):
            if !cached.isEmpty { timeline = cached }
        case .expired, .empty:
            break
        }

        switch cacheResult {
        case .fresh(let cached, _):
            stats = cached.first
        case .stale(let cached, _):
            stats = cached.first
            await refreshFromAPI(userId: userId)
        case .expired, .empty:
            isLoading = stats == nil
            await refreshFromAPI(userId: userId)
        }
    }

    private func refreshFromAPI(userId: String) async {
        do {
            async let statsTask = StatsService.shared.fetchStats()
            async let timelineTask = StatsService.shared.fetchTimeline(days: 30)
            let (s, t) = try await (statsTask, timelineTask)
            stats = s
            timeline = t
            errorMessage = nil
            await bestEffort("userStatsView.stats.save", category: .cache) { try await CacheCoordinator.shared.stats.save([s], for: userId) }
            await bestEffort("userStatsView.timeline.save", category: .cache) { try await CacheCoordinator.shared.timeline.save(t, for: "timeline_\(userId)") }
        } catch {
            UserStatsViewModel.logger.error("stats refresh failed: \(error.localizedDescription)")
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
