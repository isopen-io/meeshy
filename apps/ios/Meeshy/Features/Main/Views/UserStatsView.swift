import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI
import Charts

struct UserStatsView: View {
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @StateObject private var viewModel = UserStatsViewModel()

    private let accentColor = MeeshyColors.brandPrimaryHex

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }
        }
        .task { await viewModel.load() }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(MeeshyFont.relative(16, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel(String(localized: "a11y.back", bundle: .main))

            Spacer()

            Text(String(localized: "user.stats.title", defaultValue: "Statistiques", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Spacer()

            Color.clear.frame(width: 24, height: 24)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                statsCards
                if !viewModel.timeline.isEmpty {
                    timelineChart
                }
                achievementsSection
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    // MARK: - Stats Cards

    private var statsCards: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                statCard(value: "\(viewModel.stats?.totalMessages ?? 0)", label: String(localized: "user.stats.messages", defaultValue: "Messages", bundle: .main), color: MeeshyColors.brandPrimaryHex, icon: "bubble.left.fill")
                statCard(value: "\(viewModel.stats?.totalConversations ?? 0)", label: String(localized: "user.stats.conversations", defaultValue: "Conversations", bundle: .main), color: MeeshyColors.indigo300Hex, icon: "person.2.fill")
            }
            HStack(spacing: 12) {
                statCard(value: "\(viewModel.stats?.totalTranslations ?? 0)", label: String(localized: "user.stats.translations", defaultValue: "Traductions", bundle: .main), color: MeeshyColors.indigo600Hex, icon: "globe")
                statCard(value: "\(viewModel.stats?.languagesUsed ?? 0)", label: String(localized: "user.stats.languages", defaultValue: "Langues", bundle: .main), color: "3498DB", icon: "character.book.closed.fill")
            }
            HStack(spacing: 12) {
                statCard(value: "\(viewModel.stats?.memberDays ?? 0)j", label: String(localized: "user.stats.member", defaultValue: "Membre", bundle: .main), color: "F8B500", icon: "calendar")
                statCard(value: "\(viewModel.stats?.friendRequestsReceived ?? 0)", label: String(localized: "user.stats.requests", defaultValue: "Demandes", bundle: .main), color: "E91E63", icon: "person.badge.plus")
            }
        }
    }

    private func statCard(value: String, label: String, color: String, icon: String) -> some View {
        HStack(spacing: 12) {
            // Icône figée : glyphe décoratif verrouillé dans une puce 36×36 à géométrie fixe
            // (doctrine 74i/83i — la valeur/label scalent, le chip ne bouge pas). Masqué VoiceOver.
            Image(systemName: icon)
                .font(MeeshyFont.relative(20, weight: .semibold))
                .foregroundColor(Color(hex: color))
                .frame(width: 36, height: 36)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(hex: color).opacity(0.12))
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(MeeshyFont.relative(20, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: color))

                Text(label)
                    .font(MeeshyFont.relative(11, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: color))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: color), lineWidth: 1)
                )
        )
        .accessibilityElement(children: .combine)
    }

    // MARK: - Timeline Chart

    private var timelineChart: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "chart.xyaxis.line")
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(MeeshyColors.info)
                    .accessibilityHidden(true)
                Text(String(localized: "user.stats.activity", defaultValue: "ACTIVITE", bundle: .main))
                    .font(MeeshyFont.relative(11, weight: .bold, design: .rounded))
                    .foregroundColor(MeeshyColors.info)
                    .tracking(1.2)
            }
            .padding(.leading, 4)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            StatsTimelineChart(timeline: viewModel.timeline, color: "3498DB")
                .frame(height: 180)
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(theme.surfaceGradient(tint: "3498DB"))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(theme.border(tint: "3498DB"), lineWidth: 1)
                        )
                )
        }
    }

    // MARK: - Achievements

    private var achievementsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "trophy.fill")
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(MeeshyColors.warning)
                    .accessibilityHidden(true)
                Text(String(localized: "user.stats.badges", defaultValue: "BADGES", bundle: .main))
                    .font(MeeshyFont.relative(11, weight: .bold, design: .rounded))
                    .foregroundColor(MeeshyColors.warning)
                    .tracking(1.2)
            }
            .padding(.leading, 4)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(viewModel.stats?.achievements ?? []) { achievement in
                    AchievementBadgeView(achievement: achievement)
                }
            }
        }
    }
}

// MARK: - ViewModel

@MainActor
final class UserStatsViewModel: ObservableObject {
    @Published var stats: UserStats?
    @Published var timeline: [TimelinePoint] = []
    @Published var isLoading = false

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "stats")

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
            try? await CacheCoordinator.shared.stats.save([s], for: userId)
            try? await CacheCoordinator.shared.timeline.save(t, for: "timeline_\(userId)")
        } catch {
            UserStatsViewModel.logger.error("stats refresh failed: \(error.localizedDescription)")
        }
        isLoading = false
    }
}
