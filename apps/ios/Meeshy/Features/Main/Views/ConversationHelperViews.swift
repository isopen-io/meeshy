// MARK: - Extracted from ConversationView.swift
import SwiftUI
import CoreLocation
import MeeshySDK
import MeeshyUI

// MARK: - Themed Back Button
struct ThemedBackButton: View {
    let color: String
    var compactMode: Bool = false
    /// Total unread messages across every OTHER conversation. Rendered as
    /// a red iOS-style notification badge sitting to the right of the
    /// chevron glass circle (iMessage pattern).
    /// `0` hides the badge entirely; `≥ 100` clamps to "99+".
    var unreadCount: Int = 0
    let action: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var isPressed = false

    // MARK: - Pure formatting helpers (exposed for unit tests)

    static func displayedUnread(_ count: Int) -> String {
        count >= 100 ? "99+" : "\(count)"
    }

    static func showsUnread(unreadCount: Int, compactMode: Bool) -> Bool {
        unreadCount > 0 && !compactMode
    }

    private var showsPill: Bool {
        Self.showsUnread(unreadCount: unreadCount, compactMode: compactMode)
    }

    private var gradientStroke: LinearGradient {
        LinearGradient(
            colors: [Color(hex: color).opacity(0.5), MeeshyColors.indigo300.opacity(0.5)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var gradientFill: LinearGradient {
        LinearGradient(
            colors: [Color(hex: color), MeeshyColors.indigo300],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var badgeBackground: Color {
        // Source of truth: same red-light / red-dark pair the
        // ConversationListHelpers row badge uses (vie MeeshyColors).
        MeeshyColors.unreadBadgeBackground(isDark: colorScheme == .dark)
    }

    var body: some View {
        Button(action: {
            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = false }
            }
            action()
        }) {
            HStack(spacing: 0) {
                // Chevron — always visible, in a fixed 40-pt slot so the
                // back affordance stays anchored regardless of pill width
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(gradientFill)
                    .frame(width: 40, height: 40)

                if showsPill {
                    // Vertical separator between chevron and red pill —
                    // tinted with the conversation accent so it picks up
                    // the surrounding glass-capsule mood instead of
                    // looking like a hardcoded grey divider.
                    Rectangle()
                        .fill(Color(hex: color).opacity(0.35))
                        .frame(width: 1, height: 22)
                        .padding(.trailing, 6)

                    // Red pill — the eye-catcher. Sits INSIDE the outer
                    // glass capsule, hugged by 6-pt padding on each side
                    // so the capsule still reads as a single back-button
                    // affordance. Dark/light parity with the conversation
                    // list row badge via MeeshyColors.unreadBadgeBackground.
                    Text(Self.displayedUnread(unreadCount))
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                        .padding(.horizontal, 8)
                        .frame(minWidth: 22, minHeight: 22)
                        .background(
                            Capsule()
                                .fill(badgeBackground)
                                .shadow(color: badgeBackground.opacity(0.4), radius: 3, y: 1)
                        )
                        .padding(.trailing, 6)
                        .accessibilityHidden(true)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .background(
                Capsule()
                    .fill(.ultraThinMaterial)
                    .overlay(Capsule().stroke(gradientStroke, lineWidth: 1))
                    .shadow(color: Color(hex: color).opacity(0.3), radius: 6, y: 3)
                    .opacity(compactMode ? 0 : 1)
                    .scaleEffect(compactMode ? 0.4 : 1, anchor: .leading)
            )
            .frame(minWidth: compactMode ? 24 : 40, minHeight: 40)
            .scaleEffect(isPressed ? 0.9 : 1)
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: compactMode)
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: showsPill)
        }
        .accessibilityLabel(showsPill ? String(format: String(localized: "a11y.back.with_unread", bundle: .main), unreadCount) : String(localized: "a11y.back", bundle: .main))
    }
}

// MARK: - Themed Avatar Button
struct ThemedAvatarButton: View {
    let name: String
    let color: String
    let secondaryColor: String
    let isExpanded: Bool
    var storyState: StoryRingState = .none
    var avatarURL: String? = nil
    var presenceState: PresenceState? = nil
    var moodEmoji: String? = nil
    let action: () -> Void
    @State private var isPressed = false

    var body: some View {
        Button(action: {
            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = false }
            }
            action()
        }) {
            MeeshyAvatar(
                name: name,
                context: .conversationHeaderCollapsed,
                accentColor: color,
                secondaryColor: secondaryColor,
                avatarURL: avatarURL,
                storyState: storyState,
                moodEmoji: moodEmoji,
                presenceState: presenceState
            )
            .shadow(color: Color(hex: color).opacity(isExpanded ? 0.6 : 0.4), radius: isExpanded ? 12 : 8, y: 3)
            .scaleEffect(isPressed ? 0.9 : (isExpanded ? 1.1 : 1))
        }
        .accessibilityLabel(String(format: String(localized: "accessibility.user_profile_of", defaultValue: "Profil de %@", bundle: .main), name))
        .accessibilityHint(String(localized: "accessibility.user_profile.hint", defaultValue: "Ouvre les détails du profil", bundle: .main))
    }
}

// MARK: - Themed Composer Button
struct ThemedComposerButton: View {
    let icon: String
    let colors: [String]
    var isActive: Bool = false
    var rotateIcon: Bool = false
    let action: () -> Void
    @State private var isPressed = false

    var body: some View {
        Button(action: {
            HapticFeedback.light()
            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = false }
            }
            action()
        }) {
            ZStack {
                Circle()
                    .fill(
                        isActive ?
                        LinearGradient(colors: colors.map { Color(hex: $0) }, startPoint: .topLeading, endPoint: .bottomTrailing) :
                        LinearGradient(colors: [Color(hex: colors[0]).opacity(0.2), Color(hex: colors[1]).opacity(0.15)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    )
                    .frame(width: 44, height: 44)
                    .overlay(
                        Circle()
                            .stroke(
                                LinearGradient(colors: colors.map { Color(hex: $0).opacity(isActive ? 0 : 0.4) }, startPoint: .topLeading, endPoint: .bottomTrailing),
                                lineWidth: isActive ? 0 : 1
                            )
                    )
                    .shadow(color: Color(hex: colors[0]).opacity(isActive ? 0.5 : 0.2), radius: isActive ? 10 : 6, y: 3)

                Image(systemName: icon)
                    .font(MeeshyFont.relative(18, weight: .semibold))
                    .foregroundColor(isActive ? .white : Color(hex: colors[0]))
                    .rotationEffect(rotateIcon ? .degrees(45) : .degrees(0))
                    .offset(x: rotateIcon ? -1 : 0, y: rotateIcon ? 1 : 0)
            }
            .scaleEffect(isPressed ? 0.9 : 1)
        }
    }
}

