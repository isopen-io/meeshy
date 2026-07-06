import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

// MARK: - WidgetPreviewView

struct WidgetPreviewView: View {
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @EnvironmentObject var conversationListViewModel: ConversationListViewModel
    @EnvironmentObject var router: Router

    var onNewConversation: (() -> Void)?

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
                VStack(spacing: MeeshySpacing.xl) {
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
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.top, MeeshySpacing.md)
            }
            .background(
                MeeshyColors.mainBackgroundGradient(isDark: isDark)
                    .ignoresSafeArea()
            )
            .navigationTitle(String(localized: "widget.preview.dashboard", defaultValue: "Tableau de bord", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(MeeshyFont.relative(22))
                            .foregroundStyle(theme.textMuted)
                    }
                    .accessibilityLabel(String(localized: "widget.preview.a11y.closeDashboard", defaultValue: "Fermer le tableau de bord", bundle: .main))
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
        VStack(spacing: MeeshySpacing.sm) {
            HStack {
                Image(systemName: totalUnread > 0 ? "message.badge.filled.fill" : "message.fill")
                    .font(MeeshyFont.relative(18, weight: .semibold))
                    .foregroundColor(.white.opacity(0.9))
                Spacer()
                Text(Date(), style: .time)
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(.white.opacity(0.6))
            }

            HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.xs) {
                Text("\(animatedUnreadCount)")
                    .font(MeeshyFont.relative(56, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                    .contentTransition(.numericText())

                VStack(alignment: .leading, spacing: MeeshySpacing.xs / 2) {
                    Text(String(localized: "widget.preview.messages", defaultValue: "messages", bundle: .main))
                        .font(MeeshyFont.relative(14, weight: .medium))
                        .foregroundColor(.white.opacity(0.8))
                    Text(String(localized: "widget.preview.unread", defaultValue: "non lus", bundle: .main))
                        .font(MeeshyFont.relative(14, weight: .medium))
                        .foregroundColor(.white.opacity(0.8))
                }
                .padding(.bottom, MeeshySpacing.sm + 2)

                Spacer()
            }

            if totalUnread == 0 {
                HStack(spacing: MeeshySpacing.xs + 2) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(MeeshyFont.relative(14))
                    Text(String(localized: "widget.preview.allRead", defaultValue: "Tout est lu", bundle: .main))
                        .font(MeeshyFont.relative(13, weight: .semibold))
                }
                .foregroundColor(.white.opacity(0.8))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 2)
            }
        }
        .padding(MeeshySpacing.xl)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: totalUnread > 0
                            ? [MeeshyColors.error, MeeshyColors.indigo600]
                            : [MeeshyColors.indigo400, MeeshyColors.indigo500],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .shadow(
                    color: (totalUnread > 0 ? MeeshyColors.error : MeeshyColors.indigo400).opacity(0.3),
                    radius: MeeshySpacing.lg,
                    y: MeeshySpacing.sm
                )
        )
    }

    // MARK: - Recent Conversations Card

    private var recentConversationsCard: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            HStack {
                Image(systemName: "clock.arrow.circlepath")
                    .font(MeeshyFont.relative(14, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo400)
                Text(String(localized: "widget.preview.recentConversations", defaultValue: "Conversations r\u{00e9}centes", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                Spacer()
            }

            if recentConversations.isEmpty {
                EmptyStateView(
                    icon: "bubble.left.and.bubble.right",
                    title: String(localized: "widget.preview.noConversations", defaultValue: "Aucune conversation", bundle: .main),
                    subtitle: ""
                )
                .padding(.vertical, 16)
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
        .padding(MeeshySpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous)
                        .stroke(
                            MeeshyColors.glassBorderGradient(isDark: isDark),
                            lineWidth: 1
                        )
                )
                .shadow(color: .black.opacity(0.08), radius: MeeshySpacing.md, y: MeeshySpacing.xs)
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
            HStack(spacing: MeeshySpacing.md) {
                MeeshyAvatar(
                    name: conv.name,
                    context: .conversationList,
                    accentColor: conv.accentColor,
                    avatarURL: conv.avatar
                )

                VStack(alignment: .leading, spacing: MeeshySpacing.xs - 1) {
                    HStack {
                        Text(conv.name)
                            .font(MeeshyFont.relative(14, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)
                        Spacer()
                        Text(RelativeTimeFormatter.shortString(for: conv.lastMessageAt))
                            .font(MeeshyFont.relative(11, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }

                    if let preview = conv.lastMessagePreview, !preview.isEmpty {
                        Text(preview)
                            .font(MeeshyFont.relative(12))
                            .foregroundColor(theme.textMuted)
                            .lineLimit(1)
                    }
                }

                if conv.userState.unreadCount > 0 {
                    Text("\(conv.userState.unreadCount)")
                        .font(MeeshyFont.relative(11, weight: .bold))
                        .foregroundColor(.white)
                        .frame(minWidth: 20, minHeight: 20)
                        .background(
                            Circle()
                                .fill(MeeshyColors.indigo500)
                        )
                }
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "widget.preview.a11y.openConversation", defaultValue: "Ouvrir la conversation avec \(conv.name)", bundle: .main))
    }

    // MARK: - Quick Actions Card

    private var quickActionsCard: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            HStack {
                Image(systemName: "bolt.fill")
                    .font(MeeshyFont.relative(14, weight: .semibold))
                    .foregroundColor(MeeshyColors.warning)
                Text(String(localized: "widget.preview.quickActions", defaultValue: "Actions rapides", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                Spacer()
            }

            LazyVGrid(
                columns: [GridItem(.flexible()), GridItem(.flexible())],
                spacing: MeeshySpacing.md
            ) {
                quickActionButton(
                    icon: "square.and.pencil",
                    label: String(localized: "widget.preview.action.new", defaultValue: "Nouveau", bundle: .main),
                    gradient: [MeeshyColors.indigo500, MeeshyColors.indigo700]
                ) {
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        onNewConversation?()
                    }
                }

                quickActionButton(
                    icon: "link.badge.plus",
                    label: String(localized: "widget.preview.action.share", defaultValue: "Partager", bundle: .main),
                    gradient: [MeeshyColors.shareAccent, MeeshyColors.indigo500]
                ) {
                    showCreateShareLink = true
                }

                quickActionButton(
                    icon: "megaphone.fill",
                    label: String(localized: "widget.preview.action.post", defaultValue: "Post", bundle: .main),
                    gradient: [MeeshyColors.purple500, MeeshyColors.indigo500]
                ) {
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        NotificationCenter.default.post(name: .openFeedComposer, object: nil)
                    }
                }

                quickActionButton(
                    icon: "gearshape.fill",
                    label: String(localized: "widget.preview.action.settings", defaultValue: "Réglages", bundle: .main),
                    gradient: [MeeshyColors.indigo600, MeeshyColors.indigo800]
                ) {
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        router.push(.settings)
                    }
                }
            }
        }
        .padding(MeeshySpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous)
                        .stroke(
                            MeeshyColors.glassBorderGradient(isDark: isDark),
                            lineWidth: 1
                        )
                )
                .shadow(color: .black.opacity(0.08), radius: MeeshySpacing.md, y: MeeshySpacing.xs)
        )
    }

    private func quickActionButton(icon: String, label: String, gradient: [Color], action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.medium()
            action()
        } label: {
            VStack(spacing: MeeshySpacing.sm) {
                Image(systemName: icon)
                    .font(MeeshyFont.relative(22, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 50, height: 50)
                    .background(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
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
                    .font(MeeshyFont.relative(11, weight: .semibold))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    // MARK: - Links Overview Section

    private var linksOverviewSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            HStack {
                Image(systemName: "link")
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundColor(theme.textSecondary)
                Text(String(localized: "widget.preview.myLinks", defaultValue: "MES LIENS", bundle: .main))
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(theme.textSecondary)
                    .kerning(0.8)
                Spacer()
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.md) {
                    linkTypeCard(
                        title: String(localized: "widget.preview.referral", defaultValue: "Parrainage", bundle: .main),
                        icon: "person.badge.plus",
                        color: MeeshyColors.successHex,
                        stat1: String(localized: "widget.preview.linkCount", defaultValue: "\(affiliateVM.tokens.count) lien(s)", bundle: .main),
                        stat2: String(localized: "widget.preview.referralSignups", defaultValue: "\(affiliateVM.tokens.reduce(0) { $0 + $1.referralCount }) inscrits", bundle: .main)
                    ) {
                        dismiss()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            router.push(.affiliate)
                        }
                    }

                    linkTypeCard(
                        title: String(localized: "widget.preview.share", defaultValue: "Partage", bundle: .main),
                        icon: "link.badge.plus",
                        color: MeeshyColors.shareAccentHex,
                        stat1: String(localized: "widget.preview.linkCountShare", defaultValue: "\(shareStats?.totalLinks ?? 0) lien(s)", bundle: .main),
                        stat2: String(localized: "widget.preview.shareJoined", defaultValue: "\(shareStats?.totalUses ?? 0) rejoints", bundle: .main)
                    ) {
                        dismiss()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            router.push(.shareLinks)
                        }
                    }

                    linkTypeCard(
                        title: String(localized: "widget.preview.tracking", defaultValue: "Tracking", bundle: .main),
                        icon: "chart.bar.fill",
                        color: MeeshyColors.purple500Hex,
                        stat1: String(localized: "widget.preview.linkCountTracking", defaultValue: "\(trackingStats?.totalLinks ?? 0) lien(s)", bundle: .main),
                        stat2: String(localized: "widget.preview.trackingClicks", defaultValue: "\(trackingStats?.totalClicks ?? 0) clics", bundle: .main)
                    ) {
                        dismiss()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            router.push(.trackingLinks)
                        }
                    }

                    linkTypeCard(
                        title: String(localized: "widget.preview.community", defaultValue: "Communaut\u{00e9}", bundle: .main),
                        icon: "person.3.fill",
                        color: MeeshyColors.warningHex,
                        stat1: String(localized: "widget.preview.groupCount", defaultValue: "\(communityLinks.count) groupe(s)", bundle: .main),
                        stat2: String(localized: "widget.preview.memberCount", defaultValue: "\(communityLinks.reduce(0) { $0 + $1.memberCount }) membres", bundle: .main)
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
        .padding(MeeshySpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous)
                        .stroke(
                            MeeshyColors.glassBorderGradient(isDark: isDark),
                            lineWidth: 1
                        )
                )
                .shadow(color: .black.opacity(0.08), radius: MeeshySpacing.md, y: MeeshySpacing.xs)
        )
    }

    @ViewBuilder
    private func linkTypeCard(
        title: String, icon: String, color: String,
        stat1: String, stat2: String,
        onTap: @escaping () -> Void
    ) -> some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                ZStack {
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .fill(Color(hex: color).opacity(0.15))
                        .frame(width: 36, height: 36)
                    Image(systemName: icon)
                        .font(MeeshyFont.relative(16, weight: .semibold))
                        .foregroundColor(Color(hex: color))
                }

                Text(title)
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundColor(theme.textPrimary)

                VStack(alignment: .leading, spacing: 2) {
                    Text(stat1)
                        .font(MeeshyFont.relative(11))
                        .foregroundColor(theme.textMuted)
                    Text(stat2)
                        .font(MeeshyFont.relative(11))
                        .foregroundColor(Color(hex: color))
                }
            }
            .padding(MeeshySpacing.md)
            .frame(width: 110)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .stroke(Color(hex: color).opacity(0.2), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Widget Hint Banner

    private var widgetHintBanner: some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: "apps.iphone")
                .font(MeeshyFont.relative(24, weight: .medium))
                .foregroundStyle(
                    LinearGradient(
                        colors: [MeeshyColors.indigo400, MeeshyColors.indigo600],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(String(localized: "widget.preview.widgetsTitle", defaultValue: "Widgets Meeshy", bundle: .main))
                    .font(MeeshyFont.relative(14, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                Text(String(localized: "widget.preview.widgetsHint", defaultValue: "Ajoutez ces widgets a votre ecran d'accueil pour un acces rapide.", bundle: .main))
                    .font(MeeshyFont.relative(12))
                    .foregroundColor(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(MeeshySpacing.md + 2)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                        .stroke(
                            MeeshyColors.glassBorderGradient(isDark: isDark),
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

}

// MARK: - Notification Names

extension Notification.Name {
    static let openFeedComposer = Notification.Name("openFeedComposer")
}
