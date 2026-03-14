import SwiftUI
import MeeshySDK

// MARK: - Avatar Context

public enum AvatarContext: Sendable {
    // Stories
    case storyTray              // 44pt
    case storyViewer            // 44pt

    // Feed
    case feedComposer           // 36pt
    case postAuthor             // 44pt
    case postComment            // 28pt
    case postReaction           // 20pt

    // Messages
    case messageBubble          // 32pt
    case typingIndicator        // 24pt

    // Conversation
    case conversationList       // 52pt
    case conversationHeaderCollapsed  // 44pt
    case conversationHeaderExpanded   // 44pt
    case conversationHeaderStacked    // 28pt
    case recentParticipant      // 20pt

    // Profile
    case profileBanner          // 90pt
    case profileEdit            // 80pt
    case profileSheet           // 80pt

    // Listings
    case userListItem           // 44pt

    // Notifications
    case notification           // 44pt

    // Custom
    case custom(CGFloat)

    public var size: CGFloat {
        switch self {
        case .storyTray, .storyViewer, .conversationHeaderCollapsed,
             .conversationHeaderExpanded, .postAuthor, .userListItem, .notification:
            return 44
        case .conversationList: return 52
        case .messageBubble: return 32
        case .feedComposer: return 36
        case .postComment, .conversationHeaderStacked: return 28
        case .typingIndicator: return 24
        case .postReaction, .recentParticipant: return 20
        case .profileBanner: return 90
        case .profileEdit, .profileSheet: return 80
        case .custom(let v): return v
        }
    }

    public var showsStoryRing: Bool {
        switch self {
        case .storyViewer, .postComment, .postReaction, .typingIndicator, .profileEdit:
            return false
        default: return true
        }
    }

    public var showsMoodBadge: Bool {
        switch self {
        case .storyViewer, .postComment, .postReaction, .typingIndicator,
             .profileEdit, .userListItem, .notification:
            return false
        default: return true
        }
    }

    public var showsOnlineDot: Bool {
        switch self {
        case .storyViewer, .postComment, .postReaction, .typingIndicator,
             .profileEdit, .notification:
            return false
        default: return true
        }
    }

    public var isTappable: Bool {
        switch self {
        case .postReaction, .typingIndicator:
            return false
        default: return true
        }
    }

    public var defaultPulse: Bool {
        switch self {
        case .messageBubble, .conversationHeaderCollapsed, .conversationHeaderExpanded,
             .profileBanner, .profileSheet, .custom:
            return true
        default: return false
        }
    }

    public var shadowRadius: CGFloat {
        switch self {
        case .postReaction, .typingIndicator, .recentParticipant: return 0
        case .postComment: return 2
        case .messageBubble, .storyViewer, .feedComposer, .userListItem, .notification,
             .conversationHeaderStacked: return 4
        case .profileBanner: return 12
        default: return 8
        }
    }

    public var shadowY: CGFloat {
        switch self {
        case .postReaction, .typingIndicator, .recentParticipant: return 0
        case .postComment: return 1
        case .messageBubble, .conversationHeaderStacked: return 2
        default: return 4
        }
    }

    public var ringSize: CGFloat { size + 6 }
    public var initialFont: CGFloat { size * 0.38 }
    public var ringWidth: CGFloat {
        switch self {
        case .storyTray: return 0.7
        default: return size <= 32 ? 1.5 : 2.5
        }
    }
    public var badgeSize: CGFloat { size * 0.42 }
    public var onlineDotSize: CGFloat { size * 0.26 }
}

// MARK: - Story Ring State

public enum StoryRingState: Equatable {
    case none, unread, read
}

// MARK: - Avatar Kind

public enum AvatarKind: Sendable {
    case user
    case entity
}

// MARK: - Avatar Context Menu Item

public struct AvatarContextMenuItem: Identifiable {
    public let id = UUID()
    public let label: String
    public let icon: String
    public var role: ButtonRole? = nil
    public let action: () -> Void

    public init(label: String, icon: String, role: ButtonRole? = nil, action: @escaping () -> Void) {
        self.label = label; self.icon = icon; self.role = role; self.action = action
    }
}

// MARK: - MeeshyAvatar

public struct MeeshyAvatar: View {
    public let name: String
    public let context: AvatarContext
    public var accentColor: String = ""
    public var secondaryColor: String? = nil
    public var avatarURL: String? = nil
    public var storyState: StoryRingState = .none
    public var moodEmoji: String? = nil
    public var presenceState: PresenceState = .offline
    public var onTap: (() -> Void)? = nil
    public var onViewProfile: (() -> Void)? = nil
    public var onViewStory: (() -> Void)? = nil
    public var onMoodTap: ((CGPoint) -> Void)? = nil
    public var onOnlineTap: (() -> Void)? = nil
    public var contextMenuItems: [AvatarContextMenuItem]? = nil
    public var enablePulse: Bool = true
    public var kind: AvatarKind = .user

