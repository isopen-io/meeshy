import SwiftUI
import MeeshySDK
import MeeshyUI
import os

// MARK: - WidgetPreviewView

struct WidgetPreviewView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject var conversationListViewModel: ConversationListViewModel
    @EnvironmentObject var router: Router

    @State private var animatedUnreadCount: Int = 0
    @State private var showCards = false
    @StateObject private var affiliateVM = AffiliateViewModel()
    @State private var trackingStats: TrackingLinkStats? = nil
    @State private var shareStats: MyShareLinkStats? = nil
    @State private var communityLinks: [CommunityLink] = []
    @State private var showCreateShareLink = false

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "widget")

    private var totalUnread: Int {
        conversationListViewModel.totalUnreadCount
    }

    private var recentConversations: [Conversation] {
        Array(
            conversationListViewModel.conversations
                .filter { $0.isActive }
                .sorted { $0.lastMessageAt > $1.lastMessageAt }
                .prefix(3)
        )
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 20) {
                    unreadCountCard
                        .staggeredAppear(index: 0, baseDelay: 0.08)

                    recentConversationsCard
                        .staggeredAppear(index: 1, baseDelay: 0.08)

                    linksOverviewSection
                        .staggeredAppear(index: 2, baseDelay: 0.08)

                    quickActionsCard
                        .staggeredAppear(index: 3, baseDelay: 0.08)

                    widgetHintBanner
                        .staggeredAppear(index: 4, baseDelay: 0.08)

                    Color.clear.frame(height: 40)
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
            }
            .background(
                MeeshyColors.mainBackgroundGradient(isDark: theme.mode.isDark)
                    .ignoresSafeArea()
            )
            .navigationTitle("Tableau de bord")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(theme.textMuted)
                    }
                    .accessibilityLabel("Fermer le tableau de bord")
                }
            }
        }
        .task {
            await affiliateVM.load()
            async let t = TrackingLinkService.shared.fetchStats()
            async let s = ShareLinkService.shared.fetchMyStats()
            async let c = CommunityLinkService.shared.listCommunityLinks()
            trackingStats = try? await t
            shareStats = try? await s
            communityLinks = (try? await c) ?? []
        }
        .sheet(isPresented: $showCreateShareLink) {
            CreateShareLinkView { _ in
                Task { shareStats = try? await ShareLinkService.shared.fetchMyStats() }
            }
        }
        .onAppear {
            animateUnreadCounter()
        }
    }

    // MARK: - Unread Count Card

    private var unreadCountCard: some View {
        VStack(spacing: 8) {
            HStack {
                Image(systemName: totalUnread > 0 ? "message.badge.filled.fill" : "message.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.white.opacity(0.9))
                Spacer()
                Text(Date(), style: .time)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white.opacity(0.6))
            }

            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("\(animatedUnreadCount)")
                    .font(.system(size: 56, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                    .contentTransition(.numericText())

                VStack(alignment: .leading, spacing: 2) {
                    Text("messages")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.white.opacity(0.8))
                    Text("non lus")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.white.opacity(0.8))
                }
                .padding(.bottom, 10)

                Spacer()
            }

            if totalUnread == 0 {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 14))
                    Text("Tout est lu")
                        .font(.system(size: 13, weight: .semibold))
                }
                .foregroundColor(.white.opacity(0.8))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 2)
            }
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: totalUnread > 0
                            ? [Color(hex: "FF2E63"), Color(hex: "A855F7")]
                            : [Color(hex: "08D9D6"), Color(hex: "4ECDC4")],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .shadow(
                    color: (totalUnread > 0 ? Color(hex: "FF2E63") : Color(hex: "08D9D6")).opacity(0.3),
                    radius: 16,
                    y: 8
                )
        )
    }

    // MARK: - Recent Conversations Card

    private var recentConversationsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "clock.arrow.circlepath")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(MeeshyColors.cyan)
                Text("Conversations r\u{00e9}centes")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                Spacer()
            }

            if recentConversations.isEmpty {
                HStack {
                    Spacer()
                    VStack(spacing: 6) {
                        Image(systemName: "bubble.left.and.bubble.right")
                            .font(.system(size: 24))
                            .foregroundColor(theme.textMuted.opacity(0.5))
                        Text("Aucune conversation")
                            .font(.system(size: 13))
                            .foregroundColor(theme.textMuted)
                    }
                    .padding(.vertical, 16)
                    Spacer()
                }
            } else {
                ForEach(Array(recentConversations.enumerated()), id: \.element.id) { index, conv in
                    recentConversationRow(conv, index: index)
                    if index < recentConversations.count - 1 {
                        Divider()
                            .overlay(theme.textMuted.opacity(0.1))
                    }
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(
                            MeeshyColors.glassBorderGradient(isDark: theme.mode.isDark),
                            lineWidth: 1
                        )
                )
                .shadow(color: .black.opacity(0.08), radius: 12, y: 4)
        )
    }

    private func recentConversationRow(_ conv: Conversation, index: Int) -> some View {
        Button {
            HapticFeedback.light()
            dismiss()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                router.navigateToConversation(conv)
            }
        } label: {
            HStack(spacing: 12) {
                MeeshyAvatar(
                    name: conv.name,
                    mode: .custom(40),
                    accentColor: conv.accentColor,
                    avatarURL: conv.avatar
                )

                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(conv.name)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)
                        Spacer()
                        Text(formatRelativeTime(conv.lastMessageAt))
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }

                    if let preview = conv.lastMessagePreview, !preview.isEmpty {
                        Text(preview)
                            .font(.system(size: 12))
                            .foregroundColor(theme.textMuted)
                            .lineLimit(1)
                    }
                }

                if conv.unreadCount > 0 {
                    Text("\(conv.unreadCount)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white)
                        .frame(minWidth: 20, minHeight: 20)
                        .background(
                            Circle()
                                .fill(MeeshyColors.pink)
                        )
                }
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ouvrir la conversation avec \(conv.name)")
    }

    // MARK: - Quick Actions Card

    private var quickActionsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(MeeshyColors.orange)
                Text("Actions rapides")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                Spacer()
            }

            LazyVGrid(
                columns: [GridItem(.flexible()), GridItem(.flexible())],
                spacing: 12
            ) {
                quickActionButton(
                    icon: "square.and.pencil",
                    label: "Nouveau",
                    gradient: [Color(hex: "08D9D6"), Color(hex: "4ECDC4")]
                ) {
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        router.push(.newConversation)
                    }
                }

                quickActionButton(
                    icon: "link.badge.plus",
                    label: "Partager",
                    gradient: [Color(hex: "08D9D6"), Color(hex: "2ECC71")]
                ) {
                    showCreateShareLink = true
                }

                quickActionButton(
                    icon: "megaphone.fill",
                    label: "Post",
                    gradient: [Color(hex: "A855F7"), Color(hex: "6366F1")]
                ) {
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        NotificationCenter.default.post(name: .openFeedComposer, object: nil)
                    }
                }

                quickActionButton(
                    icon: "gearshape.fill",
                    label: "R\u{00e9}glages",
                    gradient: [Color(hex: "FF6B6B"), Color(hex: "FF2E63")]
                ) {
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        router.push(.settings)
                    }
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(
                            MeeshyColors.glassBorderGradient(isDark: theme.mode.isDark),
                            lineWidth: 1
                        )
                )
                .shadow(color: .black.opacity(0.08), radius: 12, y: 4)
        )
    }

    private func quickActionButton(icon: String, label: String, gradient: [Color], action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.medium()
            action()
        } label: {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 50, height: 50)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: gradient,
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .shadow(color: gradient.first?.opacity(0.3) ?? .clear, radius: 8, y: 4)
                    )

                Text(label)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    // MARK: - Links Overview Section

    private var linksOverviewSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "link")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textSecondary)
                Text("MES LIENS")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(theme.textSecondary)
                    .kerning(0.8)
                Spacer()
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    linkTypeCard(
                        title: "Parrainage",
                        icon: "person.badge.plus",
                        color: "2ECC71",
                        stat1: "\(affiliateVM.tokens.count) lien(s)",
                        stat2: "\(affiliateVM.tokens.reduce(0) { $0 + $1.referralCount }) inscrits"
                    ) {
                        dismiss()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            router.push(.affiliate)
                        }
                    }

                    linkTypeCard(
                        title: "Partage",
                        icon: "link.badge.plus",
                        color: "08D9D6",
                        stat1: "\(shareStats?.totalLinks ?? 0) lien(s)",
                        stat2: "\(shareStats?.totalUses ?? 0) rejoints"
                    ) {
                        dismiss()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            router.push(.shareLinks)
                        }
                    }

                    linkTypeCard(
                        title: "Tracking",
                        icon: "chart.bar.fill",
                        color: "A855F7",
                        stat1: "\(trackingStats?.totalLinks ?? 0) lien(s)",
                        stat2: "\(trackingStats?.totalClicks ?? 0) clics"
                    ) {
                        dismiss()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            router.push(.trackingLinks)
                        }
                    }

                    linkTypeCard(
                        title: "Communaut\u{00e9}",
                        icon: "person.3.fill",
                        color: "F8B500",
                        stat1: "\(communityLinks.count) groupe(s)",
                        stat2: "\(communityLinks.reduce(0) { $0 + $1.memberCount }) membres"
                    ) {
                        dismiss()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            router.push(.communityLinks)
                        }
                    }
                }
                .padding(.horizontal, 1)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(
                            MeeshyColors.glassBorderGradient(isDark: theme.mode.isDark),
                            lineWidth: 1
                        )
                )
                .shadow(color: .black.opacity(0.08), radius: 12, y: 4)
        )
    }

    @ViewBuilder
    private func linkTypeCard(
        title: String, icon: String, color: String,
        stat1: String, stat2: String,
        onTap: @escaping () -> Void
    ) -> some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(hex: color).opacity(0.15))
                        .frame(width: 36, height: 36)
                    Image(systemName: icon)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Color(hex: color))
                }

                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textPrimary)

                VStack(alignment: .leading, spacing: 2) {
                    Text(stat1)
                        .font(.system(size: 11))
                        .foregroundColor(theme.textMuted)
                    Text(stat2)
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: color))
                }
            }
            .padding(12)
            .frame(width: 110)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(Color(hex: color).opacity(0.2), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Widget Hint Banner

    private var widgetHintBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "apps.iphone")
                .font(.system(size: 24, weight: .medium))
                .foregroundStyle(
                    LinearGradient(
                        colors: [MeeshyColors.cyan, MeeshyColors.purple],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            VStack(alignment: .leading, spacing: 2) {
                Text("Widgets Meeshy")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                Text("Ajoutez ces widgets a votre ecran d'accueil pour un acces rapide.")
                    .font(.system(size: 12))
                    .foregroundColor(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(theme.mode.isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(
                            MeeshyColors.glassBorderGradient(isDark: theme.mode.isDark),
                            lineWidth: 0.5
                        )
                )
        )
    }

    // MARK: - Helpers

    private func animateUnreadCounter() {
        let target = totalUnread
        guard target > 0 else {
            animatedUnreadCount = 0
            return
        }

        animatedUnreadCount = 0
        let steps = min(target, 30)
        let interval = 0.4 / Double(steps)

        for step in 1...steps {
            let value = Int(Double(target) * Double(step) / Double(steps))
            DispatchQueue.main.asyncAfter(deadline: .now() + interval * Double(step)) {
                withAnimation(.easeOut(duration: 0.08)) {
                    animatedUnreadCount = value
                }
            }
        }
    }

    private func formatRelativeTime(_ date: Date) -> String {
        let interval = Date().timeIntervalSince(date)
        if interval < 60 { return "Maintenant" }
        if interval < 3600 { return "\(Int(interval / 60))min" }
        if interval < 86400 { return "\(Int(interval / 3600))h" }
        if interval < 604800 { return "\(Int(interval / 86400))j" }
        let formatter = DateFormatter()
        formatter.dateFormat = "dd/MM"
        return formatter.string(from: date)
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let openFeedComposer = Notification.Name("openFeedComposer")
}
