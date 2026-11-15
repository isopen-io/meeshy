import SwiftUI
import Combine
import MeeshySDK

/// Un état vide tient en une ligne, plus une action quand il y en a une (épure #17584, règle 4) : le sous-titre est
/// facultatif, et seul un état qui explique quelque chose que le titre ne dit pas en porte un.
public struct EmptyStateView: View {
    public let icon: String
    public let title: String
    public let subtitle: String
    public let actionLabel: String?
    public let accentColor: String
    public let compact: Bool
    public var onAction: (() -> Void)?

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    @State private var appeared = false
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    /// L'état vide monte de 12 pt en apparaissant ; sous « Réduire les
    /// animations », il apparaît en place, en fondu.
    nonisolated static func entryOffset(appeared: Bool, reduceMotion: Bool) -> CGFloat {
        appeared || reduceMotion ? 0 : MeeshySpacing.md
    }

    public init(
        icon: String,
        title: String,
        subtitle: String = "",
        actionLabel: String? = nil,
        accentColor: String = MeeshyColors.brandPrimaryHex,
        compact: Bool = false,
        onAction: (() -> Void)? = nil
    ) {
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
        self.actionLabel = actionLabel
        self.accentColor = accentColor
        self.compact = compact
        self.onAction = onAction
    }

    public var body: some View {
        VStack(spacing: compact ? MeeshySpacing.sm : MeeshySpacing.lg) {
            Spacer()

            Image(systemName: icon)
                .font(MeeshyFont.relative(compact ? 36 : 52, weight: .light))
                .foregroundStyle(Color(hex: accentColor).opacity(0.4))
                .padding(.bottom, compact ? 0 : MeeshySpacing.xs)

            if let actionLabel, let onAction, compact {
                actionButton(label: actionLabel, action: onAction)
            }

            Text(title)
                .font(MeeshyFont.relative(compact ? 15 : 18, weight: .bold))
                .foregroundStyle(theme.textPrimary)
                .multilineTextAlignment(.center)

            if !subtitle.isEmpty {
                Text(subtitle)
                    .font(MeeshyFont.relative(compact ? 12 : 14))
                    .foregroundStyle(theme.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, MeeshySpacing.xxxl)
            }

            if let actionLabel, let onAction, !compact {
                actionButton(label: actionLabel, action: onAction)
                    .padding(.top, MeeshySpacing.xs)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .opacity(appeared ? 1 : 0)
        .offset(y: Self.entryOffset(appeared: appeared, reduceMotion: reduceMotion))
        .onAppear {
            meeshyWithAnimation(
                MeeshyAnimation.springDefault.delay(0.15),
                reduced: MeeshyMotion.reducedFade,
                reduceMotion: reduceMotion
            ) {
                appeared = true
            }
        }
    }

    private func actionButton(label: String, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            Text(label)
                .font(MeeshyFont.relative(compact ? 13 : 14, weight: .semibold))
                .foregroundStyle(Color.white)
                .padding(.horizontal, compact ? MeeshySpacing.lg : MeeshySpacing.xxl)
                .padding(.vertical, compact ? MeeshySpacing.sm : MeeshySpacing.md)
                .background(
                    Capsule()
                        .fill(Color(hex: accentColor))
                )
        }
    }
}