    // Primary init (AvatarContext)
    public init(name: String, context: AvatarContext, kind: AvatarKind = .user, accentColor: String = "",
                secondaryColor: String? = nil, avatarURL: String? = nil,
                storyState: StoryRingState = .none, moodEmoji: String? = nil,
                presenceState: PresenceState = .offline, enablePulse: Bool? = nil,
                isDark: Bool = ThemeManager.shared.mode.isDark,
                onTap: (() -> Void)? = nil, onViewProfile: (() -> Void)? = nil,
                onViewStory: (() -> Void)? = nil, onMoodTap: ((CGPoint) -> Void)? = nil,
                onOnlineTap: (() -> Void)? = nil, contextMenuItems: [AvatarContextMenuItem]? = nil) {
        self.name = name; self.context = context; self.kind = kind; self.accentColor = accentColor
        self.secondaryColor = secondaryColor; self.avatarURL = avatarURL
        self.storyState = storyState; self.moodEmoji = moodEmoji; self.presenceState = presenceState
        self.enablePulse = enablePulse ?? context.defaultPulse; self.isDark = isDark
        self.onTap = onTap; self.onViewProfile = onViewProfile; self.onViewStory = onViewStory
        self.onMoodTap = onMoodTap; self.onOnlineTap = onOnlineTap; self.contextMenuItems = contextMenuItems
    }

    @State private var ringRotation: Double = 0
    @State private var tapScale: CGFloat = 1.0
    @State private var moodScale: CGFloat = 1.0
    private let isDark: Bool
    private var theme: ThemeManager { ThemeManager.shared }

    private var resolvedAccent: String {
        accentColor.isEmpty ? DynamicColorGenerator.colorForName(name) : accentColor
    }

    private var resolvedSecondary: String {
        secondaryColor ?? resolvedAccent
    }

    private var secondaryGradientColor: Color {
        secondaryColor != nil ? Color(hex: resolvedSecondary) : Color(hex: resolvedAccent).opacity(0.6)
    }

    private var effectiveStoryState: StoryRingState {
        guard kind == .user else { return .none }
        return context.showsStoryRing ? storyState : .none
    }

    private var effectiveMoodEmoji: String? {
        guard kind == .user else { return nil }
        return context.showsMoodBadge ? moodEmoji : nil
    }

    private var effectivePresence: PresenceState {
        guard kind == .user else { return .offline }
        return context.showsOnlineDot ? presenceState : .offline
    }

    private var hasTapHandler: Bool {
        context.isTappable && (onTap != nil || onViewProfile != nil || onViewStory != nil)
    }

    private var effectiveContextMenuItems: [AvatarContextMenuItem] {
        var items: [AvatarContextMenuItem] = []
        if let onViewProfile {
            items.append(.init(label: "Voir le profil", icon: "person.fill", action: onViewProfile))
        }
        if let onViewStory, kind == .user, storyState != .none {
            items.append(.init(label: "Voir la story", icon: "play.circle.fill", action: onViewStory))
        }
        if let custom = contextMenuItems {
            for item in custom {
                if !items.contains(where: { $0.label == item.label }) {
                    items.append(item)
                }
            }
        }
        return items
    }

    private var hasContextMenu: Bool {
        context.isTappable && !effectiveContextMenuItems.isEmpty
    }

    private func handleTap() {
        HapticFeedback.light()
        if storyState == .unread, let onViewStory { onViewStory(); return }
        if let onTap { onTap(); return }
        if let onViewProfile { onViewProfile(); return }
    }

    // MARK: - Body

    public var body: some View {
        let visual = ZStack {
            storyRing
            avatarBody
        }
        .overlay(alignment: .bottomTrailing) {
            if let emoji = effectiveMoodEmoji, !emoji.isEmpty {
                moodBadge(emoji: emoji)
                    .offset(badgeOffset(badgeHalfSize: context.badgeSize / 2))
            } else if effectivePresence != .offline {
                onlineDot
                    .offset(badgeOffset(badgeHalfSize: context.onlineDotSize / 2))
            }
        }
        .scaleEffect(tapScale)
        .onAppear {
            if effectiveStoryState == .unread {
                withAnimation(.linear(duration: 4.0).repeatForever(autoreverses: false)) {
                    ringRotation = 360
                }
            }
        }

        let tappable = Group {
            if hasTapHandler {
                visual
                    .contentShape(Circle())
                    .onTapGesture {
                        withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { tapScale = 0.9 }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { tapScale = 1.0 }
                        }
                        handleTap()
                    }
            } else { visual }
        }

