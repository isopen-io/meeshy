import SwiftUI
import MeeshySDK
import MeeshyUI

/// The single message-bubble footer. Renders a `BubbleFooterModel` — flags +
/// translate on the leading edge, timestamp + delivery check pinned trailing.
/// `Equatable` on `model` only (the actions are stateless closures), so list
/// cells stay at zero re-render via `.equatable()`.
struct BubbleFooter: View, Equatable {
    let model: BubbleFooterModel
    let actions: BubbleFooterActions
    let style: BubbleFooterStyle
    let isDark: Bool

    static func == (lhs: BubbleFooter, rhs: BubbleFooter) -> Bool {
        lhs.model == rhs.model && lhs.style == rhs.style && lhs.isDark == rhs.isDark
    }

    var body: some View {
        switch style {
        case .row:     rowFooter
        case .overlay: overlayFooter
        }
    }

    // MARK: - Row style (text / emoji / audio / story-reply)

    @ViewBuilder
    private var rowFooter: some View {
        if let sender = model.sender {
            HStack(alignment: .top, spacing: 8) {
                MeeshyAvatar(
                    name: sender.name,
                    context: .messageBubble,
                    accentColor: sender.accentColor,
                    avatarURL: sender.avatarURL,
                    storyState: sender.storyRing,
                    moodEmoji: sender.moodEmoji,
                    presenceState: sender.presence,
                    enablePulse: false,
                    onTap: actions.onSenderTap,
                    onViewProfile: actions.onSenderTap,
                    onViewStory: actions.onViewStory,
                    contextMenuItems: avatarMenu(sender: sender)
                )
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Text(sender.name)
                            .font(.system(size: 13, weight: .semibold))
                            .lineLimit(1)
                        roleBadge(sender.role)
                        metaLeading
                        Spacer(minLength: 4)
                        metaTrailing
                    }
                    if let username = sender.username {
                        Text(username)
                            .font(.system(size: 11))
                            .foregroundColor(metaColor.opacity(0.8))
                            .lineLimit(1)
                    }
                }
            }
        } else {
            HStack(spacing: 4) {
                metaLeading
                Spacer(minLength: 4)
                metaTrailing
            }
        }
    }

    // MARK: - Overlay style (image / carousel / video)

    @ViewBuilder
    private var overlayFooter: some View {
        if model.timestamp != nil || model.delivery != nil {
            HStack(spacing: 3) {
                if let timestamp = model.timestamp {
                    Text(timestamp)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.white)
                }
                deliveryView(tint: .white.opacity(0.85), readTint: MeeshyColors.indigo400)
            }
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(Capsule().fill(Color.black.opacity(0.55)))
        }
    }

    // MARK: - Shared element groups

    /// Leading affordances: language flags + translate button.
    @ViewBuilder
    private var metaLeading: some View {
        if !model.flags.isEmpty {
            HStack(spacing: 2) {
                ForEach(model.flags, id: \.code) { flag in
                    footerFlagPill(flag)
                }
            }
        }
        if model.showsTranslate, let onTranslate = actions.onTranslate {
            Button(action: { onTranslate(); HapticFeedback.light() }) {
                Image(systemName: "translate")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Color(hex: "4ECDC4"))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Traduction disponible")
        }
    }

    /// Trailing meta: timestamp + delivery check (or retry button on failure).
    @ViewBuilder
    private var metaTrailing: some View {
        if let timestamp = model.timestamp {
            Text(timestamp)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(metaColor)
        }
        if model.delivery != nil {
            if model.isFailed, let onRetry = actions.onRetry {
                Button(action: { onRetry(); HapticFeedback.light() }) {
                    HStack(spacing: 3) {
                        deliveryView(tint: metaColor, readTint: readColor)
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(MeeshyColors.error)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Renvoyer le message")
            } else {
                deliveryView(tint: metaColor, readTint: readColor)
            }
        }
    }

    @ViewBuilder
    private func deliveryView(tint: Color, readTint: Color) -> some View {
        if let delivery = model.delivery {
            BubbleDeliveryCheck(status: delivery, isOffline: model.isOffline, tint: tint, readTint: readTint)
        }
    }

    private func footerFlagPill(_ flag: FooterFlag) -> some View {
        let display = LanguageDisplay.from(code: flag.code)
        return VStack(spacing: 1) {
            Text(display?.flag ?? flag.code.uppercased())
                .font(.system(size: flag.isActive ? 12 : 10))
            if flag.isActive {
                RoundedRectangle(cornerRadius: 1)
                    .fill(Color(hex: display?.color ?? LanguageDisplay.defaultColor))
                    .frame(width: 10, height: 1.5)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { actions.onFlagTap?(flag.code) }
        .accessibilityLabel(display?.name ?? flag.code)
    }

    @ViewBuilder
    private func roleBadge(_ role: MemberRole?) -> some View {
        if let role, role != .member {
            Label {
                Text(role.displayName).font(.system(size: 11))
            } icon: {
                Image(systemName: role.icon).font(.system(size: 11))
            }
            .foregroundColor(role == .creator ? MeeshyColors.warning : MeeshyColors.indigo500)
        }
    }

    private func avatarMenu(sender: SenderIdentity) -> [AvatarContextMenuItem]? {
        var items: [AvatarContextMenuItem] = []
        if let onViewStory = actions.onViewStory, sender.storyRing != .none {
            items.append(AvatarContextMenuItem(label: "Voir la story", icon: "play.circle.fill", action: onViewStory))
        }
        if let onSenderTap = actions.onSenderTap {
            items.append(AvatarContextMenuItem(label: "Voir le profil", icon: "person.circle", action: onSenderTap))
        }
        return items.isEmpty ? nil : items
    }

    private var metaColor: Color {
        model.isMe ? .white.opacity(0.7) : (isDark ? .white.opacity(0.55) : .black.opacity(0.5))
    }

    private var readColor: Color {
        // `.read` is always indigo — never white, never bold. A lighter
        // indigo reads on dark surfaces, a deeper one on light surfaces.
        isDark ? MeeshyColors.indigo400 : MeeshyColors.indigo600
    }
}
