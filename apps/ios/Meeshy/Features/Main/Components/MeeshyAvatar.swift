import SwiftUI
import MeeshySDK

// MARK: - Avatar Mode

enum AvatarMode {
    case conversationList    // 52pt — ring, mood, online, all interactions
    case storyTray           // 58pt — ring animé, tap
    case conversationHeader  // 44pt — pas de story ring, tap
    case messageBubble       // 32pt — ring si applicable, tap
    case callNotification(CGFloat) // Custom — aucune interaction
    case custom(CGFloat)     // Taille libre

    var size: CGFloat {
        switch self {
        case .conversationList: return 52
        case .storyTray: return 58
        case .conversationHeader: return 44
        case .messageBubble: return 32
        case .callNotification(let v): return v
        case .custom(let v): return v
        }
    }

    var showsStoryRing: Bool {
        switch self {
        case .conversationList, .storyTray, .messageBubble, .custom: return true
        case .conversationHeader, .callNotification: return false
        }
    }

    var showsMoodBadge: Bool {
        switch self {
        case .conversationList, .conversationHeader, .messageBubble: return true
        default: return false
        }
    }

    var showsOnlineDot: Bool {
        switch self {
        case .callNotification: return false
        default: return true
        }
    }

    var isTappable: Bool {
        switch self {
        case .callNotification: return false
        default: return true
        }
    }

    var shadowRadius: CGFloat {
        switch self {
        case .messageBubble: return 4
        default: return 8
        }
    }

    var shadowY: CGFloat {
        switch self {
        case .messageBubble: return 2
        default: return 4
        }
    }

    // Derived sizing
    var ringSize: CGFloat { size + 6 }
    var initialFont: CGFloat { size * 0.38 }
    var ringWidth: CGFloat { size <= 32 ? 1.5 : 2.5 }
    var badgeSize: CGFloat { size * 0.42 }
    var onlineDotSize: CGFloat { size * 0.26 }
}

// MARK: - Legacy AvatarSize (backward compat)

enum AvatarSize {
    case small, medium, large, xlarge
    case custom(CGFloat)

    var value: CGFloat {
        switch self {
        case .small: return 32
        case .medium: return 44
        case .large: return 52
        case .xlarge: return 58
        case .custom(let v): return v
        }
    }

    var ringSize: CGFloat { value + 6 }
    var initialFont: CGFloat { value * 0.38 }
    var ringWidth: CGFloat { value <= 32 ? 1.5 : 2.5 }
    var badgeSize: CGFloat { value * 0.42 }
    var onlineDotSize: CGFloat { value * 0.26 }
}

// MARK: - Story Ring State

enum StoryRingState {
    case none, unread, read
}

// MARK: - Avatar Context Menu Item

struct AvatarContextMenuItem: Identifiable {
    let id = UUID()
    let label: String
    let icon: String
    var role: ButtonRole? = nil
    let action: () -> Void
}

// MARK: - MeeshyAvatar

struct MeeshyAvatar: View {
    // Required
    let name: String
    let mode: AvatarMode

    // Colors
    var accentColor: String = ""
    var secondaryColor: String? = nil
    var avatarURL: String? = nil

    // Story ring
    var storyState: StoryRingState = .none

    // Mood
    var moodEmoji: String? = nil

    // Presence
    var presenceState: PresenceState = .offline

    // Smart tap callbacks (default behavior)
    // Priority: onTap (explicit override) > onViewStory (if story unread) > onViewProfile
    var onTap: (() -> Void)? = nil
    var onViewProfile: (() -> Void)? = nil
    var onViewStory: (() -> Void)? = nil

    // Badge callbacks
    var onMoodTap: ((CGPoint) -> Void)? = nil
    var onOnlineTap: (() -> Void)? = nil

    // Context menu (long press) — available on ALL tappable modes
    var contextMenuItems: [AvatarContextMenuItem]? = nil

    // Legacy init support (size: AvatarSize)
    init(name: String, size: AvatarSize, accentColor: String = "", secondaryColor: String? = nil, avatarURL: String? = nil, storyState: StoryRingState = .none, moodEmoji: String? = nil, onMoodTap: ((CGPoint) -> Void)? = nil, presenceState: PresenceState = .offline, onOnlineTap: (() -> Void)? = nil) {
        self.name = name
        switch size {
        case .small: self.mode = .messageBubble
        case .medium: self.mode = .conversationHeader
        case .large: self.mode = .conversationList
        case .xlarge: self.mode = .storyTray
        case .custom(let v): self.mode = .custom(v)
        }
        self.accentColor = accentColor
        self.secondaryColor = secondaryColor
        self.avatarURL = avatarURL
        self.storyState = storyState
        self.moodEmoji = moodEmoji
        self.onMoodTap = onMoodTap
        self.presenceState = presenceState
        self.onOnlineTap = onOnlineTap
    }

    // Primary init (mode: AvatarMode)
    init(name: String, mode: AvatarMode, accentColor: String = "", secondaryColor: String? = nil, avatarURL: String? = nil, storyState: StoryRingState = .none, moodEmoji: String? = nil, presenceState: PresenceState = .offline, onTap: (() -> Void)? = nil, onViewProfile: (() -> Void)? = nil, onViewStory: (() -> Void)? = nil, onMoodTap: ((CGPoint) -> Void)? = nil, onOnlineTap: (() -> Void)? = nil, contextMenuItems: [AvatarContextMenuItem]? = nil) {
        self.name = name
        self.mode = mode
        self.accentColor = accentColor
        self.secondaryColor = secondaryColor
        self.avatarURL = avatarURL
        self.storyState = storyState
        self.moodEmoji = moodEmoji
        self.presenceState = presenceState
        self.onTap = onTap
        self.onViewProfile = onViewProfile
        self.onViewStory = onViewStory
        self.onMoodTap = onMoodTap
        self.onOnlineTap = onOnlineTap
        self.contextMenuItems = contextMenuItems
    }