        if hasContextMenu {
            tappable
                .contextMenu {
                    ForEach(effectiveContextMenuItems) { item in
                        Button(role: item.role) {
                            item.action()
                        } label: {
                            Label(item.label, systemImage: item.icon)
                        }
                    }
                }
        } else { tappable }
    }

    // MARK: - Avatar Body

    @ViewBuilder
    private var avatarBody: some View {
        if let url = avatarURL, !url.isEmpty {
            CachedAvatarImage(urlString: url, name: name, size: context.size, accentColor: resolvedAccent)
                .shadow(color: Color(hex: resolvedAccent).opacity(0.4), radius: context.shadowRadius, y: context.shadowY)
        } else {
            ZStack {
                Circle()
                    .fill(LinearGradient(
                        colors: [Color(hex: resolvedAccent), secondaryGradientColor],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ))
                    .frame(width: context.size, height: context.size)
                Text(initials)
                    .font(.system(size: context.initialFont, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
            }
            .shadow(color: Color(hex: resolvedAccent).opacity(0.4), radius: context.shadowRadius, y: context.shadowY)
        }
    }

    // MARK: - Story Ring

    @ViewBuilder
    private var storyRing: some View {
        switch effectiveStoryState {
        case .unread:
            Circle()
                .stroke(
                    AngularGradient(
                        gradient: Gradient(colors: [
                            Color(hex: "FF2E63"), Color(hex: "FF6B6B"), Color(hex: "F27121"),
                            Color(hex: "E94057"), Color(hex: "A855F7"), Color(hex: "08D9D6"),
                            Color(hex: "FF2E63")
                        ]),
                        center: .center,
                        startAngle: .degrees(ringRotation),
                        endAngle: .degrees(ringRotation + 360)
                    ),
                    lineWidth: context.ringWidth
                )
                .frame(width: context.ringSize, height: context.ringSize)
        case .read:
            Circle()
                .stroke(Color(hex: resolvedAccent).opacity(0.3), lineWidth: context.ringWidth)
                .frame(width: context.ringSize, height: context.ringSize)
        case .none:
            EmptyView()
        }
    }

    /// Calcule l'offset pour positionner le badge sur le bord de l'avatar à 45°,
    /// en tenant compte du fait que le glow story-unread agrandit le ZStack à (size+20).
    private func badgeOffset(badgeHalfSize: CGFloat) -> CGSize {
        guard effectiveStoryState != .none else { return .zero }
        let avatarR = context.size / 2
        let zstackSize = context.ringSize
        let zstackCenter = zstackSize / 2
        let target = zstackCenter + avatarR * cos(.pi / 4)
        let current = zstackSize - badgeHalfSize
        let delta = target - current
        return CGSize(width: delta, height: delta)
    }

    private func moodBadge(emoji: String) -> some View {
        GeometryReader { geo in
            Text(emoji)
                .font(.system(size: context.badgeSize * 0.65))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .scaleEffect(moodScale)
                .contentShape(Circle())
                .onTapGesture {
                    HapticFeedback.light()
                    let f = geo.frame(in: .global)
                    onMoodTap?(CGPoint(x: f.midX, y: f.midY))
                }
                .onAppear {
                    withAnimation(
                        .spring(response: 0.5, dampingFraction: 0.4)
                        .repeatForever(autoreverses: true)
                        .delay(Double.random(in: 0...1.5))
                    ) {
                        moodScale = 1.18
                    }
                }
        }
        .frame(width: context.badgeSize, height: context.badgeSize)
        .ifTrue(enablePulse) { $0.pulse(intensity: 0.12) }
    }

    private var dotColor: Color {
        switch effectivePresence {
        case .online: return Color(hex: "2ECC71")
        case .away: return Color(hex: "F39C12")
        case .offline: return .clear
        }
    }

    @ViewBuilder
    private var onlineDot: some View {
        let dot = Circle()
            .fill(dotColor)
            .frame(width: context.onlineDotSize, height: context.onlineDotSize)
            .overlay(Circle().stroke(theme.backgroundPrimary, lineWidth: 2))
            .onTapGesture {
                HapticFeedback.light()
                onOnlineTap?()
            }

        // Pulse actif uniquement quand en ligne ET story ring visible ET enablePulse
        if enablePulse && effectivePresence == .online && effectiveStoryState != .none {
            dot.pulse(intensity: 0.12)
        } else {
            dot
        }
    }

    // MARK: - Helpers

    private var initials: String {
        let parts = name.components(separatedBy: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
        return parts.isEmpty ? String(name.prefix(1)).uppercased() : parts
    }

}

