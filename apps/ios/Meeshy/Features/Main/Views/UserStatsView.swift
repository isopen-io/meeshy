import SwiftUI
import MeeshySDK
import Charts

struct UserStatsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel = UserStatsViewModel()

    private let accentColor = "4ECDC4"

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
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Text("Statistiques")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Color.clear.frame(width: 24, height: 24)
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
                statCard(value: "\(viewModel.stats?.totalMessages ?? 0)", label: "Messages", color: "FF6B6B", icon: "bubble.left.fill")
                statCard(value: "\(viewModel.stats?.totalConversations ?? 0)", label: "Conversations", color: "4ECDC4", icon: "person.2.fill")
            }
            HStack(spacing: 12) {
                statCard(value: "\(viewModel.stats?.totalTranslations ?? 0)", label: "Traductions", color: "9B59B6", icon: "globe")
                statCard(value: "\(viewModel.stats?.languagesUsed ?? 0)", label: "Langues", color: "3498DB", icon: "character.book.closed.fill")
            }
            HStack(spacing: 12) {
                statCard(value: "\(viewModel.stats?.memberDays ?? 0)j", label: "Membre", color: "F8B500", icon: "calendar")
                statCard(value: "\(viewModel.stats?.friendRequestsReceived ?? 0)", label: "Demandes", color: "E91E63", icon: "person.badge.plus")
            }
        }
    }

    private func statCard(value: String, label: String, color: String, icon: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(Color(hex: color))
                .frame(width: 36, height: 36)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(hex: color).opacity(0.12))
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: color))

                Text(label)
                    .font(.system(size: 11, weight: .medium))
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
    }

    // MARK: - Timeline Chart

    private var timelineChart: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "chart.xyaxis.line")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: "3498DB"))
                Text("ACTIVITE")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: "3498DB"))
                    .tracking(1.2)
            }
            .padding(.leading, 4)

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
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: "F8B500"))
                Text("BADGES")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: "F8B500"))
                    .tracking(1.2)
            }
            .padding(.leading, 4)

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

    func load() async {
        isLoading = true
        do {
            async let statsTask = StatsService.shared.fetchStats()
            async let timelineTask = StatsService.shared.fetchTimeline(days: 30)
            let (s, t) = try await (statsTask, timelineTask)
            stats = s
            timeline = t
        } catch {}
        isLoading = false
    }
}