    // Private
    @State private var ringRotation: Double = 0
    @State private var tapScale: CGFloat = 1.0

    private var resolvedAccent: String {
        accentColor.isEmpty ? DynamicColorGenerator.colorForName(name) : accentColor
    }

    private var resolvedSecondary: String {
        secondaryColor ?? resolvedAccent
    }

    private var secondaryGradientColor: Color {
        secondaryColor != nil ? Color(hex: resolvedSecondary) : Color(hex: resolvedAccent).opacity(0.6)
    }

    /// Effective story state — modes that don't show rings force .none
    private var effectiveStoryState: StoryRingState {
        mode.showsStoryRing ? storyState : .none
    }

    /// Effective mood emoji — only shown in modes that support it
    private var effectiveMoodEmoji: String? {
        mode.showsMoodBadge ? moodEmoji : nil
    }

    /// Effective presence — modes that don't show the dot force .offline
    private var effectivePresence: PresenceState {
        mode.showsOnlineDot ? presenceState : .offline
    }

    /// Whether this avatar has any tap handler configured
    private var hasTapHandler: Bool {
        mode.isTappable && (onTap != nil || onViewProfile != nil || onViewStory != nil)
    }

    /// Whether this avatar has context menu items
    private var hasContextMenu: Bool {
        mode.isTappable && !(contextMenuItems ?? []).isEmpty
    }

    // MARK: - Tap Logic

    private func handleTap() {
        HapticFeedback.light()

        // 1. Explicit override — onTap takes full control
        if let onTap {
            onTap()
            return
        }

        // 2. Story unread + handler available → open story
        if storyState == .unread, let onViewStory {
            onViewStory()
            return
        }

        // 3. Default → view profile
        if let onViewProfile {
            onViewProfile()
            return
        }
    }

    // MARK: - Body

    var body: some View {
        let visual = ZStack {
            storyRing
            avatarBody

            if effectiveStoryState == .unread {
                Circle()
                    .fill(Color(hex: resolvedAccent).opacity(0.2))
                    .frame(width: mode.size + 20, height: mode.size + 20)
                    .blur(radius: 10)
                    .allowsHitTesting(false)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            badge
        }
        .scaleEffect(tapScale)
        .onAppear {
            if effectiveStoryState == .unread {
                withAnimation(.linear(duration: 4.0).repeatForever(autoreverses: false)) {
                    ringRotation = 360
                }
            }
        }

        // Layer 1: Apply tap gesture if any handler exists
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
            } else {
                visual
            }
        }

        // Layer 2: Apply context menu if items exist
        if hasContextMenu {
            tappable.contextMenu {
                ForEach(contextMenuItems!) { item in
                    Button(role: item.role) {
                        item.action()
                    } label: {
                        Label(item.label, systemImage: item.icon)
                    }
                }
            }
        } else {
            tappable
        }
    }

    // MARK: - Avatar Body

    @ViewBuilder
    private var avatarBody: some View {
        if let url = avatarURL, !url.isEmpty {
            CachedAvatarImage(
                urlString: url,
                name: name,
                size: mode.size,
                accentColor: resolvedAccent
            )
            .shadow(color: Color(hex: resolvedAccent).opacity(0.4), radius: mode.shadowRadius, y: mode.shadowY)
        } else {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: resolvedAccent), secondaryGradientColor],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: mode.size, height: mode.size)

                Text(initials)
                    .font(.system(size: mode.initialFont, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
            }
            .shadow(color: Color(hex: resolvedAccent).opacity(0.4), radius: mode.shadowRadius, y: mode.shadowY)
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
                            Color(hex: "FF2E63"),
                            Color(hex: "FF6B6B"),
                            Color(hex: "F27121"),
                            Color(hex: "E94057"),
                            Color(hex: "A855F7"),
                            Color(hex: "08D9D6"),
                            Color(hex: "FF2E63")
                        ]),
                        center: .center,
                        startAngle: .degrees(ringRotation),
                        endAngle: .degrees(ringRotation + 360)
                    ),
                    lineWidth: mode.ringWidth
                )
                .frame(width: mode.ringSize, height: mode.ringSize)

        case .read:
            Circle()
                .stroke(
                    Color(hex: resolvedAccent).opacity(0.3),
                    lineWidth: mode.ringWidth
                )
                .frame(width: mode.ringSize, height: mode.ringSize)

        case .none:
            EmptyView()
        }
    }

    // MARK: - Badge (Mood or Online)

    @ViewBuilder
    private var badge: some View {
        if let emoji = effectiveMoodEmoji, !emoji.isEmpty {
            moodBadge(emoji: emoji)
        } else if effectivePresence != .offline {
            onlineDot
        }
    }

    private func moodBadge(emoji: String) -> some View {
        GeometryReader { geo in
            Text(emoji)
                .font(.system(size: mode.badgeSize * 0.65))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Circle())
                .onTapGesture {
                    HapticFeedback.light()
                    let f = geo.frame(in: .global)
                    onMoodTap?(CGPoint(x: f.midX, y: f.midY))
                }
        }
        .frame(width: mode.badgeSize, height: mode.badgeSize)
        .pulse(intensity: 0.15)
    }

    @ObservedObject private var theme = ThemeManager.shared

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
            .frame(width: mode.onlineDotSize, height: mode.onlineDotSize)
            .overlay(Circle().stroke(theme.backgroundPrimary, lineWidth: 2))
            .onTapGesture {
                HapticFeedback.light()
                onOnlineTap?()
            }

        if effectivePresence == .online {
            dot.pulse(intensity: 0.15)
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
