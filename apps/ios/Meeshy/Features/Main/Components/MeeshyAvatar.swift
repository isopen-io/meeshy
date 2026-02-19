import SwiftUI
import MeeshySDK

// MARK: - Avatar Size

enum AvatarSize {
    case small      // 32pt — message bubbles, story viewer header
    case medium     // 44pt — conv header, feed posts, composer
    case large      // 52pt — conversation list rows
    case xlarge     // 58pt — story tray
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
    case none
    case unread
    case read
}

// MARK: - MeeshyAvatar

struct MeeshyAvatar: View {
    // Required
    let name: String
    let size: AvatarSize

    // Colors
    var accentColor: String = ""
    var secondaryColor: String? = nil
    var avatarURL: String? = nil

    // Story ring
    var storyState: StoryRingState = .none

    // Mood
    var moodEmoji: String? = nil
    var onMoodTap: ((CGPoint) -> Void)? = nil

    // Online
    var showOnlineIndicator: Bool = false
    var onOnlineTap: (() -> Void)? = nil

    // Private
    @State private var ringRotation: Double = 0

    private var resolvedAccent: String {
        accentColor.isEmpty ? DynamicColorGenerator.colorForName(name) : accentColor
    }

    private var resolvedSecondary: String {
        secondaryColor ?? resolvedAccent
    }

    /// When no secondaryColor is provided, use accent with lower opacity for gradient
    private var secondaryGradientColor: Color {
        secondaryColor != nil ? Color(hex: resolvedSecondary) : Color(hex: resolvedAccent).opacity(0.6)
    }

    var body: some View {
        ZStack {
            // Story ring
            storyRing

            // Avatar body
            avatarBody

            // Story count / unread glow
            if storyState == .unread {
                Circle()
                    .fill(Color(hex: resolvedAccent).opacity(0.2))
                    .frame(width: size.value + 20, height: size.value + 20)
                    .blur(radius: 10)
                    .allowsHitTesting(false)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            badge
        }
        .onAppear {
            if storyState == .unread {
                withAnimation(.linear(duration: 4.0).repeatForever(autoreverses: false)) {
                    ringRotation = 360
                }
            }
        }
    }

    // MARK: - Avatar Body

    @ViewBuilder
    private var avatarBody: some View {
        if let url = avatarURL, !url.isEmpty {
            CachedAvatarImage(
                urlString: url,
                name: name,
                size: size.value,
                accentColor: resolvedAccent
            )
            .shadow(color: Color(hex: resolvedAccent).opacity(0.4), radius: 8, y: 4)
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
                    .frame(width: size.value, height: size.value)

                Text(initials)
                    .font(.system(size: size.initialFont, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
            }
            .shadow(color: Color(hex: resolvedAccent).opacity(0.4), radius: 8, y: 4)
        }
    }

    // MARK: - Story Ring

    @ViewBuilder
    private var storyRing: some View {
        switch storyState {
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
                    lineWidth: size.ringWidth
                )
                .frame(width: size.ringSize, height: size.ringSize)

        case .read:
            Circle()
                .stroke(
                    Color(hex: resolvedAccent).opacity(0.3),
                    lineWidth: size.ringWidth
                )
                .frame(width: size.ringSize, height: size.ringSize)

        case .none:
            EmptyView()
        }
    }

    // MARK: - Badge (Mood or Online)

    @ViewBuilder
    private var badge: some View {
        if let emoji = moodEmoji, !emoji.isEmpty {
            moodBadge(emoji: emoji)
        } else if showOnlineIndicator {
            onlineDot
        }
    }

    private func moodBadge(emoji: String) -> some View {
        GeometryReader { geo in
            Text(emoji)
                .font(.system(size: size.badgeSize * 0.65))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Circle())
                .onTapGesture {
                    HapticFeedback.light()
                    let f = geo.frame(in: .global)
                    onMoodTap?(CGPoint(x: f.midX, y: f.midY))
                }
        }
        .frame(width: size.badgeSize, height: size.badgeSize)
        .pulse(intensity: 0.15)
    }

    @ObservedObject private var theme = ThemeManager.shared

    private var onlineDot: some View {
        Circle()
            .fill(Color(hex: "2ECC71"))
            .frame(width: size.onlineDotSize, height: size.onlineDotSize)
            .overlay(Circle().stroke(theme.backgroundPrimary, lineWidth: 2))
            .onTapGesture {
                HapticFeedback.light()
                onOnlineTap?()
            }
            .pulse(intensity: 0.15)
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

