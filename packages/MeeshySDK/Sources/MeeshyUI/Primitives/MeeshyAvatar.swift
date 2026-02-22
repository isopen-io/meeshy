import SwiftUI
import MeeshySDK

// MARK: - Avatar Mode

public enum AvatarMode {
    case conversationList    // 52pt
    case storyTray           // 58pt
    case conversationHeader  // 44pt
    case messageBubble       // 32pt
    case callNotification(CGFloat)
    case custom(CGFloat)

    public var size: CGFloat {
        switch self {
        case .conversationList: return 52
        case .storyTray: return 58
        case .conversationHeader: return 44
        case .messageBubble: return 32
        case .callNotification(let v): return v
        case .custom(let v): return v
        }
    }

    public var showsStoryRing: Bool {
        switch self {
        case .conversationList, .storyTray, .messageBubble, .custom: return true
        case .conversationHeader, .callNotification: return false
        }
    }

    public var showsMoodBadge: Bool {
        switch self {
        case .conversationList, .conversationHeader, .messageBubble: return true
        default: return false
        }
    }

    public var showsOnlineDot: Bool {
        switch self {
        case .callNotification: return false
        default: return true
        }
    }

    public var isTappable: Bool {
        switch self {
        case .callNotification: return false
        default: return true
        }
    }

    public var shadowRadius: CGFloat {
        switch self {
        case .messageBubble: return 4
        default: return 8
        }
    }

    public var shadowY: CGFloat {
        switch self {
        case .messageBubble: return 2
        default: return 4
        }
    }

    public var ringSize: CGFloat { size + 6 }
    public var initialFont: CGFloat { size * 0.38 }
    public var ringWidth: CGFloat { size <= 32 ? 1.5 : 2.5 }
    public var badgeSize: CGFloat { size * 0.42 }
    public var onlineDotSize: CGFloat { size * 0.26 }
}

// MARK: - Legacy AvatarSize

public enum AvatarSize {
    case small, medium, large, xlarge
    case custom(CGFloat)

    public var value: CGFloat {
        switch self {
        case .small: return 32
        case .medium: return 44
        case .large: return 52
        case .xlarge: return 58
        case .custom(let v): return v
        }
    }

    public var ringSize: CGFloat { value + 6 }
    public var initialFont: CGFloat { value * 0.38 }
    public var ringWidth: CGFloat { value <= 32 ? 1.5 : 2.5 }
    public var badgeSize: CGFloat { value * 0.42 }
    public var onlineDotSize: CGFloat { value * 0.26 }
}

// MARK: - Story Ring State

public enum StoryRingState {
    case none, unread, read
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
    public let mode: AvatarMode
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

    // Legacy init (AvatarSize)
    public init(name: String, size: AvatarSize, accentColor: String = "", secondaryColor: String? = nil,
                avatarURL: String? = nil, storyState: StoryRingState = .none, moodEmoji: String? = nil,
                onMoodTap: ((CGPoint) -> Void)? = nil, presenceState: PresenceState = .offline,
                onOnlineTap: (() -> Void)? = nil) {
        self.name = name
        switch size {
        case .small: self.mode = .messageBubble
        case .medium: self.mode = .conversationHeader
        case .large: self.mode = .conversationList
        case .xlarge: self.mode = .storyTray
        case .custom(let v): self.mode = .custom(v)
        }
        self.accentColor = accentColor; self.secondaryColor = secondaryColor
        self.avatarURL = avatarURL; self.storyState = storyState; self.moodEmoji = moodEmoji
        self.onMoodTap = onMoodTap; self.presenceState = presenceState; self.onOnlineTap = onOnlineTap
    }

    // Primary init (AvatarMode)
    public init(name: String, mode: AvatarMode, accentColor: String = "", secondaryColor: String? = nil,
                avatarURL: String? = nil, storyState: StoryRingState = .none, moodEmoji: String? = nil,
                presenceState: PresenceState = .offline, onTap: (() -> Void)? = nil,
                onViewProfile: (() -> Void)? = nil, onViewStory: (() -> Void)? = nil,
                onMoodTap: ((CGPoint) -> Void)? = nil, onOnlineTap: (() -> Void)? = nil,
                contextMenuItems: [AvatarContextMenuItem]? = nil) {
        self.name = name; self.mode = mode; self.accentColor = accentColor
        self.secondaryColor = secondaryColor; self.avatarURL = avatarURL
        self.storyState = storyState; self.moodEmoji = moodEmoji; self.presenceState = presenceState
        self.onTap = onTap; self.onViewProfile = onViewProfile; self.onViewStory = onViewStory
        self.onMoodTap = onMoodTap; self.onOnlineTap = onOnlineTap; self.contextMenuItems = contextMenuItems
    }

    @State private var ringRotation: Double = 0
    @State private var tapScale: CGFloat = 1.0
    @ObservedObject private var theme = ThemeManager.shared

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
        mode.showsStoryRing ? storyState : .none
    }

    private var effectiveMoodEmoji: String? {
        mode.showsMoodBadge ? moodEmoji : nil
    }

    private var effectivePresence: PresenceState {
        mode.showsOnlineDot ? presenceState : .offline
    }

    private var hasTapHandler: Bool {
        mode.isTappable && (onTap != nil || onViewProfile != nil || onViewStory != nil)
    }

    private var hasContextMenu: Bool {
        mode.isTappable && !(contextMenuItems ?? []).isEmpty
    }

    private func handleTap() {
        HapticFeedback.light()
        if let onTap { onTap(); return }
        if storyState == .unread, let onViewStory { onViewStory(); return }
        if let onViewProfile { onViewProfile(); return }
    }

    // MARK: - Body

    public var body: some View {
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
        .overlay(alignment: .bottomTrailing) { badge }
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
            tappable.contextMenu {
                ForEach(contextMenuItems!) { item in
                    Button(role: item.role) { item.action() } label: {
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
            CachedAvatarImage(urlString: url, name: name, size: mode.size, accentColor: resolvedAccent)
                .shadow(color: Color(hex: resolvedAccent).opacity(0.4), radius: mode.shadowRadius, y: mode.shadowY)
        } else {
            ZStack {
                Circle()
                    .fill(LinearGradient(
                        colors: [Color(hex: resolvedAccent), secondaryGradientColor],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ))
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
                            Color(hex: "FF2E63"), Color(hex: "FF6B6B"), Color(hex: "F27121"),
                            Color(hex: "E94057"), Color(hex: "A855F7"), Color(hex: "08D9D6"),
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
                .stroke(Color(hex: resolvedAccent).opacity(0.3), lineWidth: mode.ringWidth)
                .frame(width: mode.ringSize, height: mode.ringSize)
        case .none:
            EmptyView()
        }
    }

    // MARK: - Badge

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
        } else { dot }
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
